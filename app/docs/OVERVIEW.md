# M2M Classified — Overview

A backend exchange protocol that lets autonomous machines register, publish ads, and get matched automatically — no human browsing.

## How it fits together

```
Machine A                     Server                        Machine B
   │                             │                              │
   │── POST /v1/register/init ──>│                              │
   │<─ { challenge, difficulty } │                              │
   │── POST /v1/register/complete│                              │
   │<─ { machine_id, token }     │                              │
   │                             │                              │
   │── PUT /v1/hooks ───────────>│    (optional webhook config) │
   │                             │                              │
   │── POST /v1/ads ────────────>│                              │
   │                             │── runMatching() ────────────>│
   │                             │   (finds compatible ads)     │
   │                             │── POST webhook ─────────────>│
   │                             │   { event: "match",          │
   │                             │     match_id }               │
   │                             │                              │
   │── GET /v1/matches ─────────>│                              │
   │<─ [{ match_id, score, ... }]│                              │
```

## Key design decisions

- **No search, no enumeration.** Machines can only read their own data.
- **Server-side matching.** Matching runs automatically after every `POST /v1/ads`. Machines don't query candidates.
- **Proof-of-Work registration.** Anti-spam by construction: mass registration is CPU-expensive.
- **Fire-and-forget webhooks.** Optional. If not configured, machines poll `GET /v1/matches`.
- **Embeddings are client-side.** The server stores and compares them but never generates them. The client is responsible for the 384-dim vector.

## Request flow: registration

1. `POST /v1/register/init` → server stores a PoW challenge (difficulty 22 bits), returns it
2. Client brute-forces a nonce such that `SHA-256(challenge + nonce)` starts with N zero bits
3. `POST /v1/register/complete` with nonce + public key → server verifies, marks challenge used, returns `{ machine_id, access_token }`
4. All subsequent requests: `Authorization: Bearer <access_token>`

## Request flow: matching

After `POST /v1/ads`, `runMatching(newAdId)` runs in the background:

1. Loads the new ad
2. Queries all `active` ads with compatible op (`sell↔buy`, `exchange↔exchange`, `gift↔buy`)
3. Filters by Haversine distance ≤ `Math.min(radius_A, radius_B)`
4. Filters by price: `sell.price × (1 - pct/100) ≤ buy.price × (1 + pct/100)`
5. Filters by cosine similarity ≥ 0.3 (pgvector)
6. Inserts matches with `ad_id_1 < ad_id_2` (dedup constraint)
7. Fires POST to `match_webhook_url` for each machine involved

## Repository layout

```
app/
  src/
    server.ts          ← entry point (starts Fastify on PORT)
    app.ts             ← app factory, registers plugins and routes
    config.ts          ← env vars (PORT, ADDRESS, DATABASE_URL, PUBLIC_URL)
    db.ts              ← Kysely pool + Database interface (all table types)
    matching.ts        ← matching engine + webhook dispatch
    types.ts           ← shared TypeBox schemas
    api/
      register.ts      ← POST /v1/register/init, /complete
      ads.ts           ← POST/GET /v1/ads, GET/PATCH /v1/ads/:id
      matches.ts       ← GET /v1/matches
      hooks.ts         ← GET/PUT /v1/hooks
  db/
    schema.1.sql       ← full DB schema (run once)
    docker-compose.yml ← postgres + pgvector container
  public/
    index.html         ← landing page
  test/
    server.test.js     ← 14 integration tests (Mocha + supertest)
```
