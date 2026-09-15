"""Tests d'intégration pour db_service.py — Phase 3.

Utilise psycopg2 (synchrone) pour le nettoyage/setup et asyncpg via SQLAlchemy
pour tester les fonctions du service. Évite les conflits asyncpg "operation in progress".

Lancement dans le conteneur :
    pytest tests/test_db_service.py -v
"""

from __future__ import annotations

import io
from datetime import datetime, timezone

import pandas as pd
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.schemas.filter_request import CsvFilterRequest, ZoneRectangle
from app.services.db_service import (
    export_intersecting_flights,
    filter_intersecting_flights,
    get_db_stats,
    get_flight_bounding_boxes,
    import_csv_to_db,
    get_flight_traces,
    get_flights_management,
    delete_flights_bulk,
    purge_database,
)

pytestmark = pytest.mark.asyncio(mode="auto")

# ─── Constante de préfixe pour isoler les données de test ─────────────────────
_TEST_FLIGHT_PREFIX = "TEST_INTEG_"


# ─── Engine et factory dédiés aux tests (NullPool évite les conflits asyncpg) ─

def _make_test_engine():
    """Crée un engine sans pool pour éviter les conflits de transaction asyncpg."""
    return create_async_engine(settings.database_url, echo=False, poolclass=NullPool)


def _make_test_session(engine) -> AsyncSession:
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    return factory()


# ─── Utilitaires de test ───────────────────────────────────────────────────────

def _make_df(rows: list[dict]) -> pd.DataFrame:
    """Construit un DataFrame de test compatible avec import_csv_to_db."""
    df = pd.DataFrame(rows)
    df["ts"] = pd.to_datetime(df["ts"], format="mixed", utc=True)
    return df


def _make_request(zones: list, debut: str = "2024-01-01T00:00:00Z", fin: str = "2024-12-31T23:59:59Z") -> CsvFilterRequest:
    return CsvFilterRequest(
        date_debut=datetime.fromisoformat(debut.replace("Z", "+00:00")),
        date_fin=datetime.fromisoformat(fin.replace("Z", "+00:00")),
        zones=zones,
    )


async def _clean_test_data(engine) -> None:
    """Supprime toutes les traces avec le préfixe de test."""
    async with _make_test_session(engine) as session:
        await session.execute(
            text("DELETE FROM aircraft_traces WHERE flight_id LIKE :prefix"),
            {"prefix": f"{_TEST_FLIGHT_PREFIX}%"},
        )
        await session.commit()


# ─── Fixture : engine frais par test ──────────────────────────────────────────

@pytest_asyncio.fixture
async def db_engine():
    """Engine frais (NullPool) pour chaque test — isole complètement les connexions."""
    engine = _make_test_engine()
    await _clean_test_data(engine)
    yield engine
    await _clean_test_data(engine)
    await engine.dispose()


# ─── Tests import ─────────────────────────────────────────────────────────────


async def test_import_csv_insere_les_traces(db_engine):
    """L'import doit insérer les traces dans la base avec le bon nombre."""
    df = _make_df([
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}A1", "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}A1", "latitude": 48.90, "longitude": 2.40, "ts": "2024-01-15T11:00:00Z", "altitude": 35100},
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}B1", "latitude": 43.30, "longitude": 5.38, "ts": "2024-01-16T10:00:00Z", "altitude": 28000},
    ])

    async with _make_test_session(db_engine) as session:
        result = await import_csv_to_db(df, session)

    assert result["inserted"] == 3
    assert result["skipped"] == 0


async def test_import_csv_verifie_geometrie_postgis(db_engine):
    """Les coordonnées doivent être correctement stockées via ST_MakePoint."""
    df = _make_df([
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}GEO", "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": None},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        result = await session.execute(
            text("SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat FROM aircraft_traces WHERE flight_id = :fid"),
            {"fid": f"{_TEST_FLIGHT_PREFIX}GEO"},
        )
        row = result.mappings().one()

    assert abs(float(row["lon"]) - 2.35) < 1e-6
    assert abs(float(row["lat"]) - 48.85) < 1e-6


# ─── Tests stats ──────────────────────────────────────────────────────────────


async def test_get_db_stats_retourne_les_bonnes_cles(db_engine):
    """get_db_stats doit retourner les clés attendues."""
    df = _make_df([
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}S1", "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        stats = await get_db_stats(session)

    assert "total_traces" in stats
    assert "total_flights" in stats
    assert stats["total_traces"] >= 1
    assert stats["total_flights"] >= 1


# ─── Tests emprises ───────────────────────────────────────────────────────────


async def test_get_flight_bounding_boxes_contient_les_6_proprietes(db_engine):
    """Les emprises doivent contenir les 6 propriétés requises par la MISSION."""
    df = _make_df([
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}BB1", "latitude": 48.0, "longitude": 2.0, "ts": "2024-01-15T10:00:00Z", "altitude": 30000},
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}BB1", "latitude": 49.0, "longitude": 3.0, "ts": "2024-01-15T12:00:00Z", "altitude": 32000},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        bboxes = await get_flight_bounding_boxes(None, None, session)

    test_bbox = next(
        (b for b in bboxes if b["properties"]["flight_id"] == f"{_TEST_FLIGHT_PREFIX}BB1"),
        None,
    )
    assert test_bbox is not None, "L'emprise du vol de test doit être présente"

    props = test_bbox["properties"]
    assert props["alt_min"] == 30000
    assert props["alt_max"] == 32000
    assert props["nb_points"] == 2
    assert props["ts_debut"] is not None
    assert props["ts_fin"] is not None
    assert test_bbox["geometry"]["type"] == "Polygon"


# ─── Tests filtrage par intersection ─────────────────────────────────────────


async def test_filtrage_rectangle_retient_vol_dans_la_zone(db_engine):
    """Un vol entièrement dans le rectangle doit être retenu."""
    df = _make_df([
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}RECT1", "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        zone = ZoneRectangle(type="rectangle", lat_min=48.0, lat_max=49.0, lon_min=2.0, lon_max=3.0)
        result = await filter_intersecting_flights(_make_request([zone]), session)

    assert f"{_TEST_FLIGHT_PREFIX}RECT1" in result["flight_ids"]


async def test_filtrage_rectangle_pivote(db_engine):
    """Vérifie que la rotation d'un rectangle dans la base de données fonctionne correctement.
    Un rectangle centré à (0,0) de dimensions lat [-1, 1], lon [-2, 2] tourné de 90 degrés
    devient lat [-2, 2], lon [-1, 1].
    Un point à (1.5, 0.0) est à l'intérieur, tandis qu'un point à (0.0, 1.5) est à l'extérieur.
    """
    fid1 = "TI_ROT_IN"
    fid2 = "TI_ROT_OUT"
    
    # Nettoyage préventif
    engine2 = _make_test_engine()
    async with _make_test_session(engine2) as s:
        await s.execute(
            text("DELETE FROM aircraft_traces WHERE flight_id IN (:fid1, :fid2)"),
            {"fid1": fid1, "fid2": fid2}
        )
        await s.commit()
    await engine2.dispose()

    df = _make_df([
        # Point A : lat=1.5, lon=0.0 -> dans le rectangle pivoté
        {"flight_id": fid1, "latitude": 1.5, "longitude": 0.0, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
        # Point B : lat=0.0, lon=1.5 -> dans le rectangle d'origine, mais hors du rectangle pivoté
        {"flight_id": fid2, "latitude": 0.0, "longitude": 1.5, "ts": "2024-01-15T10:00:00Z", "altitude": 28000},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        zone = ZoneRectangle(
            type="rectangle",
            lat_min=-1.0,
            lat_max=1.0,
            lon_min=-2.0,
            lon_max=2.0,
            rotation=90.0
        )
        result = await filter_intersecting_flights(_make_request([zone]), session)

    assert fid1 in result["flight_ids"]
    assert fid2 not in result["flight_ids"]

    # Nettoyage final
    engine3 = _make_test_engine()
    async with _make_test_session(engine3) as s:
        await s.execute(
            text("DELETE FROM aircraft_traces WHERE flight_id IN (:fid1, :fid2)"),
            {"fid1": fid1, "fid2": fid2}
        )
        await s.commit()
    await engine3.dispose()


async def test_filtrage_intersection_partielle_retient_vol(db_engine):
    """Un vol dont l'emprise DÉPASSE la zone de filtre doit quand même être retenu.

    ST_Intersects retient un vol si son emprise touche la zone,
    même si certains de ses points sont en dehors.

    Note : flight_id limité à 16 caractères par VARCHAR(16) — on utilise "TI_INTER1".
    """
    # "TI_" = abbréviation de TEST_INTEG_ pour rester dans les 16 caractères
    fid = "TI_INTER1"

    # Nettoyage préventif de ce flight_id spécifique
    engine2 = _make_test_engine()
    async with _make_test_session(engine2) as s:
        await s.execute(text("DELETE FROM aircraft_traces WHERE flight_id = :fid"), {"fid": fid})
        await s.commit()
    await engine2.dispose()

    df = _make_df([
        # Paris (dans la zone cible)
        {"flight_id": fid, "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
        # Lyon (hors de la zone cible)
        {"flight_id": fid, "latitude": 45.76, "longitude": 4.83, "ts": "2024-01-15T11:00:00Z", "altitude": 35000},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        # Zone couvrant Paris uniquement (lat 48-49, lon 2-3)
        zone = ZoneRectangle(type="rectangle", lat_min=48.0, lat_max=49.0, lon_min=2.0, lon_max=3.0)
        result = await filter_intersecting_flights(_make_request([zone]), session)

    # L'emprise Paris→Lyon intersecte la zone Paris → retenu
    assert fid in result["flight_ids"], (
        "Un vol dont l'emprise intersecte partiellement la zone doit être retenu (ST_Intersects)"
    )

    # Cleanup final
    engine3 = _make_test_engine()
    async with _make_test_session(engine3) as s:
        await s.execute(text("DELETE FROM aircraft_traces WHERE flight_id = :fid"), {"fid": fid})
        await s.commit()
    await engine3.dispose()


async def test_filtrage_bounding_box_intersection_sans_points_est_exclu(db_engine):
    """Un vol dont l'enveloppe globale (bounding box) croise la zone,
    mais dont aucun point réel n'y touche, ne doit PAS être retenu.
    """
    fid = "TI_BOX_EXCL"
    # Nettoyage préventif
    engine2 = _make_test_engine()
    async with _make_test_session(engine2) as s:
        await s.execute(text("DELETE FROM aircraft_traces WHERE flight_id = :fid"), {"fid": fid})
        await s.commit()
    await engine2.dispose()

    # Vol entre Paris (48.85, 2.35) et Munich (48.13, 11.58).
    # La zone est sur Strasbourg (48.57, 7.75) qui est au milieu.
    # L'enveloppe du vol contient Strasbourg, mais aucun point réel ne s'y trouve.
    df = _make_df([
        {"flight_id": fid, "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
        {"flight_id": fid, "latitude": 48.13, "longitude": 11.58, "ts": "2024-01-15T11:00:00Z", "altitude": 35000},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        # Zone rectangulaire sur Strasbourg : lat [48.5, 48.6], lon [7.7, 7.8]
        zone = ZoneRectangle(type="rectangle", lat_min=48.5, lat_max=48.6, lon_min=7.7, lon_max=7.8)
        result = await filter_intersecting_flights(_make_request([zone]), session)

    # Nettoyage final
    engine3 = _make_test_engine()
    async with _make_test_session(engine3) as s:
        await s.execute(text("DELETE FROM aircraft_traces WHERE flight_id = :fid"), {"fid": fid})
        await s.commit()
    await engine3.dispose()

    assert fid not in result["flight_ids"]


async def test_filtrage_vol_hors_zone_est_exclu(db_engine):
    """Un vol complètement hors de la zone de filtre ne doit pas être retenu."""
    df = _make_df([
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}EXCL1", "latitude": 35.68, "longitude": 139.69, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        zone = ZoneRectangle(type="rectangle", lat_min=43.0, lat_max=51.0, lon_min=-5.0, lon_max=10.0)
        result = await filter_intersecting_flights(_make_request([zone]), session)

    assert f"{_TEST_FLIGHT_PREFIX}EXCL1" not in result["flight_ids"]


async def test_filtrage_optionnel_dates_et_zones(db_engine):
    """Vérifie le filtrage avec uniquement des zones, uniquement des dates, ou les deux."""
    fid = f"{_TEST_FLIGHT_PREFIX}OPT"
    df = _make_df([
        {"flight_id": fid, "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        # 1. Filtre avec uniquement la zone (dates None)
        zone = ZoneRectangle(type="rectangle", lat_min=48.0, lat_max=49.0, lon_min=2.0, lon_max=3.0)
        req_zone_only = CsvFilterRequest(date_debut=None, date_fin=None, zones=[zone])
        res1 = await filter_intersecting_flights(req_zone_only, session)
        assert fid in res1["flight_ids"]

        # 2. Filtre avec uniquement les dates (zones vides)
        req_dates_only = CsvFilterRequest(
            date_debut=datetime.fromisoformat("2024-01-15T09:00:00+00:00"),
            date_fin=datetime.fromisoformat("2024-01-15T11:00:00+00:00"),
            zones=[]
        )
        res2 = await filter_intersecting_flights(req_dates_only, session)
        assert fid in res2["flight_ids"]


async def test_export_retourne_toutes_les_traces_du_vol(db_engine):
    """L'export doit retourner toutes les traces du vol, même hors zone (comportement inclusif)."""
    df = _make_df([
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}EXP1", "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
        {"flight_id": f"{_TEST_FLIGHT_PREFIX}EXP1", "latitude": 45.76, "longitude": 4.83, "ts": "2024-01-15T11:00:00Z", "altitude": 35000},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        zone = ZoneRectangle(type="rectangle", lat_min=48.0, lat_max=49.0, lon_min=2.0, lon_max=3.0)
        csv_bytes = await export_intersecting_flights(_make_request([zone]), session)

    result_df = pd.read_csv(io.BytesIO(csv_bytes))
    test_rows = result_df[result_df["flight_id"] == f"{_TEST_FLIGHT_PREFIX}EXP1"]

    assert len(test_rows) == 2, (
        f"Comportement inclusif : les 2 traces du vol doivent être exportées. Obtenu : {len(test_rows)}"
    )


async def test_get_flight_traces_retourne_les_points_ordonnes(db_engine):
    """get_flight_traces doit retourner les traces ordonnées chronologiquement et supporter le filtre de dates."""
    fid1 = f"{_TEST_FLIGHT_PREFIX}TR1"
    fid2 = f"{_TEST_FLIGHT_PREFIX}TR2"

    df = _make_df([
        {"flight_id": fid1, "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
        {"flight_id": fid1, "latitude": 48.90, "longitude": 2.40, "ts": "2024-01-15T09:00:00Z", "altitude": 34000}, # ts plus ancien
        {"flight_id": fid2, "latitude": 43.30, "longitude": 5.38, "ts": "2024-01-16T10:00:00Z", "altitude": 28000},
    ])

    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        # 1. Récupération simple sans date
        traces = await get_flight_traces([fid1, fid2], None, None, session)
        
        # 2. Récupération avec filtre de dates
        date_debut = datetime.fromisoformat("2024-01-15T09:30:00+00:00")
        traces_filtrees = await get_flight_traces([fid1], date_debut, None, session)

    # Asserts 1
    assert fid1 in traces
    assert fid2 in traces
    assert len(traces[fid1]) == 2
    # Doit être trié par ts : le point à 09:00:00 doit être le premier
    assert traces[fid1][0]["altitude"] == 34000
    assert traces[fid1][1]["altitude"] == 35000
    assert traces[fid2][0]["latitude"] == 43.30

    # Asserts 2 (Filtre date)
    assert fid1 in traces_filtrees
    assert len(traces_filtrees[fid1]) == 1 # le point à 09:00:00 doit être filtré
    assert traces_filtrees[fid1][0]["altitude"] == 35000


async def test_management_db_operations(db_engine):
    """Vérifie le bon fonctionnement des fonctions get_flights_management, delete_flights_bulk et purge_database."""
    fid1 = f"{_TEST_FLIGHT_PREFIX}MNG1"
    fid2 = f"{_TEST_FLIGHT_PREFIX}MNG2"

    df = _make_df([
        {"flight_id": fid1, "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
        {"flight_id": fid1, "latitude": 48.86, "longitude": 2.36, "ts": "2024-01-15T10:05:00Z", "altitude": 36000},
        {"flight_id": fid2, "latitude": 43.30, "longitude": 5.38, "ts": "2024-01-16T10:00:00Z", "altitude": 28000},
    ])

    # 1. Import
    async with _make_test_session(db_engine) as session:
        await import_csv_to_db(df, session)

    async with _make_test_session(db_engine) as session:
        # 2. Test Listing & Recherche
        mng_res = await get_flights_management(query="MNG", limit=10, offset=0, session=session)
        assert mng_res["total_count"] == 2
        assert len(mng_res["flights"]) == 2

        # Vérifier les stats du premier vol (fid1)
        f1_stat = next(f for f in mng_res["flights"] if f["flight_id"] == fid1)
        assert f1_stat["point_count"] == 2
        assert f1_stat["alt_min"] == 35000
        assert f1_stat["alt_max"] == 36000

        # Test Recherche négative
        mng_res_neg = await get_flights_management(query="NONEXISTENT", limit=10, offset=0, session=session)
        assert mng_res_neg["total_count"] == 0

        # 3. Test delete bulk
        del_res = await delete_flights_bulk([fid1], session)
        assert del_res["deleted"] == 2 # 2 points supprimés pour fid1

        # Re-vérifier les vols restants
        mng_res_after = await get_flights_management(query="MNG", limit=10, offset=0, session=session)
        assert mng_res_after["total_count"] == 1
        assert mng_res_after["flights"][0]["flight_id"] == fid2

        # 4. Test Purge globale
        await purge_database(session)

        # Vérifier que tout est vide
        mng_res_empty = await get_flights_management(None, 10, 0, session)
        assert mng_res_empty["total_count"] == 0


async def test_import_csv_duplicate_flight_safeguard(db_engine):
    """L'importation de vols existant déjà en base de données doit être bloquée."""
    fid = f"{_TEST_FLIGHT_PREFIX}DUP"
    df1 = _make_df([
        {"flight_id": fid, "latitude": 48.85, "longitude": 2.35, "ts": "2024-01-15T10:00:00Z", "altitude": 35000},
    ])
    df2 = _make_df([
        {"flight_id": fid, "latitude": 48.90, "longitude": 2.40, "ts": "2024-01-15T11:00:00Z", "altitude": 35100},
    ])

    async with _make_test_session(db_engine) as session:
        # Première importation (succès)
        await import_csv_to_db(df1, session)

    async with _make_test_session(db_engine) as session:
        # Deuxième importation du même flight_id (doit échouer)
        with pytest.raises(ValueError) as exc_info:
            await import_csv_to_db(df2, session)
        assert "déjà en base de données" in str(exc_info.value)

    async with _make_test_session(db_engine) as session:
        # Suppression du vol
        await delete_flights_bulk([fid], session)

    async with _make_test_session(db_engine) as session:
        # Troisième importation après suppression (doit réussir)
        result = await import_csv_to_db(df2, session)
        assert result["inserted"] == 1



