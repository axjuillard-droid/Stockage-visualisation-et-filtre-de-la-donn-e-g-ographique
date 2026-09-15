from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


from app.schemas.filter_request import Zone


class DbTracesRequest(BaseModel):
    """Requête pour récupérer les points de traces de vols spécifiques."""

    flight_ids: list[str] = Field(..., min_length=1, description="Liste des identifiants de vols à récupérer")
    date_debut: datetime | None = Field(None, description="Date de début optionnelle")
    date_fin: datetime | None = Field(None, description="Date de fin optionnelle")
    alt_min: float | None = Field(None, description="Altitude minimale du filtre (pieds) — points hors plage seront dimmed")
    alt_max: float | None = Field(None, description="Altitude maximale du filtre (pieds) — points hors plage seront dimmed")
    zones: list[Zone] | None = Field(None, description="Zones géographiques actives (points hors zones seront dimmed)")
