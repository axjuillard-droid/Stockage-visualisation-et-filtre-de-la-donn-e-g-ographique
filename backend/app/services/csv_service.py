"""Service de traitement CSV en mémoire avec Pandas.

Ce module implémente le parsing et la validation des fichiers CSV de traces d'avions.
"""

from __future__ import annotations

import io
import logging

import pandas as pd

logger = logging.getLogger(__name__)

# Colonnes obligatoires dans le CSV d'entrée
REQUIRED_COLUMNS: frozenset[str] = frozenset(
    {"flight_id", "latitude", "longitude", "ts", "altitude", "radar"}
)


def parse_csv(file_bytes: bytes) -> pd.DataFrame:
    """Parse le CSV uploadé et valide sa structure.

    Args:
        file_bytes: Contenu brut du fichier CSV en bytes.

    Returns:
        DataFrame avec les colonnes typées correctement.
        - latitude/longitude : float
        - altitude           : Int64 (nullable)
        - ts                 : datetime UTC

    Raises:
        ValueError: Si des colonnes sont manquantes ou si les données sont invalides.
    """
    try:
        df = pd.read_csv(io.BytesIO(file_bytes))
    except pd.errors.ParserError as exc:
        raise ValueError(f"Format CSV invalide : {exc}") from exc
    except Exception as exc:
        raise ValueError(f"Impossible de lire le fichier : {exc}") from exc

    # Validation des colonnes obligatoires
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(
            f"Colonnes manquantes dans le CSV : {', '.join(sorted(missing))}. "
            f"Colonnes attendues : {', '.join(sorted(REQUIRED_COLUMNS))}"
        )

    # Conversion des types numériques
    for col in ("latitude", "longitude"):
        try:
            df[col] = pd.to_numeric(df[col], errors="raise")
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Colonne '{col}' contient des valeurs non numériques : {exc}") from exc

    df["altitude"] = pd.to_numeric(df["altitude"], errors="coerce").astype("Int64")

    # Nettoyage de la colonne radar (chaîne, valeurs vides → NaN)
    if "radar" in df.columns:
        df["radar"] = df["radar"].astype(str).str.strip()
        df["radar"] = df["radar"].replace({"nan": None, "": None, "None": None})

    # Conversion du timestamp en datetime UTC
    try:
        df["ts"] = pd.to_datetime(df["ts"], utc=True)
    except Exception as exc:
        raise ValueError(f"Colonne 'ts' : format de date invalide — {exc}") from exc

    # Validation des plages de coordonnées
    invalid_lat = df[(df["latitude"] < -90) | (df["latitude"] > 90)]
    invalid_lon = df[(df["longitude"] < -180) | (df["longitude"] > 180)]

    if not invalid_lat.empty:
        logger.warning(
            "%d lignes avec latitude hors de [-90, 90] — ignorées", len(invalid_lat)
        )
        df = df.drop(invalid_lat.index)

    if not invalid_lon.empty:
        logger.warning(
            "%d lignes avec longitude hors de [-180, 180] — ignorées", len(invalid_lon)
        )
        df = df.drop(invalid_lon.index)

    logger.info("CSV parsé : %d points valides", len(df))
    return df.reset_index(drop=True)
