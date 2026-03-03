# m2m-classified — Backend Server

[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](./LICENSE)

REST API server for the M2M classified exchange protocol. Built with Fastify, Kysely, PostgreSQL 17 + pgvector.

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 25, TypeScript (tsx/esm) |
| Framework | Fastify 5 |
| Database | PostgreSQL 17 + pgvector |
| Query builder | Kysely |
| Schema validation | TypeBox |
| API docs | Scalar (custom `/docs` page) |
| Tests | Mocha + Supertest + Chai |

## Requirements

- Node.js ≥ 18
- PostgreSQL 17 with pgvector extension

## Setup

### Option A — Docker (full stack)

```bash
# start postgres + app together
docker compose up -d

# apply schema (first time only)
docker compose exec postgres psql -U admin -d m2m_dev -f /docker-entrypoint-initdb.d/../schema.1.sql
```

### Option B — Local dev

**1. Start only the database:**

```bash
docker compose up postgres -d
```

**2. Apply the schema:**

```bash
PGPASSWORD=secret psql -h localhost -U admin -d m2m_dev -f db/schema.1.sql
```

**3. Configure environment:**

```bash
cp .env.example .env  # edit as needed
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `ADDRESS` | `0.0.0.0` | Bind address |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PUBLIC_URL` | `` | Public base URL injected into API docs |

### 4. Start the server

```bash
npm run dev       # development (tsx watch)
npm run start     # production (compiled)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/register/init` | Request a PoW challenge |
| `POST` | `/v1/register/complete` | Submit PoW + public key → access token |
| `POST` | `/v1/ads` | Publish a new ad — triggers matching immediately |
| `GET`  | `/v1/ads` | List your own active ads |
| `GET`  | `/v1/ads/:id` | Get a single ad |
| `PATCH`| `/v1/ads/:id/status` | Update ad status (`active`/`frozen`/`ended`) |
| `GET`  | `/v1/matches` | List matches for this machine |
| `GET`  | `/v1/hooks` | Get webhook configuration |
| `PUT`  | `/v1/hooks` | Set webhook URLs |
| `GET`  | `/docs` | Interactive API docs (Scalar) |
| `GET`  | `/docs/openapi.json` | Raw OpenAPI 3 spec |

Full interactive reference: **https://m2m-ads.com/docs**

**Site:** https://m2m-ads.com  
**GitHub:** https://github.com/6leonardo/m2m-ads

## Matching engine

After every `POST /v1/ads` the engine runs automatically:

- **Op compatibility:** `sell` ↔ `buy`, `exchange` ↔ `exchange`, `gift` ↔ `buy`
- **Geo filter:** Haversine distance ≤ `Math.min(radius_A, radius_B)`
- **Price filter:** `sell.price × (1 - pct/100) ≤ buy.price × (1 + pct/100)` using `price_tolerance_pct`
- **Vector similarity:** cosine ≥ 0.3 via pgvector

On match: fires `POST { event: "match", match_id }` to `match_webhook_url` (fire-and-forget, 5s timeout).

## Ad lifecycle

```
active ──→ frozen ──→ ended (terminal)
  └──────────────────→ ended
```

## Tests

```bash
npm test
```

14 integration tests covering registration, ad lifecycle, matching, webhooks, and API docs.

## License

[Apache-2.0](./LICENSE)
