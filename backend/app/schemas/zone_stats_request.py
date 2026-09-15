"""Schéma Pydantic pour la requête de statistiques de zone géographique."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.filter_request import ZoneCercle, ZoneRectangle, Zone


class ZoneStatsRequest(BaseModel):
    """Requête pour calculer les statistiques agrégées d'une zone géographique.

    Attributes:
        zone:       Zone géographique (rectangle ou cercle).
        date_debut: Filtre temporel début (optionnel).
        date_fin:   Filtre temporel fin (optionnel).
        radars:     Filtrer par radar(s) (optionnel).
        alt_min:    Altitude minimale du filtre (optionnel).
        alt_max:    Altitude maximale du filtre (optionnel).
    """

    zone: Zone
    date_debut: datetime | None = Field(None, description="Date de début optionnelle")
    date_fin: datetime | None = Field(None, description="Date de fin optionnelle")
    radars: list[str] | None = Field(None, description="Filtrer par radar(s)")
    alt_min: float | None = Field(None, description="Altitude minimale du filtre")
    alt_max: float | None = Field(None, description="Altitude maximale du filtre")
