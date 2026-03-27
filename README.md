# VisionArt — Backend API

NestJS REST API for the VisionArt mobile application. Handles authentication, user management, artwork, reports, notifications, and collections.

## Tech Stack

- **Framework**: NestJS 11 + TypeScript
- **Database**: MySQL 8 via TypeORM
- **Auth**: JWT + Google OAuth2 (`google-auth-library`)
- **API Docs**: Swagger/OpenAPI at `/api`
- **Container**: Docker (multi-stage build)
- **Orchestration**: Kubernetes

---

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Stable production-ready code |
| `dev`  | Active development — all PRs target this branch |

CI auto-triggers on every push to `dev`. Deployment to `main` is **manual** via GitHub Actions.

---

## Local Development

### Prerequisites

- Node.js 20+
- MySQL 8 running on `localhost:3306`

### Setup

```bash
cp .env.example .env       # fill in your local values
npm install
npm run start:dev          # http://localhost:3000
```

Swagger UI: `http://localhost:3000/api`

### Environment variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default `3000`) |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `JWT_EXPIRES_IN` | Token expiry (default `7d`) |
| `GOOGLE_CLIENT_ID` | Google OAuth Web Client ID |
| `GOOGLE_ANDROID_CLIENT_ID` | Google OAuth Android Client ID (optional) |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port (default `3306`) |
| `DB_USERNAME` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_DATABASE` | Database name |
| `DB_SYNCHRONIZE` | Auto-sync schema — `true` in dev only |
| `SMTP_*` | Email config for password reset (optional) |
| `FRONTEND_RESET_URL` | Password reset deep-link base URL (optional) |

---

## Docker

### Production image

```bash
docker build --target production -t visionart-backend .
docker run -p 3000:3000 --env-file .env visionart-backend
```

### Docker Compose (backend + MySQL)

```bash
# Production
docker-compose up

# Development (hot reload)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## CI/CD — GitHub Actions

### `ci-dev.yml` — Auto on push to `dev`

1. Install deps
2. Lint (`eslint`)
3. Build (`nest build`)
4. Build & push Docker image to `ghcr.io`

**Image tags**: `dev`, `dev-<sha>`

### `deploy-main.yml` — Manual (`workflow_dispatch`)

Triggered manually from GitHub Actions UI. Choose environment: `production` or `staging`.

**Image tags**: `latest`, `<environment>`, `<sha>`

### Required GitHub Secrets

| Secret | Used by |
|--------|---------|
| `JWT_SECRET` | deploy-main |
| `GOOGLE_CLIENT_ID` | deploy-main |

> **Permissions**: Set repo → Settings → Actions → General → Workflow permissions to **Read and write**.

---

## Kubernetes

Manifests are in `k8s/`. Apply in this order:

```bash
kubectl apply -f k8s/namespace.yml
kubectl apply -f k8s/secret.yml      # fill real values first — never commit secrets
kubectl apply -f k8s/configmap.yml
kubectl apply -f k8s/mysql.yml
kubectl apply -f k8s/deployment.yml
kubectl apply -f k8s/service.yml
```

| Resource | Details |
|----------|---------|
| `Deployment` | 2 replicas, readiness + liveness probes |
| `Service (ClusterIP)` | Internal port `80 → 3000` |
| `Service (NodePort)` | External access on `:30000` |
| `MySQL StatefulSet` | Persistent 5Gi volume |

Image pulled from `ghcr.io/jizel14/visionart-backend:latest`.

---

## API Modules

| Module | Endpoints |
|--------|-----------|
| Auth | `POST /auth/login`, `/auth/register`, `/auth/google`, `/auth/forgot-password`, `/auth/reset-password` |
| Users | `GET /users/me`, `PATCH /users/profile`, `PATCH /users/preferences`, `DELETE /users/account` |
| Artworks | `GET /artworks`, `POST /artworks`, `GET /artworks/:id`, artwork likes & saves |
| Reports | `POST /reports`, `GET /reports` |
| Notifications | `GET /notifications`, mark as read, notification types |
| Collections | `GET /collections`, `POST /collections`, add/remove artworks |

---

## Scripts

```bash
npm run start:dev     # dev with hot reload
npm run build         # compile to dist/
npm run start:prod    # run compiled output
npm run lint          # eslint
npm run test          # unit tests
npm run test:e2e      # end-to-end tests
npm run test:cov      # coverage report
```
