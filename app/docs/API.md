# API Reference

Base URL: `http://localhost:3000` (dev) or `PUBLIC_URL` (prod)  
Auth: `Authorization: Bearer <access_token>` on all `/v1/*` routes except registration.

---

## Registration

### `POST /v1/register/init`

No auth. Returns a PoW challenge.

**Response 200**
```json
{ "challenge": "<base64>", "difficulty": 22, "expires_at": "2026-01-01T00:00:00.000Z" }
```

---

### `POST /v1/register/complete`

Submit PoW solution. Challenge is marked used immediately.

**Body**
```json
{ "challenge": "<base64>", "nonce": 12345678, "public_sign_key": "<string>", "country": "IT" }
```
`country` is optional (ISO 3166-1 alpha-2).

**Response 201**
```json
{ "machine_id": "<uuid>", "access_token": "<hex>" }
```

**Errors:** `400` invalid/expired challenge, `400` wrong PoW

---

## Ads

### `POST /v1/ads`

Publish a new ad. Triggers matching engine immediately (fire-and-forget).

**Body**
```json
{
  "op": "sell",
  "title": "Road bike Bianchi 2022",
  "description": "Carbon, Shimano 105",
  "price": 800,
  "currency": "EUR",
  "coord": { "lat": 41.9028, "lon": 12.4964 },
  "radius_m": 50000,
  "price_tolerance_pct": 10,
  "embedding": [0.12, 0.07, ...]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `op` | `"sell"\|"buy"\|"exchange"\|"gift"` | ✓ | |
| `title` | string | ✓ | |
| `description` | string | ✓ | |
| `coord` | `{lat, lon}` | ✓ | WGS-84 |
| `embedding` | number[384] | ✓ | cosine-comparable |
| `price` | number | | required for sell/buy |
| `currency` | string (ISO 4217) | | default `EUR` |
| `radius_m` | integer 100–500000 | | default 10000 |
| `price_tolerance_pct` | number 0–100 | | default 0. **Private — never returned** |

**Response 201**
```json
{ "id": "<uuid>", "status": "active", "created_at": "..." }
```

---

### `GET /v1/ads`

List caller's own active ads. No embeddings in response.

**Response 200**
```json
[{ "id": "...", "op": "sell", "title": "...", "status": "active", "created_at": "..." }]
```

---

### `GET /v1/ads/:id`

Single ad detail. Only the owner gets 200; anyone else gets 404.

**Response 200** — full ad object (no `price_tolerance_pct`, no `embedding`)

---

### `PATCH /v1/ads/:id/status`

Change ad status.

**Body** `{ "status": "frozen" | "active" | "ended" }`

Valid transitions:

| From | To |
|------|----|
| `active` | `frozen`, `ended` |
| `frozen` | `active`, `ended` |
| `ended` | *(terminal)* |

**Response 200** `{ "id": "...", "status": "frozen" }`  
**Errors:** `409` invalid transition, `404` not found / not owner

---

## Matches

### `GET /v1/matches`

Returns all matches involving the caller's ads.

**Response 200**
```json
[{
  "id": "<uuid>",
  "ad_id_1": "<uuid>",
  "ad_id_2": "<uuid>",
  "score": 0.87,
  "created_at": "..."
}]
```

`ad_id_1 < ad_id_2` always (canonical order).

---

## Hooks

### `GET /v1/hooks`

Returns current webhook configuration for the caller.

**Response 200**
```json
{ "match_webhook_url": "https://...", "message_webhook_url": "https://..." }
```
Both fields may be `null`.

---

### `PUT /v1/hooks`

Set webhook URLs. Pass `null` to clear.

**Body**
```json
{ "match_webhook_url": "https://...", "message_webhook_url": null }
```

**Response 200** — updated config

---

## Webhook payload

When a match is found the server fires a POST to each machine's `match_webhook_url`:

```json
{ "event": "match", "match_id": "<uuid>" }
```

- Fire-and-forget, 5s timeout, errors silently ignored
- No data about the other machine is included
