"""Migration initiale — création de la table aircraft_traces avec PostGIS.

Revision ID: 0001_init
Revises: —
Create Date: 2026-06-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

# Identifiants de révision
revision: str = "0001_init"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Crée l'extension PostGIS et la table aircraft_traces avec ses index."""
    # Active l'extension PostGIS (idempotent)
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "aircraft_traces",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("flight_id", sa.String(length=16), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("altitude", sa.Integer(), nullable=True),
        # Colonne géométrique PostGIS — Point en WGS84 (SRID 4326)
        sa.Column(
            "geom",
            Geometry(geometry_type="POINT", srid=4326),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Index spatial GIST sur la colonne géométrique (requis pour ST_Within, etc.)
    op.create_index("idx_traces_geom", "aircraft_traces", ["geom"], postgresql_using="gist")
    # Index B-tree sur le timestamp pour les filtres de plage de dates
    op.create_index("idx_traces_ts", "aircraft_traces", ["ts"])
    # Index B-tree sur flight_id pour les filtres par vol
    op.create_index("idx_traces_flight", "aircraft_traces", ["flight_id"])


def downgrade() -> None:
    """Supprime la table aircraft_traces et ses index."""
    op.drop_index("idx_traces_flight", table_name="aircraft_traces")
    op.drop_index("idx_traces_ts", table_name="aircraft_traces")
    op.drop_index("idx_traces_geom", table_name="aircraft_traces")
    op.drop_table("aircraft_traces")
