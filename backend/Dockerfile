# ─── Stage builder ────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Installer uniquement les dépendances de build
COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip install --prefix=/install --no-cache-dir -r requirements.txt

# ─── Stage runtime ────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

# Utilisateur non-root pour la sécurité
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

# Copier les dépendances installées depuis le builder
COPY --from=builder /install /usr/local

# Copier le code applicatif
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./alembic.ini
COPY tests/ ./tests/

# Donner la propriété à l'utilisateur non-root
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

# Lance Alembic puis démarre Uvicorn
ENV PYTHONPATH=/app

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
