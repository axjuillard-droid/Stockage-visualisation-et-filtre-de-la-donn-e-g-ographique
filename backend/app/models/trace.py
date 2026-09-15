"""Modèle SQLAlchemy pour la table aircraft_traces."""

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AircraftTrace(Base):
    """Représente un point de trace d'avion géolocalisé.

    Colonnes :
        id        : clé primaire auto-incrémentée
        flight_id : identifiant du vol (ex: AFR1234)
        ts        : horodatage du point (timezone-aware)
        altitude  : altitude en pieds
        radar     : identifiant du radar ayant détecté l'avion (ex: LFPG)
        geom      : point géographique WGS84 (SRID 4326) — stocké via PostGIS
    """

    __tablename__ = "aircraft_traces"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    flight_id: Mapped[str] = mapped_column(String(16), nullable=False)
    ts: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    altitude: Mapped[int | None] = mapped_column(Integer, nullable=True)
    radar: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Geometry(Point, 4326) correspond à un point WGS84 géré par PostGIS
    geom: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326),
        nullable=False,
    )

    # Index spatiaux et fonctionnels (déclarés aussi via Alembic)
    __table_args__ = (
        Index("idx_traces_geom", "geom", postgresql_using="gist"),
        Index("idx_traces_ts", "ts"),
        Index("idx_traces_flight", "flight_id"),
        Index("idx_traces_radar", "radar"),
    )
