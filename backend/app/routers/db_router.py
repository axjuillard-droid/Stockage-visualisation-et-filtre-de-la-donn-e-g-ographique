"""Router BDD — Phase 4 : import, stats, emprises, filtrage, export, radars, zone-stats.

Routes :
    POST /api/db/import            — import CSV → PostgreSQL/PostGIS
    GET  /api/db/stats             — statistiques globales de la table
    GET  /api/db/radars            — liste des radars disponibles
    GET  /api/db/emprises          — emprises spatiales de chaque vol (GeoJSON)
    POST /api/db/filter-emprises   — vols dont l'emprise intersecte les zones de filtre
    POST /api/db/export-emprises   — CSV complet des traces des vols retenus
    POST /api/db/traces            — points de traces de vols spécifiques (avec dimmed)
    POST /api/db/zone-stats        — statistiques agrégées d'une zone géographique
    GET  /api/db/management/flights       — liste paginée des vols avec statistiques
    POST /api/db/management/flights/delete — suppression groupée de vols
    POST /api/db/management/purge         — purge complète de la base
"""

from __future__ import annotations

from datetime import datetime
import io
import json
import logging
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from app.database import get_session
from app.schemas.filter_request import CsvFilterRequest
from app.schemas.db_traces_request import DbTracesRequest
from app.schemas.db_management_schemas import FlightsBulkDeleteRequest, FlightsManagementResponse, FlightsManagementRequest
from app.schemas.zone_stats_request import ZoneStatsRequest
from app.services.csv_service import parse_csv
from app.services.db_service import (
    export_intersecting_flights,
    filter_intersecting_flights,
    get_available_radars,
    get_db_stats,
    get_flight_bounding_boxes,
    import_csv_to_db,
    get_flight_traces,
    get_flights_management,
    delete_flights_bulk,
    purge_database,
    get_zone_statistics,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/db", tags=["db"])


# ─── Import ───────────────────────────────────────────────────────────────────


@router.post("/import", summary="Importer un CSV dans PostgreSQL/PostGIS")
async def import_csv(
    file: UploadFile = File(...),
    session=Depends(get_session),
) -> dict:
    """Parse et insère les traces d'un CSV dans la table aircraft_traces.

    Le CSV doit contenir les colonnes : flight_id, latitude, longitude, ts, altitude, radar.

    Args:
        file: Fichier CSV multipart.

    Returns:
        dict avec "inserted" et "skipped".

    Raises:
        HTTPException 400: CSV invalide ou colonnes manquantes.
    """
    file_bytes = await file.read()

    try:
        df = parse_csv(file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if df.empty:
        raise HTTPException(status_code=400, detail="Le fichier CSV ne contient aucune ligne valide.")

    try:
        result = await import_csv_to_db(df, session)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    logger.info("Import BDD : %s", result)
    return result


# ─── Stats ────────────────────────────────────────────────────────────────────


@router.get("/stats", summary="Statistiques globales de la base de données")
async def stats(session=Depends(get_session)) -> dict:
    """Retourne le nombre total de traces, de vols distincts, la plage de dates et les altitudes globales.

    Returns:
        dict avec total_traces, total_flights, date_range, alt_min, alt_max.
    """
    return await get_db_stats(session)


# ─── Radars ───────────────────────────────────────────────────────────────────


@router.get("/radars", summary="Liste des radars disponibles dans la base")
async def get_radars_route(session=Depends(get_session)) -> list[str]:
    """Retourne la liste triée des identifiants de radars présents dans la base.

    Returns:
        Liste de chaînes (ex: ["LFPG", "LFRS", "LFBO"]).
    """
    return await get_available_radars(session)


# ─── Emprises ─────────────────────────────────────────────────────────────────


@router.get("/emprises", summary="Emprises spatiales de chaque vol (Bounding Boxes)")
async def emprises(
    date_debut: str | None = None,
    date_fin: str | None = None,
    radars: list[str] | None = Query(None, description="Filtrer par radar(s)"),
    session=Depends(get_session),
) -> dict:
    """Calcule l'emprise (rectangle minimal) de chaque vol via PostGIS.

    Chaque feature GeoJSON retournée est un Polygon avec les propriétés :
    flight_id, alt_min, alt_max, ts_debut, ts_fin, nb_points, radars.

    Returns:
        GeoJSON FeatureCollection des emprises.
    """
    dt_debut = None
    dt_fin = None
    if date_debut:
        try:
            dt_debut = datetime.fromisoformat(date_debut.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"date_debut invalide : {exc}") from exc
    if date_fin:
        try:
            dt_fin = datetime.fromisoformat(date_fin.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"date_fin invalide : {exc}") from exc

    features = await get_flight_bounding_boxes(dt_debut, dt_fin, session, radars=radars or [])
    return {
        "type": "FeatureCollection",
        "features": features,
        "count": len(features),
    }


# ─── Filtrage ─────────────────────────────────────────────────────────────────


@router.post("/filter-emprises", summary="Vols dont l'emprise intersecte les zones de filtre")
async def filter_emprises_route(
    request: str = Form(...),
    session=Depends(get_session),
) -> dict:
    """Retourne les vols dont l'emprise intersecte au moins une zone de filtre.

    Un vol est retenu même si son emprise ne fait que toucher la zone (ST_Intersects).
    Supporte aussi le filtrage par radar via le champ `radars` du JSON.

    Args:
        request: JSON de CsvFilterRequest (envoyé comme champ de formulaire).

    Returns:
        dict avec "count" et "flight_ids".

    Raises:
        HTTPException 422: Requête invalide.
    """
    try:
        request_data = CsvFilterRequest.model_validate(json.loads(request))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=f"Requête invalide : {exc}") from exc

    return await filter_intersecting_flights(request_data, session)


# ─── Export ───────────────────────────────────────────────────────────────────


@router.post("/export-emprises", summary="Export CSV des traces complètes des vols retenus")
async def export_emprises_route(
    request: str = Form(...),
    session=Depends(get_session),
) -> StreamingResponse:
    """Exporte toutes les traces brutes des vols dont l'emprise intersecte les zones.

    COMPORTEMENT INCLUSIF : toutes les traces d'un vol retenu sont exportées.

    Args:
        request: JSON de CsvFilterRequest (champ de formulaire).

    Returns:
        StreamingResponse CSV — filename: export_emprises.csv

    Raises:
        HTTPException 422: Requête invalide.
    """
    try:
        request_data = CsvFilterRequest.model_validate(json.loads(request))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=f"Requête invalide : {exc}") from exc

    csv_bytes = await export_intersecting_flights(request_data, session)

    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export_emprises.csv"},
    )


# ─── Traces ───────────────────────────────────────────────────────────────────


@router.post("/traces", summary="Récupérer les points de traces de vols spécifiques")
async def get_traces_route(
    request: DbTracesRequest,
    session=Depends(get_session),
) -> dict[str, list[dict]]:
    """Retourne les points de trace ordonnés par vol et par temps.

    Chaque point possède un champ `dimmed` (bool) indiquant si le point est hors
    de la plage d'altitude du filtre (alt_min / alt_max).
    Les vols sans aucun point dans la plage d'altitude sont exclus du résultat.
    """
    return await get_flight_traces(
        flight_ids=request.flight_ids,
        date_debut=request.date_debut,
        date_fin=request.date_fin,
        session=session,
        alt_min=request.alt_min,
        alt_max=request.alt_max,
        zones=request.zones,
    )


# ─── Statistiques de zone ─────────────────────────────────────────────────────


@router.post("/zone-stats", summary="Statistiques agrégées des avions dans une zone géographique")
async def zone_stats_route(
    request: ZoneStatsRequest,
    session=Depends(get_session),
) -> dict:
    """Calcule les statistiques des avions présents dans une zone géographique donnée.

    Returns:
        dict avec nb_flights, nb_points, flight_ids, alt_min, alt_max, alt_avg,
        radars, ts_debut, ts_fin.
    """
    return await get_zone_statistics(
        zone=request.zone,
        date_debut=request.date_debut,
        date_fin=request.date_fin,
        session=session,
        radars=request.radars,
        alt_min=request.alt_min,
        alt_max=request.alt_max,
    )


# ─── Gestion ─────────────────────────────────────────────────────────────────


@router.post("/management/flights", response_model=FlightsManagementResponse, summary="Rechercher et lister les vols avec statistiques")
async def management_flights_route(
    request: FlightsManagementRequest,
    session=Depends(get_session),
) -> dict:
    """Retourne la liste paginée des vols distincts avec agrégats temporels et d'altitude."""
    return await get_flights_management(
        session=session,
        query=request.query,
        date_debut=request.date_debut,
        date_fin=request.date_fin,
        alt_min=request.alt_min,
        alt_max=request.alt_max,
        radars=request.radars,
        zones=request.zones,
        limit=request.limit,
        offset=request.offset,
    )


@router.post("/management/flights/delete", summary="Suppression groupée de vols")
async def management_flights_delete_route(
    request: FlightsBulkDeleteRequest,
    session=Depends(get_session),
) -> dict:
    """Supprime définitivement de la base tous les points des vols spécifiés."""
    return await delete_flights_bulk(
        flight_ids=request.flight_ids,
        session=session,
    )


@router.post("/management/purge", summary="Purger complètement la base de données")
async def management_purge_route(
    session=Depends(get_session),
) -> dict:
    """Vide entièrement la table aircraft_traces."""
    return await purge_database(session=session)
