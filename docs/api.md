# API — Documentation des endpoints

## Mode CSV

Les endpoints CSV traitent les traces en mémoire (aucune base de données).
Toutes les routes acceptent des requêtes `multipart/form-data`.

---

### `POST /api/csv/preview`

Analyse un fichier CSV uploadé et retourne ses métadonnées.

**Requête**

```
Content-Type: multipart/form-data

file: <fichier .csv>
```

**Réponse 200**

```json
{
  "total_points": 15420,
  "flights": ["AFR1234", "BAW456"],
  "date_range": {
    "min": "2024-01-01T08:00:00+00:00",
    "max": "2024-01-31T23:59:00+00:00"
  },
  "sample": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Point", "coordinates": [2.35, 48.85] },
        "properties": { "flight_id": "AFR1234", "ts": "2024-01-15T10:23:45+00:00", "altitude": 35000 }
      }
    ]
  }
}
```

**Codes d'erreur**

| Code | Cause |
|------|-------|
| 400  | Colonnes manquantes dans le CSV |
| 400  | Format CSV invalide (ParserError) |
| 400  | Fichier vide ou aucune ligne valide |
| 422  | Validation multipart échouée |
| 500  | Erreur interne inattendue |

**Exemple curl**

```bash
curl -X POST http://localhost/api/csv/preview \
  -F "file=@traces.csv"
```

---

### `POST /api/csv/filter`

Filtre les traces d'un CSV selon des zones géographiques et une plage de dates.

**Requête**

```
Content-Type: multipart/form-data

file:    <fichier .csv>
request: <JSON encodé de CsvFilterRequest>
```

**Format de `request` (JSON)**

```json
{
  "date_debut": "2024-01-01T00:00:00Z",
  "date_fin":   "2024-01-31T23:59:59Z",
  "zones": [
    {
      "type": "rectangle",
      "lat_min": 43.0,
      "lat_max": 49.0,
      "lon_min": -2.0,
      "lon_max": 8.0
    },
    {
      "type": "cercle",
      "lat": 48.85,
      "lon": 2.35,
      "rayon_km": 50
    }
  ]
}
```

**Logique de filtrage**

Un point est retenu s'il vérifie **les deux conditions** :
1. Son timestamp `ts` est dans l'intervalle `[date_debut, date_fin]`
2. Il appartient à **au moins une** zone (union logique — OR)

Pour les cercles : distance calculée via la [formule de Haversine](https://en.wikipedia.org/wiki/Haversine_formula) (rayon terrestre = 6371 km).

**Réponse 200**

Fichier CSV en streaming avec les traces filtrées.

```
Content-Type: text/csv
Content-Disposition: attachment; filename=filtered.csv
```

**Codes d'erreur**

| Code | Cause |
|------|-------|
| 400  | CSV invalide (colonnes manquantes, format incorrect) |
| 422  | JSON `request` invalide (Pydantic) — ex: `date_fin` ≤ `date_debut`, `zones` vide |
| 500  | Erreur interne |

**Exemple curl**

```bash
REQUEST='{"date_debut":"2024-01-01T00:00:00Z","date_fin":"2024-01-31T23:59:59Z","zones":[{"type":"rectangle","lat_min":43.0,"lat_max":49.0,"lon_min":-2.0,"lon_max":8.0}]}'

curl -X POST http://localhost/api/csv/filter \
  -F "file=@traces.csv" \
  -F "request=$REQUEST" \
  --output filtered.csv
```

---

### Format du CSV d'entrée

| Colonne    | Type      | Description |
|------------|-----------|-------------|
| `flight_id`| string    | Identifiant du vol (ex: `AFR1234`) |
| `latitude` | float     | Latitude WGS84 ∈ [-90, 90] |
| `longitude`| float     | Longitude WGS84 ∈ [-180, 180] |
| `ts`       | string    | Timestamp ISO 8601 (ex: `2024-01-15T10:23:45Z`) |
| `altitude` | integer   | Altitude en pieds (peut être vide) |

**Exemple**

```csv
flight_id,latitude,longitude,ts,altitude
AFR1234,48.85,2.35,2024-01-15T10:23:45Z,35000
BAW456,43.30,5.38,2024-01-15T11:05:00Z,28000
```

---

*Section Mode Base de données — à compléter en Phase 3.*
