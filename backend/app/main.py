"""Point d'entrée FastAPI — Phase 1 : route /api/health + CORS + routers."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import AsyncSessionFactory
from app.routers import db_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="POC Filtrage Traces Avions",
    description="API de filtrage de traces d'avions géolocalisées.",
    version="0.1.0",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:80", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(db_router.router)


# ─── Routes de base ───────────────────────────────────────────────────────────
@app.get("/api/health", tags=["health"])
async def health_check() -> dict:
    """Vérifie que l'API est opérationnelle et que la base de données répond.

    Returns:
        dict: {"status": "ok", "database": "connected"} si tout va bien.
              {"status": "degraded", "database": "unavailable"} si la BDD est inaccessible.
    """
    try:
        async with AsyncSessionFactory() as session:
            # Requête minimale pour vérifier la connectivité
            await session.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        logger.exception("Health check : impossible de joindre la base de données")
        db_status = "unavailable"

    return {"status": "ok" if db_status == "connected" else "degraded", "database": db_status}
