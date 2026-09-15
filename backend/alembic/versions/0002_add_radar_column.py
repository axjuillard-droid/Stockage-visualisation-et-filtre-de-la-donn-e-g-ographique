"""Migration — ajout colonne radar + purge des données existantes.

La table aircraft_traces est vidée avant l'ajout de la colonne car les données
existantes ne possèdent pas de valeur radar. Les données doivent être
réimportées depuis des CSV incluant la colonne `radar`.

Revision ID: 0002_add_radar_column
Revises: 0001_init
Create Date: 2026-06-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# Identifiants de révision
revision: str = "0002_add_radar_column"
down_revision: str | None = "0001_init"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Vide la table, ajoute la colonne radar et crée son index."""
    # ⚠️  TRUNCATE intentionnel : les données sans colonne radar ne sont pas
    #     réutilisables. Les données doivent être rechargées depuis des CSV
    #     qui incluent la colonne `radar`.
    op.execute("TRUNCATE TABLE aircraft_traces RESTART IDENTITY")

    op.add_column(
        "aircraft_traces",
        sa.Column("radar", sa.String(length=64), nullable=True),
    )

    # Index B-tree sur radar pour accélérer les filtres par radar
    op.create_index("idx_traces_radar", "aircraft_traces", ["radar"])


def downgrade() -> None:
    """Supprime l'index et la colonne radar."""
    op.drop_index("idx_traces_radar", table_name="aircraft_traces")
    op.drop_column("aircraft_traces", "radar")
