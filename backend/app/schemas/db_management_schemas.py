from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


from app.schemas.filter_request import Zone


class FlightsBulkDeleteRequest(BaseModel):
    """Requête de suppression groupée de vols."""

    flight_ids: list[str] = Field(..., min_length=1, description="Liste des identifiants de vols à supprimer définitivement")


class FlightsManagementRequest(BaseModel):
    """Requête de recherche et filtrage de vols pour la gestion."""

    query: str | None = Field(None, description="Filtre sur le flight_id (ILIKE)")
    date_debut: datetime | None = Field(None, description="Date de début minimale")
    date_fin: datetime | None = Field(None, description="Date de fin maximale")
    alt_min: float | None = Field(None, description="Altitude minimale")
    alt_max: float | None = Field(None, description="Altitude maximale")
    radars: list[str] | None = Field(None, description="Liste des radars filtrés")
    zones: list[Zone] | None = Field(None, description="Zones géographiques actives")
    limit: int = Field(10, description="Limite de pagination")
    offset: int = Field(0, description="Décalage de pagination")


class FlightStats(BaseModel):
    """Statistiques détaillées d'un vol pour l'interface de gestion."""

    flight_id: str
    point_count: int
    ts_start: datetime | None = None
    ts_end: datetime | None = None
    alt_min: int | None = None
    alt_max: int | None = None


class FlightsManagementResponse(BaseModel):
    """Réponse paginée de la liste des vols avec statistiques."""

    total_count: int
    flights: list[FlightStats]
