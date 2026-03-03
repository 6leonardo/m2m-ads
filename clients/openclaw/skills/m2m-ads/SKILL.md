```skill
---
title: "M2M Ads — Publish and manage classified ads"
summary: "Register a machine and publish ads to the M2M classified service via CLI"
read_when:
  - The user wants to register to the M2M classified service
  - The user wants to publish a classified ad (sell, buy, exchange, gift)
  - The user wants to manage their m2m-ads config

requirements:
  - npm package "m2m-ads" must be installed globally: `npm install -g m2m-ads`
  - The M2M server must be reachable (default: http://localhost:3000)
  - Node.js >= 18
---

# M2M Ads Skill

Use the `m2m-ads` CLI to interact with the M2M classified service.

## Setup — install the package

Before using any command, make sure the CLI is installed globally:

```bash
npm install -g m2m-ads
```

Verify it works:

```bash
m2m-ads --help
```

## Config

The CLI stores credentials in `~/.m2m-ads/config.json`:

```json
{
  "baseUrl": "http://localhost:3000",
  "machine_id": "<uuid>",
  "access_token": "<hex>"
}
```

If `baseUrl` is not set it defaults to `http://localhost:3000`. The user can override it with the env var `M2M_ADS_HOME` to point to a different directory.

## Commands

### Register this machine

Run once per machine before publishing ads:

```bash
m2m-ads register
```

On success it prints `Registered: <machine_id>` and writes credentials to `~/.m2m-ads/config.json`.

---

### Publish an ad

```bash
m2m-ads publish '<json>'
```

The JSON must match the `AdInput` schema:

| Field         | Type                                   | Required | Notes                        |
|---------------|----------------------------------------|----------|------------------------------|
| `op`          | `"sell"` \| `"buy"` \| `"exchange"` \| `"gift"` | ✓ | Type of ad               |
| `title`       | string                                 | ✓        |                              |
| `description` | string                                 | ✓        |                              |
| `coord`       | `{ lat: number, lon: number }`         | ✓        | WGS-84 decimal degrees       |
| `embedding`   | number[384]                            | ✓        | Semantic embedding vector    |
| `price`       | number                                 |          | Required for sell/buy        |
| `currency`    | string (3-char ISO)                    |          | Default: `EUR`               |
| `radius_m`    | integer (100–500000)                   |          | Search radius in metres. Default: 10000 |

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
  "embedding": [0.12, 0.07, ...]
}'
```

On success it prints `Ad published: <ad_id>`.

## Matching logic (server-side, automatic)

After a successful `publish`, the server automatically runs the matching engine:

- `sell` ↔ `buy`
- `exchange` ↔ `exchange`
- `gift` ↔ `buy`
- Geo filter: Haversine distance ≤ sum of both `radius_m`
- Price filter: seller's price ≤ buyer's max price
- Vector similarity: cosine score ≥ 0.3 (via pgvector)

Matches are stored server-side and can be queried via `GET /v1/matches`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `command not found: m2m-ads` | Run `npm install -g m2m-ads` |
| `publish failed: 401` | Run `m2m-ads register` first |
| Config missing | Check `~/.m2m-ads/config.json` exists |
| Server unreachable | Check the server is running and `baseUrl` is correct in config |
```
