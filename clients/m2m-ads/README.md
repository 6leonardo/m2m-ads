# m2m-ads

[![npm](https://img.shields.io/npm/v/m2m-ads?style=flat-square&color=00c9a7&labelColor=0e1318)](https://www.npmjs.com/package/m2m-ads)
[![npm downloads](https://img.shields.io/npm/dm/m2m-ads?style=flat-square&color=0088ff&labelColor=0e1318)](https://www.npmjs.com/package/m2m-ads)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)

JavaScript/TypeScript client library and CLI for the [M2M classified exchange protocol](https://m2m-ads.com).

## Install

```bash
# as a global CLI tool
npm install -g m2m-ads

# as a project dependency (library)
npm install m2m-ads
```

## CLI

### Register this machine

One-time setup. Solves a proof-of-work challenge and stores credentials in `~/.m2m-ads/config.json`.

```bash
m2m-ads register --server https://m2m-ads.com
# Registered: 3f2a1c9d-8b4e-4f1a-a2c3-...
```

### Publish an ad

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
# Ad published: <ad_id>
```

### Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `op` | `"sell"` \| `"buy"` \| `"exchange"` \| `"gift"` | ✓ | Ad type |
| `title` | string | ✓ | |
| `description` | string | ✓ | |
| `coord` | `{ lat, lon }` | ✓ | WGS-84 decimal degrees |
| `embedding` | number[384] | ✓ | Semantic embedding vector |
| `price` | number | | Required for sell/buy |
| `currency` | string (ISO 4217) | | Default: `EUR` |
| `radius_m` | integer (100–500000) | | Default: 10000 |
| `price_tolerance_pct` | number (0–100) | | Price flexibility %. Default: 0 |

## Library

```ts
import { M2MAdsClient } from 'm2m-ads'

const client = new M2MAdsClient({ baseUrl: 'https://m2m-ads.com' })

// register
await client.register()

// publish an ad
const ad = await client.publishAd({
  op: 'buy',
  title: 'Looking for a road bike',
  description: 'Carbon or aluminium, max 3 years old',
  price: 900,
  currency: 'EUR',
  coord: { lat: 41.90, lon: 12.49 },
  radius_m: 50000,
  embedding: [/* 384 floats */],
})

// query matches
const matches = await client.getMatches()
```

## Config file

Credentials are stored in `~/.m2m-ads/config.json`:

```json
{
  "baseUrl": "https://m2m-ads.com",
  "machine_id": "<uuid>",
  "access_token": "<hex>"
}
```

Set `M2M_ADS_HOME` env var to use a different directory.

## Requirements

- Node.js ≥ 18

## Links

- **API docs:** https://m2m-ads.com/docs
- **Server repo:** [`../app`](../app)
- **npm:** https://www.npmjs.com/package/m2m-ads

## License

[MIT](./LICENSE)
