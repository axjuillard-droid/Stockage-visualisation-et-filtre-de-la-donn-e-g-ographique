# Phase 3 — Mode Base de Données (PostGIS)

> **Date de livraison :** 10 juin 2026  
> **Statut :** ✅ Terminée — 8/8 tests d'intégration passent

---

## Contexte

La Phase 2 traitait les traces d'avions **en mémoire vive** à partir d'un fichier CSV uploadé.  
La Phase 3 ajoute un second mode de fonctionnement : les données sont **persistées dans PostgreSQL/PostGIS** et les zones géographiques sont calculées côté base de données via des fonctions spatiales natives.

Les deux modes coexistent. Un **toggle dans le header** (`📄 Mode CSV` / `🗄️ Mode BDD`) permet de basculer sans perte d'état.

---

## Vocabulaire clé

| Terme | Définition |
|-------|------------|
| **Emprise de vol** *(Bounding Box)* | Rectangle calculé **automatiquement** par PostGIS, représentant les limites géographiques extrêmes d'un vol entier (`flight_id`). Calculé par `ST_Envelope(ST_Collect(geom))`. |
| **Zone de filtre** | Forme géométrique (**rectangle ou cercle**) définie **manuellement** par l'utilisateur (dessin Leaflet ou saisie de coordonnées). |

---

## Architecture ajoutée

```
backend/
  app/
    services/
      db_service.py          ← NOUVEAU : toute la logique SQL PostGIS
    routers/
      db_router.py           ← MODIFIÉ : 5 routes (était vide en Phase 1)
  tests/
    test_db_service.py       ← NOUVEAU : 8 tests d'intégration

frontend/src/
  hooks/
    useDbMode.ts             ← NOUVEAU : état du mode BDD
  components/
    DbConnector.tsx          ← NOUVEAU : import CSV + stats BDD
    BoundingBoxLayer.tsx     ← NOUVEAU : rendu des emprises sur la carte
    ZoneManualForm.tsx       ← NOUVEAU : saisie manuelle de zones
    MapView.tsx              ← MODIFIÉ : supporte les deux modes
  lib/
    api.ts                   ← MODIFIÉ : 5 nouvelles fonctions BDD
  types/
    index.ts                 ← MODIFIÉ : DbStats, FlightBoundingBox, DbFilterResult…
  App.tsx                    ← MODIFIÉ : toggle mode + panneaux conditionnels
```

---

## Backend — API Routes

### `POST /api/db/import`

Importe un fichier CSV dans la table `aircraft_traces`.

**Requête**
```
Content-Type: multipart/form-data
file: <fichier.csv>
```

**Implémentation**  
Réutilise `parse_csv()` du mode CSV pour la validation, puis insère en batches de 1 000 lignes via :
```sql
INSERT INTO aircraft_traces (flight_id, ts, altitude, geom)
VALUES (:flight_id, :ts, :altitude, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
```

**Réponse 200**
```json
{ "inserted": 15420, "skipped": 0 }
```

---

### `GET /api/db/stats`

Retourne les statistiques globales de la table.

**Réponse 200**
```json
{
  "total_traces": 15420,
  "total_flights": 42,
  "date_range": {
    "min": "2024-01-01T08:00:00+00:00",
    "max": "2024-01-31T23:59:00+00:00"
  }
}
```

---

### `GET /api/db/emprises`

Calcule l'emprise spatiale de chaque vol et retourne une GeoJSON FeatureCollection.

**SQL clé**
```sql
SELECT
    flight_id,
    ST_AsGeoJSON(ST_Envelope(ST_Collect(geom)))::json AS bbox_geojson,
    MIN(altitude) AS alt_min,
    MAX(altitude) AS alt_max,
    MIN(ts) AS ts_debut,
    MAX(ts) AS ts_fin,
    COUNT(*) AS nb_points
FROM aircraft_traces
GROUP BY flight_id
```

**Réponse 200** — chaque feature contient :

| Propriété | Type | Description |
|-----------|------|-------------|
| `flight_id` | string | Identifiant du vol |
| `alt_min` | int \| null | Altitude minimale (pieds) |
| `alt_max` | int \| null | Altitude maximale (pieds) |
| `ts_debut` | ISO string | Premier point horodaté |
| `ts_fin` | ISO string | Dernier point horodaté |
| `nb_points` | int | Nombre de traces du vol |

---

### `POST /api/db/filter-emprises`

Retourne les vols dont l'emprise **intersecte** au moins une zone de filtre.

**Logique de filtrage**

1. Calcule l'emprise de chaque vol : `ST_Envelope(ST_Collect(geom))`
2. Convertit chaque zone de filtre en géométrie PostGIS :
   - Rectangle → `ST_MakeEnvelope(lon_min, lat_min, lon_max, lat_max, 4326)`
   - Cercle → `ST_Buffer(ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography, rayon_m)::geometry`  
     *(buffer géodésique sur l'ellipsoïde WGS84 — précis quelle que soit la latitude)*
3. Calcule l'union spatiale : `ST_Union(ARRAY[zone1, zone2, ...])`
4. Filtre : `ST_Intersects(emprise_vol, union_zones)`

> **Comportement inclusif** : un vol est retenu même si son emprise ne **touche** la zone que partiellement. Seul l'emprise est testée, pas chaque point individuel.

**Requête (champ de formulaire `request`)**
```json
{
  "date_debut": "2024-01-01T00:00:00Z",
  "date_fin": "2024-01-31T23:59:59Z",
  "zones": [
    { "type": "rectangle", "lat_min": 43.0, "lat_max": 49.0, "lon_min": -2.0, "lon_max": 8.0 }
  ]
}
```

**Réponse 200**
```json
{ "count": 12, "flight_ids": ["AFR1234", "BAW456", "..."] }
```

---

### `POST /api/db/export-emprises`

Exporte en CSV **toutes les traces brutes** des vols retenus par le filtrage.

> **Comportement inclusif** : pour chaque vol retenu, **tous** ses points sont exportés, y compris ceux situés en dehors de la zone de filtre. Cela permet une analyse de trajectoire complète.

**Réponse 200**
```
Content-Type: text/csv
Content-Disposition: attachment; filename=export_emprises.csv
```

Colonnes du CSV : `flight_id, latitude, longitude, ts, altitude`

---

## Frontend — Nouveaux composants

### `DbConnector`

Panneau de connexion à la base de données.

- Zone drag & drop identique à `CsvUploader` mais appelle `POST /api/db/import`
- Après import : affiche les stats (`total_traces`, `total_flights`, plage de dates)
- Bouton **"Charger les emprises"** → appelle `GET /api/db/emprises` et affiche les rectangles sur la carte

### `BoundingBoxLayer`

Couche Leaflet affichant les emprises spatiales.

- Un `<Rectangle>` Leaflet par vol
- Couleur HSL déterministe par `flight_id` (même algorithme que `TraceLayer`)
- `fillOpacity: 0.25` en mode normal
- Surlignage **orange** (`fillOpacity: 0.45`, bordure pleine) si le vol est retenu par le filtre
- **Popup au clic** contenant les 6 informations : `flight_id`, `alt_min`, `alt_max`, `ts_debut`, `ts_fin`, `nb_points`

### `ZoneManualForm`

Formulaire accordéon de saisie manuelle d'une zone rectangulaire.

- 4 champs numériques : `lat_min`, `lat_max`, `lon_min`, `lon_max`
- Auto-correction si min/max inversés
- Validation : coordonnées dans les plages WGS84, surface non nulle
- À la validation : la zone est ajoutée à `useMapZones` et apparaît sur la carte **exactement** comme si elle avait été dessinée à la souris (éditable, supprimable)

---

## Tests d'intégration

Fichier : `backend/tests/test_db_service.py`  
**8 tests**, exécutés contre la base PostgreSQL réelle de l'application.

| Test | Vérifie |
|------|---------|
| `test_import_csv_insere_les_traces` | Nombre de lignes insérées |
| `test_import_csv_verifie_geometrie_postgis` | `ST_X(geom)` / `ST_Y(geom)` corrects |
| `test_get_db_stats_retourne_les_bonnes_cles` | Clés et valeurs minimales |
| `test_get_flight_bounding_boxes_contient_les_6_proprietes` | 6 propriétés + type Polygon |
| `test_filtrage_rectangle_retient_vol_dans_la_zone` | Vol entièrement dans la zone → retenu |
| **`test_filtrage_intersection_partielle_retient_vol`** | **Vol dont l'emprise dépasse la zone → retenu quand même** *(comportement ST_Intersects)* |
| `test_filtrage_vol_hors_zone_est_exclu` | Vol sur Tokyo, zone France → exclu |
| `test_export_retourne_toutes_les_traces_du_vol` | Les 2 traces du vol exportées (incl. le point hors zone) |

**Lancement**
```bash
# Depuis le conteneur backend
python -m pytest tests/test_db_service.py -v
```

> **Note technique** : les tests utilisent `NullPool` (connexion dédiée par test) pour éviter le conflit asyncpg `"cannot perform operation: another operation is in progress"` qui survient lorsque plusieurs sessions partagent une connexion via un pool en mode async.

---

## Flux utilisateur complet (Mode BDD)

```
1. Cliquer "🗄️ Mode BDD" dans le header
        ↓
2. Déposer un CSV → POST /api/db/import → stats affichées
        ↓
3. Cliquer "Charger les emprises" → GET /api/db/emprises → rectangles sur la carte
        ↓
4. Dessiner des zones sur la carte  OU  saisir des coordonnées dans le formulaire
        ↓
5. Choisir la plage de dates
        ↓
6. Cliquer "Filtrer les emprises" → POST /api/db/filter-emprises
   → nombre de vols retenus, emprises surlignées en orange
        ↓
7. (Optionnel) Cliquer "Exporter CSV" → POST /api/db/export-emprises
   → téléchargement CSV de toutes les traces des vols retenus
```

---

## Décisions techniques notables

| Décision | Justification |
|----------|---------------|
| SQL textuel (`text()`) plutôt qu'ORM | Les fonctions PostGIS (`ST_Envelope`, `ST_Intersects`, `ST_Buffer`) ne sont pas disponibles nativement dans l'ORM SQLAlchemy — le SQL brut est plus lisible et maintenable |
| Buffer géodésique (`::geography`) pour les cercles | Un `ST_Buffer` sur le type `geometry` planaire distorsionne les distances aux hautes latitudes. Le cast `geography` calcule sur l'ellipsoïde WGS84 |
| `ST_Intersects` sur les emprises (pas sur les points) | Beaucoup plus rapide : teste 1 rectangle par vol plutôt que N points. Utilise l'index GIST |
| Export inclusif | Un vol retenu → toutes ses traces exportées. L'analyste doit voir la trajectoire complète, même les portions hors zone |
| `NullPool` dans les tests | Asyncpg ne supporte pas `executemany` si une autre opération est en cours sur la même connexion. `NullPool` isole chaque test dans sa propre connexion |
