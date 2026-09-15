"""Engine SQLAlchemy async et factory de sessions."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Création de l'engine async (asyncpg driver)
engine = create_async_engine(
    settings.database_url,
    echo=False,          # passer à True pour déboguer les requêtes SQL
    pool_pre_ping=True,  # vérifie la connexion avant chaque utilisation
)

# Factory de sessions asynchrones
AsyncSessionFactory = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    """Classe de base pour tous les modèles SQLAlchemy."""


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dépendance FastAPI : fournit une session BD et la ferme en fin de requête."""
    async with AsyncSessionFactory() as session:
        yield session
