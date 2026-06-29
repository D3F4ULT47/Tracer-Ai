# Tracer AI

Tracer AI is an AI-native learning operating system. This repository is a JavaScript modular monolith with npm workspaces for the React client, Express server, and shared contracts.

## Requirements

- Node.js 24
- npm 11
- MongoDB replica set (transactions are required)
- Redis

## Setup

1. Copy `.env.example` to `.env` and configure local services.
2. Run `npm install`.
3. Run `npm run dev`.

The client is served at `http://localhost:5173` and the API at `http://localhost:4000`. Liveness and readiness endpoints are available at `/api/v1/health/live` and `/api/v1/health/ready`.

## Commands

- `npm run dev` — run client and server
- `npm run build` — build all workspaces
- `npm run check:architecture` — detect circular imports and boundary violations
- `npm run lint` — lint the repository
- `npm run format:check` — verify formatting
- `npm test` — run workspace tests
- `npm run check` — run all verification

See [the architecture freeze](docs/ARCHITECTURE_FREEZE.md) before making structural changes.
