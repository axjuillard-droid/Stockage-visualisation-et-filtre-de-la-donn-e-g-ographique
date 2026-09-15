"""Configuration de l'application via variables d'environnement."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Paramètres de l'application chargés depuis les variables d'environnement.

    Toutes les valeurs sensibles (DATABASE_URL, etc.) sont lues depuis
    l'environnement ou le fichier .env — jamais hardcodées.
    """

    database_url: str = "postgresql+asyncpg://poc:poc@db:5432/poc"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
