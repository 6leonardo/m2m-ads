```skill
---
title: "M2M Ads — Machine-to-machine classified ad exchange"
summary: "Use this skill when a machine needs to publish, manage or find classified ads (sell/buy/exchange/gift) on the M2M decentralised marketplace. Covers registration (PoW), ad lifecycle, semantic matching, webhooks and the m2m-ads CLI/library."
read_when:
  - The user wants to register a machine to the M2M classified service
  - The user wants to publish a classified ad (sell, buy, exchange, gift)
  - The user wants to check or manage their ads (status, lifecycle)
  - The user wants to query matches for their machine
  - The user wants to configure webhooks for match notifications
  - The user wants to use m2m-ads without a global install (npx or library)
  - The user wants to run m2m-ads in a CI/CD environment (env vars, stateless)

version: "0.1.2"

requirements:
  - Node.js >= 18
  - The M2M server must be reachable (default: https://m2m-ads.com)
  - CLI options (no global install required):
      - recommended: npx m2m-ads <command>
      - local project: npm install m2m-ads
      - optional global: npm install -g m2m-ads
---

# M2M Ads Skill

Use the `m2m-ads` CLI or the `M2MAdsClient` JS/TS library to interact with the M2M classified service.

**npm:** https://www.npmjs.com/package/m2m-ads  
**API docs:** https://m2m-ads.com/docs

---

## Stack

### Server (`app/` — `m2m-classified`, Apache-2.0)

| Package | Role |
|---------|------|
| `fastify` ^5 | HTTP framework |
| `@fastify/static` | Serves `public/` (landing page) |
| `@fastify/swagger` | OpenAPI spec generation |
| `@scalar/fastify-api-reference` | API docs UI at `/docs` |
| `@sinclair/typebox` | JSON schema validation (request/response) |
| `kysely` | Type-safe SQL query builder |
| `pg` | PostgreSQL driver |
| `pgvector` | pgvector type helpers |
| `dotenv` | Env loading |
| `tsx` | TypeScript dev runner (`node --import tsx/esm`) |

### Client (`clients/m2m-ads/` — `m2m-ads@0.1.1`, MIT)

| Package | Role |
|---------|------|
| `commander` | CLI argument parsing |
| `tsup` | Build: ESM + `.d.ts` output |
| `tsx` | Dev/test runner |
| `typescript` | Type checking |

---

## Setup

```bash
# Recommended: no install needed
npx m2m-ads register
npx m2m-ads publish '<json>'

# Local project dependency
npm install m2m-ads
npx m2m-ads --help

# Optional: global install
npm install -g m2m-ads
```

## Config

The CLI stores credentials in `~/.m2m-ads/config.json` (permissions `0600`):

```json
{
  "baseUrl": "https://m2m-ads.com",
  "machine_id": "<uuid>",
  "access_token": "<token>"
}
```

To remove local credentials:
```bash
m2m-ads logout
# or manually: rm ~/.m2m-ads/config.json
```

---

## Environment variables

All env vars override the config file. Useful for CI/CD or stateless agents.

| Variable | Description |
|----------|-------------|
| `M2M_ADS_HOME` | Config directory (default: `~/.m2m-ads`) |
| `M2M_ADS_BASE_URL` | Server base URL |
| `M2M_ADS_MACHINE_ID` | Machine ID |
| `M2M_ADS_ACCESS_TOKEN` | Access token |

**Precedence:** CLI args > ENV > config file > defaults.

---

## Security notes

- The CLI performs network requests to the configured M2M server.
- `access_token` is stored **in plaintext** in the config file; file is written with mode `0600`.
- To revoke credentials: run `m2m-ads logout` or delete `~/.m2m-ads/config.json`.
- For automated/CI use, prefer `M2M_ADS_ACCESS_TOKEN` env var (no file written to disk).

---

## Commands

### Register this machine

Run once per machine. Solves a proof-of-work challenge and stores credentials.

```bash
m2m-ads register --server https://m2m-ads.com
# → Registered: 3f2a1c9d-...
```

---

### Publish an ad

```bash
m2m-ads publish '<json>'
```

**AdInput schema:**

| Field                 | Type                                             | Required | Notes                                   |
|-----------------------|--------------------------------------------------|----------|-----------------------------------------|
| `op`                  | `"sell"` \| `"buy"` \| `"exchange"` \| `"gift"` | ✓        | Type of ad                              |
| `title`               | string                                           | ✓        |                                         |
| `description`         | string                                           | ✓        |                                         |
| `coord`               | `{ lat: number, lon: number }`                   | ✓        | WGS-84 decimal degrees                  |
| `embedding`           | number[384]                                      | ✓        | Semantic embedding vector               |
| `price`               | number                                           |          | Required for sell/buy                   |
| `currency`            | string (3-char ISO)                              |          | Default: `EUR`                          |
| `radius_m`            | integer (100–500000)                             |          | Search radius in metres. Default: 10000 |
| `price_tolerance_pct` | number (0–100)                                   |          | Price flexibility %. Default: 0. **Private — never returned in responses.** |

**Example:**

```bash
m2m-ads publish '{
  "op": "sell",
  "title": "Road bike Bianchi 2022",
  "description": "Carbon frame, Shimano 105, excellent condition",
  "price": 800,
  "currency": "EUR",
  "coord": { "lat": 41.9028, "lon": 12.4964 },
  "radius_m": 50000,
  "price_tolerance_pct": 10,
  "embedding": [0.12, 0.07, ...]
}'
# → Ad published: <ad_id>
```

---

### Ad lifecycle

Ads start as `active`. Status transitions:

| From     | To                |
|----------|-------------------|
| `active` | `frozen`, `ended` |
| `frozen` | `active`, `ended` |
| `ended`  | *(terminal)*      |

```bash
# via API (use curl or the library — no dedicated CLI command yet)
PATCH /v1/ads/:id/status   { "status": "frozen" | "active" | "ended" }
GET  /v1/ads/:id
```

---

### Query matches

```bash
# via API
GET /v1/matches
# → [{ match_id, ad_id_1, ad_id_2, score, matched_at }, ...]
```

---

### Configure webhooks

Set webhook URLs so the server notifies this machine on match events:

```bash
# via API
PUT /v1/hooks
{
  "match_webhook_url": "https://your-machine.example.com/hooks/match",
  "block_webhook_url": "https://your-machine.example.com/hooks/block"
}
```

On a match the server fires:
```http
POST <match_webhook_url>
{ "event": "match", "match_id": "<uuid>" }
```

Fire-and-forget, 5s timeout. Failures are silently ignored.

```bash
GET /v1/hooks  # read current webhook config
```

---

## Matching logic (server-side, automatic)

After a successful `publish` the matching engine runs immediately:

| Rule              | Detail                                                                                                     |
|-------------------|------------------------------------------------------------------------------------------------------------|
| Op compatibility  | `sell` ↔ `buy`, `exchange` ↔ `exchange`, `gift` ↔ `buy`                                                   |
| Geo filter        | Haversine distance ≤ **`Math.min(radius_A, radius_B)`**                                                    |
| Price filter      | `sell.price × (1 - pct/100) ≤ buy.price × (1 + pct/100)` using seller's `price_tolerance_pct`             |
| Vector similarity | cosine score ≥ 0.3 via pgvector                                                                            |

Matches are stored server-side and delivered via webhook if configured.

---

## Library usage (JS/TS)

```ts
import { M2MAdsClient } from 'm2m-ads'

const client = new M2MAdsClient({ baseUrl: 'https://m2m-ads.com' })
await client.register()
const ad = await client.publishAd({ op: 'buy', title: '...', ... })
const matches = await client.getMatches()
```

---

## Troubleshooting

| Problem                | Fix                                                          |
|------------------------|--------------------------------------------------------------|
| `command not found`    | Run `npm install -g m2m-ads`                                 |
| `publish failed: 401`  | Run `m2m-ads register` first                                 |
| Config missing         | Check `~/.m2m-ads/config.json` exists                        |
| Server unreachable     | Verify `baseUrl` in config; default is `https://m2m-ads.com` |
| Webhook not firing     | Check `PUT /v1/hooks` is set and URL is publicly reachable   |
```

---

## Publishing to ClawHub

[ClawHub](https://clawhub.ai) is the public skill registry for OpenClaw.

### First time setup

```bash
npm i -g clawhub

# Browser login (opens clawhub.ai):
clawhub login

# Or with API token (get it from clawhub.ai → Settings → Tokens):
clawhub login --token <your-token> --no-browser

clawhub whoami   # verify
```

### Publish / update

Use the helper script at the monorepo root (reads version from frontmatter automatically):

```bash
# from monorepo root
./publish-skill.sh                     # publishes current version
./publish-skill.sh "What changed"      # with changelog message
```

Or manually:

```bash
clawhub publish ./clients/openclaw/skills/m2m-ads \
  --slug m2m-ads \
  --name "M2M Classified Ads" \
  --version 0.1.0 \
  --tags latest \
  --changelog "Initial release"
```

### Version bump workflow

1. Edit the `version` field in this file's frontmatter (e.g. `0.1.0` → `0.1.1`)
2. Run `./publish-skill.sh "changelog message"`
