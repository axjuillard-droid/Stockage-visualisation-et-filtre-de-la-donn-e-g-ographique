# 🛩️ Stockage, Visualisation et Filtrage de Données Géographiques

Application full-stack permettant d'**importer, stocker, filtrer et visualiser** des traces de vols d'avions géolocalisées (fichiers CSV), avec rendu cartographique interactif.

---

## 🗂️ Table des matières

- [Aperçu](#aperçu)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation et démarrage](#installation-et-démarrage)
- [Variables d'environnement](#variables-denvironnement)
- [Structure du projet](#structure-du-projet)
- [API — Endpoints principaux](#api--endpoints-principaux)
- [Migrations base de données (Alembic)](#migrations-base-de-données-alembic)
- [Tests](#tests)

---

## Aperçu

Ce projet est un **POC (Proof of Concept)** développé dans le cadre d'un stage. Il permet de :

- 📥 **Importer** des fichiers CSV contenant des traces de vols (position GPS, altitude, vitesse…)
- 🗄️ **Stocker** les données dans une base **PostgreSQL + PostGIS** (géométrie spatiale native)
- 🔍 **Filtrer** les traces par zone géographique (polygone dessiné sur la carte), plage d'altitude, et d'autres critères
- 🗺️ **Visualiser** les résultats sur une carte Leaflet interactive avec clustering des marqueurs

---

## Stack technique

| Couche | Technologie |
|---|---|
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS · Leaflet + react-leaflet |
| **Backend** | Python 3.11 · FastAPI · SQLAlchemy (async) · Alembic |
| **Base de données** | PostgreSQL 16 + PostGIS 3.4 |
| **Containerisation** | Docker · Docker Compose |
| **Tests** | pytest · pytest-asyncio · httpx |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Docker Compose                   │
│                                                     │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐  │
│   │  Frontend  │───▶│  Backend  │───▶│ PostgreSQL│  │
│   │  (Nginx)   │    │ (FastAPI) │    │ + PostGIS │  │
│   │  :80       │    │  :8000    │    │  :5432    │  │
│   └───────────┘    └───────────┘    └───────────┘  │
└─────────────────────────────────────────────────────┘
```

- Le **frontend** est servi par Nginx (image Docker multi-stage)
- Le **backend** expose une API REST consommée par le frontend
- La **base de données** stocke les géométries (traces) en types PostGIS natifs (`LINESTRING`, `POINT`)

---

## Prérequis

- [Docker](https://www.docker.com/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/) ≥ 2.20

> Pour le développement local sans Docker :
> - Python ≥ 3.11
> - Node.js ≥ 20
> - Une instance PostgreSQL + PostGIS accessible

---

## Installation et démarrage

### 🐳 Via Docker Compose (recommandé)

```bash
# 1. Cloner le dépôt
git clone https://github.com/axjuillard-droid/Stockage-visualisation-et-filtre-de-la-donn-e-g-ographique.git
cd Stockage-visualisation-et-filtre-de-la-donn-e-g-ographique

# 2. Configurer les variables d'environnement
cp .env.example .env
# Adapter .env si nécessaire

# 3. Lancer tous les services
docker compose up --build

# L'application est accessible sur :
#   Frontend : http://localhost
#   API      : http://localhost:8000
#   Docs API : http://localhost:8000/docs
```

### 💻 Développement local (sans Docker)

**Backend :**
```bash
cd backend
python -m venv .venv
# Windows :
.venv\Scripts\activate
# Linux/macOS :
source .venv/bin/activate

pip install -r requirements.txt

# Lancer le serveur de dev
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend :**
```bash
cd frontend
npm install
npm run dev
# Accessible sur http://localhost:5173
```

---

## Variables d'environnement

Copier `.env.example` en `.env` et adapter les valeurs :

```env
# URL de connexion à la base PostgreSQL (utilisée par le backend)
DATABASE_URL=postgresql+asyncpg://poc:poc@db:5432/poc

# (Tests uniquement) URL de connexion à la base de test
TEST_DATABASE_URL=postgresql+asyncpg://poc:poc@localhost:5432/poc_test
```

> ⚠️ **Ne jamais commiter le fichier `.env`** — il est exclu par le `.gitignore`.

---

## Structure du projet

```
.
├── backend/
│   ├── app/
│   │   ├── main.py          # Point d'entrée FastAPI
│   │   ├── database.py      # Session SQLAlchemy async
│   │   ├── config.py        # Pydantic Settings
│   │   ├── models/          # Modèles SQLAlchemy (ORM)
│   │   ├── schemas/         # Schémas Pydantic (validation)
│   │   ├── routers/         # Endpoints FastAPI
│   │   └── services/        # Logique métier (import CSV, filtrage…)
│   ├── alembic/             # Migrations de la base de données
│   ├── tests/               # Tests pytest
│   ├── Dockerfile
│   ├── alembic.ini
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Composant racine
│   │   ├── components/      # Composants React (carte, filtres, sliders…)
│   │   ├── hooks/           # Hooks personnalisés (gestion BDD, filtres…)
│   │   ├── types/           # Types TypeScript
│   │   └── lib/             # Utilitaires
│   ├── index.html
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── docs/                    # Documentation technique
│   ├── api.md
│   ├── dev-setup.md
│   └── phase3-bdd.md
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API — Endpoints principaux

La documentation interactive complète est disponible sur **`http://localhost:8000/docs`** (Swagger UI).

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Vérification de l'état de l'API et de la BDD |
| `POST` | `/api/db/import` | Import d'un fichier CSV de traces |
| `GET` | `/api/db/traces` | Récupération des traces (avec filtres optionnels) |
| `POST` | `/api/db/filter` | Filtrage avancé (zone géo, altitude, vitesse…) |
| `DELETE` | `/api/db/reset` | Remise à zéro de la base de données |

---

## Migrations base de données (Alembic)

```bash
# Depuis le dossier backend/
cd backend

# Appliquer toutes les migrations en attente
alembic upgrade head

# Créer une nouvelle migration après modification des modèles
alembic revision --autogenerate -m "description de la migration"

# Revenir à la migration précédente
alembic downgrade -1
```

---

## Tests

```bash
cd backend

# Lancer tous les tests
pytest

# Avec couverture de code
pytest --cov=app --cov-report=term-missing

# Un test spécifique
pytest tests/test_health.py -v
```

> Les tests nécessitent une base PostgreSQL + PostGIS accessible via `TEST_DATABASE_URL`.

---

## Licence

Projet réalisé dans le cadre d'un stage. Usage interne uniquement.
