"""Service base de données — Phase 4 : radar, altitude filtrée, stats de zone.

Ce module implémente toutes les opérations SQL sur la table aircraft_traces.
Les requêtes PostGIS utilisent du SQL textuel via sqlalchemy.text() pour
accéder aux fonctions spatiales (ST_Collect, ST_Envelope, ST_Intersects, etc.).

Nouveautés Phase 4 :
    - Colonne `radar` importée depuis le CSV et retournée dans les emprises.
    - Filtre par liste de radars dans les emprises et le filtrage.
    - Filtre par plage d'altitude sur les traces (champ `dimmed`).
    - Fonction `get_zone_statistics` pour les stats d'une zone géographique.
"""

from __future__ import annotations

from datetime import datetime
import io
import json
import logging
import math
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.filter_request import CsvFilterRequest, ZoneCercle, ZoneRectangle, Zone

logger = logging.getLogger(__name__)

# Taille d'un batch d'insertion
_BATCH_SIZE = 1000


# ─── Import ───────────────────────────────────────────────────────────────────


async def import_csv_to_db(
    df: pd.DataFrame,
    session: AsyncSession,
) -> dict[str, int]:
    """Insère les traces d'un DataFrame dans la table aircraft_traces.

    Utilise des batchs de 1000 lignes pour éviter les timeouts et la
    surcharge mémoire. Les coordonnées sont converties en géométrie PostGIS
    via ST_SetSRID(ST_MakePoint(longitude, latitude), 4326).

    Vérifie également qu'aucun vol du CSV n'existe déjà dans la base pour
    éviter de polluer les emprises avec des vols doublons.

    Args:
        df:      DataFrame validé (colonnes: flight_id, latitude, longitude, ts, altitude, radar).
        session: Session SQLAlchemy async.

    Returns:
        dict avec les clés "inserted" et "skipped".

    Raises:
        ValueError: Si un ou plusieurs vols du CSV existent déjà en base de données.
    """
    # Safeguard: Vérifier si certains vols existent déjà en base
    vols_dans_csv = [str(fid)[:16] for fid in df["flight_id"].unique()]
    if vols_dans_csv:
        result_existing = await session.execute(
            text("SELECT DISTINCT flight_id FROM aircraft_traces WHERE flight_id = ANY(:vols)"),
            {"vols": vols_dans_csv}
        )
        existing_vols = [row[0] for row in result_existing.fetchall()]
        if existing_vols:
            vols_str = ", ".join(existing_vols)
            raise ValueError(
                f"Certains vols existent déjà en base de données : {vols_str}. "
                f"Veuillez les supprimer via l'onglet de gestion avant de les réimporter."
            )

    rows = df.to_dict(orient="records")
    total = len(rows)
    inserted = 0

    insert_sql = text(
        """
        INSERT INTO aircraft_traces (flight_id, ts, altitude, radar, geom)
        VALUES (
            :flight_id,
            :ts,
            :altitude,
            :radar,
            ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
        )
        """
    )

    for i in range(0, total, _BATCH_SIZE):
        batch = rows[i : i + _BATCH_SIZE]
        params = [
            {
                "flight_id": str(row["flight_id"])[:16],
                "ts": row["ts"],
                "altitude": int(row["altitude"]) if pd.notna(row.get("altitude")) else None,
                "radar": str(row["radar"])[:64] if pd.notna(row.get("radar")) else None,
                "longitude": float(row["longitude"]),
                "latitude": float(row["latitude"]),
            }
            for row in batch
        ]
        await session.execute(insert_sql, params)
        inserted += len(batch)
        logger.debug("Import batch %d/%d inséré", i + len(batch), total)

    await session.commit()
    logger.info("Import terminé : %d/%d lignes insérées", inserted, total)
    return {"inserted": inserted, "skipped": total - inserted}


# ─── Stats ────────────────────────────────────────────────────────────────────


async def get_db_stats(session: AsyncSession) -> dict[str, Any]:
    """Retourne les statistiques globales de la base de données.

    Returns:
        dict avec total_traces, total_flights, date_range (min/max ISO),
        alt_min, alt_max (altitude globale min/max pour borner les sliders).
    """
    result = await session.execute(
        text(
            """
            SELECT
                COUNT(*)                                AS total_traces,
                COUNT(DISTINCT flight_id)               AS total_flights,
                MIN(ts) AT TIME ZONE 'UTC'              AS ts_min,
                MAX(ts) AT TIME ZONE 'UTC'              AS ts_max,
                MIN(altitude)                           AS alt_min,
                MAX(altitude)                           AS alt_max
            FROM aircraft_traces
            """
        )
    )
    row = result.mappings().one_or_none()

    if not row or row["total_traces"] == 0:
        return {
            "total_traces": 0,
            "total_flights": 0,
            "date_range": None,
            "alt_min": None,
            "alt_max": None,
        }

    return {
        "total_traces": int(row["total_traces"]),
        "total_flights": int(row["total_flights"]),
        "date_range": {
            "min": row["ts_min"].isoformat() if row["ts_min"] else None,
            "max": row["ts_max"].isoformat() if row["ts_max"] else None,
        },
        "alt_min": int(row["alt_min"]) if row["alt_min"] is not None else None,
        "alt_max": int(row["alt_max"]) if row["alt_max"] is not None else None,
    }


# ─── Radars disponibles ───────────────────────────────────────────────────────


async def get_available_radars(session: AsyncSession) -> list[str]:
    """Retourne la liste des valeurs distinctes de radar présentes dans la table.

    Returns:
        Liste triée des identifiants de radars.
    """
    result = await session.execute(
        text(
            "SELECT DISTINCT radar FROM aircraft_traces "
            "WHERE radar IS NOT NULL ORDER BY radar"
        )
    )
    return [row[0] for row in result.fetchall()]


# ─── Emprises (Bounding Boxes) ────────────────────────────────────────────────


async def get_flight_bounding_boxes(
    date_debut: datetime | None,
    date_fin: datetime | None,
    session: AsyncSession,
    radars: list[str] | None = None,
) -> list[dict]:
    """Calcule et retourne l'emprise spatiale de chaque vol.

    L'emprise (Bounding Box) est le rectangle minimal englobant tous les
    points d'un vol, calculé par PostGIS via ST_Envelope(ST_Collect(geom)).
    Optionnellement filtré par date de début/fin et par liste de radars.

    Returns:
        Liste de features GeoJSON (type Polygon) avec propriétés :
        flight_id, alt_min, alt_max, ts_debut, ts_fin, nb_points, radars.
    """
    where_clauses = []
    params: dict[str, Any] = {}

    if date_debut:
        where_clauses.append("ts >= :date_debut")
        params["date_debut"] = date_debut
    if date_fin:
        where_clauses.append("ts <= :date_fin")
        params["date_fin"] = date_fin
    if radars:
        where_clauses.append("radar = ANY(:radars)")
        params["radars"] = radars

    where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    query = f"""
        SELECT
            flight_id,
            ST_AsGeoJSON(
                ST_Envelope(ST_Collect(geom))
            )::json                                          AS bbox_geojson,
            MIN(altitude)                                    AS alt_min,
            MAX(altitude)                                    AS alt_max,
            MIN(ts) AT TIME ZONE 'UTC'                       AS ts_debut,
            MAX(ts) AT TIME ZONE 'UTC'                       AS ts_fin,
            COUNT(*)                                         AS nb_points,
            ARRAY_AGG(DISTINCT radar)
                FILTER (WHERE radar IS NOT NULL)             AS radars
        FROM aircraft_traces
        {where_str}
        GROUP BY flight_id
        ORDER BY flight_id
    """

    result = await session.execute(text(query), params)
    rows = result.mappings().all()

    features = []
    for row in rows:
        geom = row["bbox_geojson"]
        if isinstance(geom, str):
            geom = json.loads(geom)

        features.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "flight_id": row["flight_id"],
                    "alt_min": int(row["alt_min"]) if row["alt_min"] is not None else None,
                    "alt_max": int(row["alt_max"]) if row["alt_max"] is not None else None,
                    "ts_debut": row["ts_debut"].isoformat() if row["ts_debut"] else None,
                    "ts_fin": row["ts_fin"].isoformat() if row["ts_fin"] else None,
                    "nb_points": int(row["nb_points"]),
                    "radars": list(row["radars"]) if row["radars"] else [],
                },
            }
        )

    logger.info("get_flight_bounding_boxes : %d emprises retournées", len(features))
    return features


# ─── Construction des zones de filtre en SQL PostGIS ─────────────────────────


def _build_zone_geometry_sql(zone: ZoneRectangle | ZoneCercle, index: int) -> tuple[str, dict]:
    """Construit le fragment SQL PostGIS pour une zone de filtre.

    Pour les rectangles : ST_MakeEnvelope(lon_min, lat_min, lon_max, lat_max, 4326)
      (ou ST_Rotate(ST_MakeEnvelope(...), rotation, centre) si rotation non nulle)
    Pour les cercles : ST_Buffer sur le type geography puis cast en geometry
      (distance en mètres sur l'ellipsoïde WGS84 — plus précis qu'un buffer planaire)

    Args:
        zone:  Zone de filtre (rectangle ou cercle).
        index: Index pour namespacing des paramètres SQL.

    Returns:
        Tuple (fragment_sql, params_dict).
    """
    if zone.type == "rectangle":
        rotation = getattr(zone, "rotation", 0.0) or 0.0
        if rotation != 0.0:
            lon_center = (zone.lon_min + zone.lon_max) / 2.0
            lat_center = (zone.lat_min + zone.lat_max) / 2.0
            sql = (
                f"ST_Rotate("
                f"  ST_MakeEnvelope(:lon_min_{index}, :lat_min_{index}, :lon_max_{index}, :lat_max_{index}, 4326),"
                f"  :rot_rad_{index},"
                f"  ST_SetSRID(ST_MakePoint(:lon_center_{index}, :lat_center_{index}), 4326)"
                f")"
            )
            params = {
                f"lon_min_{index}": zone.lon_min,
                f"lat_min_{index}": zone.lat_min,
                f"lon_max_{index}": zone.lon_max,
                f"lat_max_{index}": zone.lat_max,
                f"rot_rad_{index}": math.radians(rotation),
                f"lon_center_{index}": lon_center,
                f"lat_center_{index}": lat_center,
            }
        else:
            sql = (
                f"ST_MakeEnvelope(:lon_min_{index}, :lat_min_{index}, "
                f":lon_max_{index}, :lat_max_{index}, 4326)"
            )
            params = {
                f"lon_min_{index}": zone.lon_min,
                f"lat_min_{index}": zone.lat_min,
                f"lon_max_{index}": zone.lon_max,
                f"lat_max_{index}": zone.lat_max,
            }
    else:
        # Cercle : buffer géodésique (geography) → reconversion en geometry (4326)
        sql = (
            f"ST_Buffer("
            f"  ST_SetSRID(ST_MakePoint(:lon_{index}, :lat_{index}), 4326)::geography,"
            f"  :rayon_m_{index}"
            f")::geometry"
        )
        params = {
            f"lon_{index}": zone.lon,
            f"lat_{index}": zone.lat,
            f"rayon_m_{index}": zone.rayon_km * 1000.0,  # km → mètres
        }

    return sql, params


# ─── Filtrage par intersection ────────────────────────────────────────────────


async def filter_intersecting_flights(
    request: CsvFilterRequest,
    session: AsyncSession,
) -> dict[str, Any]:
    """Trouve les vols dont au moins une trace intersecte les zones et/ou la plage de dates spécifiées.

    Construit la requête SQL dynamiquement selon la présence de zones, de dates et de radars.
    """
    all_params: dict[str, Any] = {}
    where_clauses: list[str] = []
    cte_sqls: list[str] = []

    # 1. Gestion des zones (optionnel)
    if request.zones:
        zone_sqls = []
        for i, zone in enumerate(request.zones):
            zone_sql, zone_params = _build_zone_geometry_sql(zone, i)
            zone_sqls.append(zone_sql)
            all_params.update(zone_params)

        if len(zone_sqls) == 1:
            union_sql = zone_sqls[0]
        else:
            union_sql = f"ST_Union(ARRAY[{', '.join(zone_sqls)}])"

        cte_sqls.append(f"filter_zone AS (SELECT {union_sql} AS geom)")

        # Filtre spatial précis sur les points individuels
        zone_where = ["ST_Intersects(t.geom, fz.geom)"]
        if request.date_debut:
            zone_where.append("t.ts >= :date_debut")
        if request.date_fin:
            zone_where.append("t.ts <= :date_fin")
        # Filtre radar dans l'intersection spatiale
        if request.radars:
            zone_where.append("t.radar = ANY(:radars_filter)")
            all_params["radars_filter"] = request.radars

        cte_sqls.append(
            f"""
            intersecting_flights AS (
                SELECT DISTINCT t.flight_id
                FROM aircraft_traces t, filter_zone fz
                WHERE {" AND ".join(zone_where)}
            )
            """
        )
        where_clauses.append("fe.flight_id IN (SELECT flight_id FROM intersecting_flights)")

    # 2. Gestion des dates (optionnel) - au niveau du vol global
    if request.date_debut:
        where_clauses.append("fe.ts_fin >= :date_debut")
        all_params["date_debut"] = request.date_debut
    if request.date_fin:
        where_clauses.append("fe.ts_debut <= :date_fin")
        all_params["date_fin"] = request.date_fin

    # 3. Filtre radar sans zone géographique
    if request.radars and not request.zones:
        where_clauses.append("fe.flight_id IN ("
                             "SELECT DISTINCT flight_id FROM aircraft_traces "
                             "WHERE radar = ANY(:radars_filter))")
        all_params["radars_filter"] = request.radars

    # 4. Construction des clauses SQL
    cte_emprises = """
        flight_emprises AS (
            SELECT
                flight_id,
                ST_Envelope(ST_Collect(geom))  AS emprise,
                MIN(ts)                         AS ts_debut,
                MAX(ts)                         AS ts_fin
            FROM aircraft_traces
            GROUP BY flight_id
        )
    """

    all_ctes = [cte_emprises] + cte_sqls
    cte_clause = "WITH " + ",\n".join(all_ctes)

    from_clause = "FROM flight_emprises fe"

    where_clause = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

    query = text(
        f"""
        {cte_clause}
        SELECT fe.flight_id
        {from_clause}
        {where_clause}
        ORDER BY fe.flight_id
        """
    )

    result = await session.execute(query, all_params)
    flight_ids = [row[0] for row in result.fetchall()]

    logger.info(
        "filter_intersecting_flights : %d vols retenus (zones=%d, dates=%s, radars=%s)",
        len(flight_ids),
        len(request.zones),
        "oui" if (request.date_debut or request.date_fin) else "non",
        f"{len(request.radars)} radars" if request.radars else "tous",
    )
    return {"count": len(flight_ids), "flight_ids": flight_ids}


# ─── Export des traces brutes ─────────────────────────────────────────────────


async def export_intersecting_flights(
    request: CsvFilterRequest,
    session: AsyncSession,
) -> bytes:
    """Exporte en CSV toutes les traces des vols intersectant les zones de filtre.

    COMPORTEMENT INCLUSIF : pour chaque vol retenu, on exporte TOUTES ses traces
    (y compris les points situés en dehors de la zone de filtre). Cela permet une
    analyse de trajectoire complète.

    Args:
        request: Requête de filtrage.
        session: Session SQLAlchemy async.

    Returns:
        Bytes du fichier CSV UTF-8.
    """
    # Récupérer d'abord les flight_ids retenus
    filter_result = await filter_intersecting_flights(request, session)
    flight_ids = filter_result["flight_ids"]

    if not flight_ids:
        # Retourner un CSV vide avec entête
        return b"flight_id,latitude,longitude,ts,altitude,radar\n"

    # Exporter toutes les traces de ces vols (sans filtre spatial)
    result = await session.execute(
        text(
            """
            SELECT
                flight_id,
                ST_Y(geom)  AS latitude,
                ST_X(geom)  AS longitude,
                ts,
                altitude,
                radar
            FROM aircraft_traces
            WHERE flight_id = ANY(:flight_ids)
            ORDER BY flight_id, ts
            """
        ),
        {"flight_ids": flight_ids},
    )

    rows = result.mappings().all()

    df = pd.DataFrame(
        [
            {
                "flight_id": r["flight_id"],
                "latitude": float(r["latitude"]),
                "longitude": float(r["longitude"]),
                "ts": r["ts"].isoformat() if r["ts"] else "",
                "altitude": r["altitude"],
                "radar": r["radar"],
            }
            for r in rows
        ]
    )

    logger.info(
        "export_intersecting_flights : %d traces pour %d vols",
        len(df),
        len(flight_ids),
    )
    return df.to_csv(index=False).encode("utf-8")


async def get_flight_traces(
    flight_ids: list[str],
    date_debut: datetime | None,
    date_fin: datetime | None,
    session: AsyncSession,
    alt_min: float | None = None,
    alt_max: float | None = None,
    zones: list[Zone] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Récupère les traces (points) ordonnées chronologiquement pour les vols spécifiés.

    Chaque point possède un champ `dimmed` (bool) :
        - False : point dans la plage d'altitude du filtre ET dans l'une des zones actives
        - True  : point hors plage d'altitude OU en dehors des zones actives (affiché sobrement)

    Les vols dont AUCUN point n'est valide sont exclus du résultat.

    Args:
        flight_ids: Liste des identifiants de vol.
        date_debut: Date de début optionnelle.
        date_fin:   Date de fin optionnelle.
        alt_min:    Altitude minimale du filtre (optionnel).
        alt_max:    Altitude maximale du filtre (optionnel).
        zones:      Zones géographiques actives (optionnel).
        session:    Session SQLAlchemy async.

    Returns:
        Dictionnaire associant chaque flight_id à sa liste de points
        (latitude, longitude, ts, altitude, dimmed).
    """
    if not flight_ids:
        return {}

    params: dict[str, Any] = {"flight_ids": flight_ids}
    select_in_zone = ""

    if zones:
        zone_sqls = []
        for i, zone in enumerate(zones):
            zone_sql, zone_params = _build_zone_geometry_sql(zone, i)
            zone_sqls.append(zone_sql)
            params.update(zone_params)

        if len(zone_sqls) == 1:
            union_sql = zone_sqls[0]
        else:
            union_sql = f"ST_Union(ARRAY[{', '.join(zone_sqls)}])"

        select_in_zone = f", ST_Within(geom, ({union_sql})) AS in_zone"
    else:
        select_in_zone = ", TRUE AS in_zone"

    query_str = f"""
        SELECT
            flight_id,
            ST_Y(geom)  AS latitude,
            ST_X(geom)  AS longitude,
            ts,
            altitude
            {select_in_zone}
        FROM aircraft_traces
        WHERE flight_id = ANY(:flight_ids)
    """

    if date_debut:
        query_str += " AND ts >= :date_debut"
        params["date_debut"] = date_debut

    if date_fin:
        query_str += " AND ts <= :date_fin"
        params["date_fin"] = date_fin

    query_str += " ORDER BY flight_id, ts"

    result = await session.execute(text(query_str), params)
    rows = result.mappings().all()

    traces: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        fid = r["flight_id"]
        if fid not in traces:
            traces[fid] = []

        altitude = int(r["altitude"]) if r["altitude"] is not None else None
        in_zone = bool(r["in_zone"])

        # Calcul du flag dimmed selon la plage d'altitude
        dimmed = False
        if alt_min is not None or alt_max is not None:
            if altitude is None:
                dimmed = True
            else:
                if alt_min is not None and altitude < alt_min:
                    dimmed = True
                if alt_max is not None and altitude > alt_max:
                    dimmed = True

        if not in_zone:
            dimmed = True

        traces[fid].append(
            {
                "latitude": float(r["latitude"]),
                "longitude": float(r["longitude"]),
                "ts": r["ts"].isoformat() if r["ts"] else "",
                "altitude": altitude,
                "dimmed": dimmed,
                "in_zone": in_zone,
            }
        )

    # Exclure les vols où tous les points sont dimmed (aucun point valide dans la plage ou les zones)
    if alt_min is not None or alt_max is not None or zones:
        traces = {
            fid: pts for fid, pts in traces.items()
            if any(not p["dimmed"] for p in pts)
        }

    logger.info(
        "get_flight_traces : traces chargées pour %d vols (%d points au total)",
        len(traces),
        sum(len(pts) for pts in traces.values()),
    )
    return traces


async def get_flights_management(
    query: str | None,
    limit: int,
    offset: int,
    session: AsyncSession,
    date_debut: datetime | None = None,
    date_fin: datetime | None = None,
    alt_min: float | None = None,
    alt_max: float | None = None,
    radars: list[str] | None = None,
    zones: list[Zone] | None = None,
) -> dict[str, Any]:
    """Récupère la liste des vols distincts avec statistiques pour la gestion."""
    where_clauses = []
    params: dict[str, Any] = {"limit": limit, "offset": offset}

    if query:
        where_clauses.append("flight_id ILIKE :query")
        params["query"] = f"%{query}%"

    if date_debut:
        where_clauses.append("ts >= :date_debut")
        params["date_debut"] = date_debut

    if date_fin:
        where_clauses.append("ts <= :date_fin")
        params["date_fin"] = date_fin

    if alt_min is not None:
        where_clauses.append("altitude >= :alt_min")
        params["alt_min"] = alt_min

    if alt_max is not None:
        where_clauses.append("altitude <= :alt_max")
        params["alt_max"] = alt_max

    if radars:
        where_clauses.append("radar = ANY(:radars)")
        params["radars"] = radars

    if zones:
        zone_sqls = []
        for i, zone in enumerate(zones):
            zone_sql, zone_params = _build_zone_geometry_sql(zone, i)
            zone_sqls.append(zone_sql)
            params.update(zone_params)

        if len(zone_sqls) == 1:
            union_sql = zone_sqls[0]
        else:
            union_sql = f"ST_Union(ARRAY[{', '.join(zone_sqls)}])"

        where_clauses.append(f"ST_Within(geom, ({union_sql}))")

    where_str = " AND ".join(where_clauses)
    if where_str:
        where_str = "WHERE " + where_str

    # 1. Compter le nombre de vols correspondant à la recherche
    count_sql = f"SELECT COUNT(DISTINCT flight_id) FROM aircraft_traces {where_str}"
    count_result = await session.execute(text(count_sql), params)
    total_count = count_result.scalar() or 0

    # 2. Récupérer les données statistiques par vol
    sql = f"""
        SELECT
            flight_id,
            COUNT(*) AS point_count,
            MIN(ts) AS ts_start,
            MAX(ts) AS ts_end,
            MIN(altitude) AS alt_min,
            MAX(altitude) AS alt_max
        FROM aircraft_traces
        {where_str}
        GROUP BY flight_id
        ORDER BY flight_id
        LIMIT :limit OFFSET :offset
    """
    data_result = await session.execute(text(sql), params)
    rows = data_result.mappings().all()

    flights = []
    for r in rows:
        flights.append({
            "flight_id": r["flight_id"],
            "point_count": int(r["point_count"]),
            "ts_start": r["ts_start"],
            "ts_end": r["ts_end"],
            "alt_min": int(r["alt_min"]) if r["alt_min"] is not None else None,
            "alt_max": int(r["alt_max"]) if r["alt_max"] is not None else None,
        })

    logger.info("get_flights_management : %d vols retournés (total %d)", len(flights), total_count)
    return {"total_count": total_count, "flights": flights}


async def delete_flights_bulk(
    flight_ids: list[str],
    session: AsyncSession,
) -> dict[str, Any]:
    """Supprime toutes les traces pour une liste de vols spécifiée."""
    if not flight_ids:
        return {"deleted": 0}

    result = await session.execute(
        text("DELETE FROM aircraft_traces WHERE flight_id = ANY(:flight_ids)"),
        {"flight_ids": flight_ids}
    )
    await session.commit()

    logger.info("delete_flights_bulk : %d traces supprimées pour les vols %s", result.rowcount, flight_ids)
    return {"deleted": result.rowcount}


async def purge_database(session: AsyncSession) -> dict[str, Any]:
    """Purge complètement la table des traces d'avions."""
    await session.execute(text("TRUNCATE TABLE aircraft_traces RESTART IDENTITY"))
    await session.commit()
    logger.info("purge_database : table aircraft_traces purgée entièrement")
    return {"status": "success", "message": "Base de données vidée entièrement"}


# ─── Statistiques d'une zone géographique ────────────────────────────────────


async def get_zone_statistics(
    zone: ZoneRectangle | ZoneCercle,
    date_debut: datetime | None,
    date_fin: datetime | None,
    session: AsyncSession,
    radars: list[str] | None = None,
    alt_min: float | None = None,
    alt_max: float | None = None,
) -> dict[str, Any]:
    """Calcule les statistiques agrégées des avions présents dans une zone géographique.

    Args:
        zone:       Zone géographique (rectangle ou cercle).
        date_debut: Filtre temporel début (optionnel).
        date_fin:   Filtre temporel fin (optionnel).
        session:    Session SQLAlchemy async.
        radars:     Liste des radars à inclure (optionnel).
        alt_min:    Altitude minimale du filtre (optionnel).
        alt_max:    Altitude maximale du filtre (optionnel).

    Returns:
        dict avec :
            nb_flights  : nombre de vols distincts ayant au moins 1 point dans la zone
            nb_points   : nombre total de points dans la zone
            flight_ids  : liste des flight_id (triés)
            alt_min     : altitude minimale des points dans la zone
            alt_max     : altitude maximale des points dans la zone
            alt_avg     : altitude moyenne des points dans la zone
            radars      : liste des radars distincts présents dans la zone
            ts_debut    : timestamp du premier point dans la zone (ISO)
            ts_fin      : timestamp du dernier point dans la zone (ISO)
    """
    zone_sql, zone_params = _build_zone_geometry_sql(zone, 0)

    where_clauses = [f"ST_Within(t.geom, ({zone_sql}))"]
    all_params: dict[str, Any] = dict(zone_params)

    if date_debut:
        where_clauses.append("t.ts >= :date_debut")
        all_params["date_debut"] = date_debut
    if date_fin:
        where_clauses.append("t.ts <= :date_fin")
        all_params["date_fin"] = date_fin
    if radars:
        where_clauses.append("t.radar = ANY(:radars)")
        all_params["radars"] = radars
    if alt_min is not None:
        where_clauses.append("t.altitude >= :alt_min")
        all_params["alt_min"] = alt_min
    if alt_max is not None:
        where_clauses.append("t.altitude <= :alt_max")
        all_params["alt_max"] = alt_max

    where_str = " AND ".join(where_clauses)

    query = f"""
        SELECT
            COUNT(DISTINCT t.flight_id)                        AS nb_flights,
            COUNT(*)                                           AS nb_points,
            ARRAY_AGG(DISTINCT t.flight_id ORDER BY t.flight_id) AS flight_ids,
            MIN(t.altitude)                                    AS alt_min,
            MAX(t.altitude)                                    AS alt_max,
            AVG(t.altitude)                                    AS alt_avg,
            ARRAY_AGG(DISTINCT t.radar)
                FILTER (WHERE t.radar IS NOT NULL)             AS radars,
            MIN(t.ts) AT TIME ZONE 'UTC'                       AS ts_debut,
            MAX(t.ts) AT TIME ZONE 'UTC'                       AS ts_fin
        FROM aircraft_traces t
        WHERE {where_str}
    """

    result = await session.execute(text(query), all_params)
    row = result.mappings().one_or_none()

    if not row or row["nb_points"] == 0:
        return {
            "nb_flights": 0,
            "nb_points": 0,
            "flight_ids": [],
            "alt_min": None,
            "alt_max": None,
            "alt_avg": None,
            "radars": [],
            "ts_debut": None,
            "ts_fin": None,
        }

    return {
        "nb_flights": int(row["nb_flights"]),
        "nb_points": int(row["nb_points"]),
        "flight_ids": list(row["flight_ids"]) if row["flight_ids"] else [],
        "alt_min": int(row["alt_min"]) if row["alt_min"] is not None else None,
        "alt_max": int(row["alt_max"]) if row["alt_max"] is not None else None,
        "alt_avg": round(float(row["alt_avg"]), 0) if row["alt_avg"] is not None else None,
        "radars": list(row["radars"]) if row["radars"] else [],
        "ts_debut": row["ts_debut"].isoformat() if row["ts_debut"] else None,
        "ts_fin": row["ts_fin"].isoformat() if row["ts_fin"] else None,
    }
