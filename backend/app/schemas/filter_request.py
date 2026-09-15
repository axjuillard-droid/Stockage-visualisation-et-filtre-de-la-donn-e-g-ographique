"""Schémas Pydantic pour les requêtes de filtrage de traces d'avions.

Hiérarchie :
    ZoneRectangle | ZoneCercle → Zone (union discriminée par le champ `type`)
    CsvFilterRequest            → requête complète avec zones et plage de dates
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


# ─── Zones géographiques ───────────────────────────────────────────────────────


class ZoneRectangle(BaseModel):
    """Zone rectangulaire définie par ses bornes lat/lon.

    Attributes:
        type:    Discriminant — toujours "rectangle".
        lat_min: Latitude minimale (bord sud), ∈ [-90, 90].
        lat_max: Latitude maximale (bord nord), ∈ [-90, 90].
        lon_min: Longitude minimale (bord ouest), ∈ [-180, 180].
        lon_max: Longitude maximale (bord est), ∈ [-180, 180].
    """

    type: Literal["rectangle"]
    nom: str | None = Field(default=None, description="Nom de la zone")
    lat_min: float = Field(..., ge=-90.0, le=90.0, description="Latitude sud")
    lat_max: float = Field(..., ge=-90.0, le=90.0, description="Latitude nord")
    lon_min: float = Field(..., ge=-180.0, le=180.0, description="Longitude ouest")
    lon_max: float = Field(..., ge=-180.0, le=180.0, description="Longitude est")
    rotation: float | None = Field(default=0.0, description="Rotation en degrés autour du centre")


class ZoneCercle(BaseModel):
    """Zone circulaire définie par un centre et un rayon.

    Attributes:
        type:     Discriminant — toujours "cercle".
        lat:      Latitude du centre, ∈ [-90, 90].
        lon:      Longitude du centre, ∈ [-180, 180].
        rayon_km: Rayon en kilomètres, strictement positif.
    """

    type: Literal["cercle"]
    nom: str | None = Field(default=None, description="Nom de la zone")
    lat: float = Field(..., ge=-90.0, le=90.0, description="Latitude centre")
    lon: float = Field(..., ge=-180.0, le=180.0, description="Longitude centre")
    rayon_km: float = Field(..., gt=0.0, description="Rayon en km")


# Union discriminée sur le champ `type`
Zone = Annotated[
    ZoneRectangle | ZoneCercle,
    Field(discriminator="type"),
]


# ─── Requête de filtrage CSV ───────────────────────────────────────────────────


class CsvFilterRequest(BaseModel):
    """Requête de filtrage pour le mode CSV (traitement en mémoire) et BDD (PostGIS).

    Attributes:
        date_debut: Début de la plage temporelle (optionnel).
        date_fin:   Fin de la plage temporelle (optionnel).
        zones:      Liste de zones géographiques (optionnel).
        radars:     Liste des radars à inclure (vide = tous).
    """

    date_debut: datetime | None = None
    date_fin: datetime | None = None
    zones: list[Zone] = Field(default_factory=list, description="Liste de zones géographiques")
    radars: list[str] = Field(default_factory=list, description="Liste des radars à inclure (vide = tous)")

    @model_validator(mode="after")
    def validate_filter_arguments(self) -> "CsvFilterRequest":
        """Vérifie la cohérence des arguments du filtre."""
        if not self.zones and not self.date_debut and not self.date_fin and not self.radars:
            raise ValueError("Au moins un filtre (zone géographique, plage temporelle ou radar) doit être spécifié.")
        if self.date_debut and self.date_fin and self.date_fin < self.date_debut:
            raise ValueError(
                f"date_fin ({self.date_fin}) doit être supérieure ou égale à date_debut ({self.date_debut})"
            )
        return self
