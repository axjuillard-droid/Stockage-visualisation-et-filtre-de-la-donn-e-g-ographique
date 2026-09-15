"""Tests unitaires pour csv_service.py (parsing de CSV pour import BDD).

Lancement : pytest backend/tests/test_csv_service.py -v
"""

from __future__ import annotations

import pandas as pd
import pytest

from app.services.csv_service import parse_csv

# ─── Fixtures ─────────────────────────────────────────────────────────────────

VALID_CSV = b"""flight_id,latitude,longitude,ts,altitude,radar
AFR1234,48.85,2.35,2024-01-15T10:00:00Z,35000,LFPG
BAW456,43.30,5.38,2024-01-15T11:00:00Z,28000,LFBO
DLH789,51.50,-0.12,2024-01-16T09:00:00Z,32000,LFPO
"""

MISSING_COLUMN_CSV = b"""flight_id,latitude,longitude,ts,altitude
AFR1234,48.85,2.35,2024-01-15T10:00:00Z,35000
"""

INVALID_DATE_CSV = b"""flight_id,latitude,longitude,ts,altitude,radar
AFR1234,48.85,2.35,NOT_A_DATE,35000,LFPG
"""

INVALID_COORDS_CSV = b"""flight_id,latitude,longitude,ts,altitude,radar
AFR1234,999.0,2.35,2024-01-15T10:00:00Z,35000,LFPG
BAW456,48.85,2.35,2024-01-15T11:00:00Z,28000,LFBO
"""


# ─── Tests parse_csv ──────────────────────────────────────────────────────────


class TestParseCsv:
    def test_valid_csv_returns_dataframe(self) -> None:
        """Un CSV valide doit retourner un DataFrame avec 3 lignes."""
        df = parse_csv(VALID_CSV)
        assert len(df) == 3
        assert set(df.columns) >= {"flight_id", "latitude", "longitude", "ts", "altitude", "radar"}

    def test_valid_csv_correct_types(self) -> None:
        """Les colonnes doivent être correctement typées."""
        df = parse_csv(VALID_CSV)
        assert pd.api.types.is_float_dtype(df["latitude"])
        assert pd.api.types.is_float_dtype(df["longitude"])
        assert pd.api.types.is_datetime64_any_dtype(df["ts"])

    def test_missing_columns_raises_value_error(self) -> None:
        """Un CSV avec des colonnes manquantes doit lever ValueError."""
        with pytest.raises(ValueError, match="Colonnes manquantes"):
            parse_csv(MISSING_COLUMN_CSV)

    def test_invalid_date_raises_value_error(self) -> None:
        """Un CSV avec des dates invalides doit lever ValueError."""
        with pytest.raises(ValueError):
            parse_csv(INVALID_DATE_CSV)

    def test_invalid_coordinates_are_filtered(self) -> None:
        """Les lignes avec des coordonnées hors plage doivent être ignorées."""
        df = parse_csv(INVALID_COORDS_CSV)
        # Seule la ligne BAW456 (coords valides) est conservée
        assert len(df) == 1
        assert df.iloc[0]["flight_id"] == "BAW456"

    def test_empty_csv_returns_empty_dataframe(self) -> None:
        """Un CSV sans données doit retourner un DataFrame vide."""
        empty_csv = b"flight_id,latitude,longitude,ts,altitude,radar\n"
        df = parse_csv(empty_csv)
        assert df.empty
