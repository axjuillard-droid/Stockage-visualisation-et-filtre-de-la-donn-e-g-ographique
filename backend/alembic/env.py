"""env.py Alembic — configuration de l'environnement de migration async."""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Importer Base et tous les modèles pour qu'Alembic détecte les tables
from app.database import Base
import app.models  # noqa: F401 — déclenche l'enregistrement des modèles

# Config Alembic
config = context.config

# Surcharger l'URL depuis la variable d'environnement si disponible
database_url = os.environ.get("DATABASE_URL")
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

# Configurer le logging depuis alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata cible pour l'autogenerate
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Lance les migrations en mode offline (sans connexion active).

    Utile pour générer des scripts SQL sans accès à la base.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Exécute les migrations sur une connexion existante."""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Lance les migrations en mode async (connexion asyncpg)."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Point d'entrée online — utilise asyncio pour le driver asyncpg."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
