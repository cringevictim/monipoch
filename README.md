# Monipoch — Pochven Alliance Intel Platform

Real-time Pochven region intel tool for EVE Online alliances. Displays a killmail heatmap, detects fights, gate camps, and roaming fleets, and delivers notifications via browser and Discord.

## Architecture

```
monipoch/
├── apps/
│   ├── api/          NestJS 11 backend (REST + WebSocket)
│   └── web/          React 19 + Vite frontend (SPA)
├── packages/
│   ├── shared/       Shared types, constants, Pochven system data
│   └── eve-sdk/      EVE ESI client, zKillboard API, killmail stream
├── docker-compose.yml          Dev infrastructure (MySQL, Redis)
└── docker-compose.prod.yml     Full production stack
```

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker & Docker Compose (for MySQL 8 and Redis 7)
- EVE Online developer application (for SSO)

## Getting Started

```bash
# Install dependencies
pnpm install

# Start MySQL and Redis
pnpm db:up

# Create a .env file from the example
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your EVE SSO credentials and alliance ID

# Run database migrations
pnpm db:migrate

# Start development servers (API + Web)
pnpm dev
```

The API runs on `http://localhost:3000`, the web app on `http://localhost:5173`.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers |
| `pnpm dev:api` | Start only the API |
| `pnpm dev:web` | Start only the frontend |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run tests |
| `pnpm db:up` | Start MySQL + Redis containers |
| `pnpm db:down` | Stop containers |
| `pnpm db:migrate` | Run database migrations |

## Production Deployment

```bash
# Build and start the full stack with Docker Compose
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Required environment variables for production — see `apps/api/.env.example`.

### Health Check

The API exposes `GET /health` which verifies database connectivity. This endpoint is used by the Docker HEALTHCHECK and can be wired into any orchestrator.

## Tech Stack

- **Backend:** NestJS 11, Knex.js, MySQL 8, Redis 7, WebSockets (ws)
- **Frontend:** React 19, Vite, Tailwind CSS, Zustand, TanStack Query
- **Auth:** EVE Online SSO (OAuth2), JWT
- **Data:** zKillboard API, killmail.stream, EVE ESI
