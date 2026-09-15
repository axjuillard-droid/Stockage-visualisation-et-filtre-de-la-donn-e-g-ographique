# Guide de démarrage — Environnement de développement

## Prérequis

| Outil | Version minimale | Lien |
|-------|-----------------|------|
| Docker Desktop | 24.x | https://www.docker.com/products/docker-desktop |
| Docker Compose | v2.x (inclus dans Docker Desktop) | — |
| Git | 2.x | https://git-scm.com |

> **Note :** Node.js et Python ne sont **pas** nécessaires sur la machine hôte. Tout tourne dans Docker.

---

## Lancement du projet

### 1. Cloner le dépôt

```bash
git clone <url-du-depot>
cd projet_geo
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env
# Éditer .env si besoin (les valeurs par défaut fonctionnent en local)
```

### 3. Démarrer les 3 services

```bash
docker-compose up --build
```

Lors du premier lancement, Docker va :
1. Télécharger les images de base (`python:3.11-slim`, `node:20-alpine`, `postgis/postgis:16-3.4`, `nginx:alpine`)
2. Construire les images frontend et backend
3. Démarrer PostgreSQL + PostGIS, puis le backend, puis le frontend
4. Exécuter les migrations Alembic (création de la table `aircraft_traces`)

> Le premier build prend environ 3–5 minutes. Les relances suivantes sont quasi-instantanées grâce au cache Docker.

---

## Vérifier que la Phase 1 fonctionne

### URLs à tester

| URL | Résultat attendu |
|-----|-----------------|
| `http://localhost` | Page React « POC Avions — OK » |
| `http://localhost/api/health` | `{"status":"ok","database":"connected"}` |
| `http://localhost:8000/api/health` | Même réponse (accès direct au backend) |
| `http://localhost:8000/docs` | Documentation Swagger UI FastAPI |

### Vérifier la base de données

```bash
# Entrer dans le conteneur PostgreSQL
docker exec -it $(docker-compose ps -q db) psql -U poc -d poc

# Dans psql :
\dt                          -- doit afficher aircraft_traces
\d aircraft_traces           -- affiche le schéma complet
SELECT COUNT(*) FROM aircraft_traces;  -- 0 (table vide)
\q
```

### Vérifier les logs

```bash
docker-compose logs backend    # logs FastAPI + Alembic
docker-compose logs frontend   # logs Nginx
docker-compose logs db         # logs PostgreSQL
```

---

## Arrêter et nettoyer

```bash
# Arrêter les conteneurs (données conservées)
docker-compose down

# Arrêter ET supprimer les volumes (retour à l'état initial)
docker-compose down -v
```

---

## Variables d'environnement disponibles

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://poc:poc@db:5432/poc` | URL de connexion backend → PostgreSQL |
| `TEST_DATABASE_URL` | — | URL pour les tests d'intégration (hors Docker) |

> **Sécurité :** Le fichier `.env` est exclu de Git (voir `.gitignore`). Ne jamais commiter de mots de passe.

---

## Structure des ports

| Service | Port interne | Port exposé | Accès |
|---------|-------------|-------------|-------|
| Nginx (frontend) | 80 | 80 | `http://localhost` |
| FastAPI (backend) | 8000 | 8000 | `http://localhost:8000` |
| PostgreSQL (db) | 5432 | non exposé | Interne Docker uniquement |

---

## Développement local (sans Docker)

Pour itérer rapidement sur le backend sans reconstruire l'image :

```bash
# Dans un environnement virtuel Python :
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql+asyncpg://poc:poc@localhost:5432/poc uvicorn app.main:app --reload

# Pour le frontend :
cd frontend
npm install
npm run dev   # disponible sur http://localhost:5173
```

> Le proxy Vite redirige `/api/*` vers `http://localhost:8000` automatiquement.
