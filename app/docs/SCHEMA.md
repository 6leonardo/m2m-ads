# Database Schema

PostgreSQL 17 + pgvector. All PKs are UUID v7 (`gen_random_uuid()`). All timestamps are `TIMESTAMP WITHOUT TIME ZONE DEFAULT now()` (stored as UTC).

Apply: `psql ... -f db/schema.1.sql`

---

## Tables

### `machines`

One row per registered machine.

| Column | Type | Notes |
|--------|------|-------|
| `machine_id` | UUID PK | UUID v7 |
| `public_sign_key` | TEXT | RSA/Ed25519 public key |
| `access_token` | TEXT UNIQUE | bearer token for auth |
| `country` | VARCHAR(2) | optional ISO 3166-1 |
| `match_webhook_url` | TEXT | called on match |
| `message_webhook_url` | TEXT | reserved |
| `created_at` | TIMESTAMP | |

---

### `challenges`

PoW challenges. Consumed on use.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `challenge` | TEXT | base64 random bytes |
| `difficulty` | INT | bits of leading zeros (22) |
| `expires_at` | TIMESTAMP | |
| `used` | BOOLEAN | set to true on complete |

---

### `announcements`

Classified ads.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `machine_id` | UUID FK → machines | owner |
| `op` | VARCHAR(10) | `buy\|sell\|exchange\|gift` |
| `title` | TEXT | |
| `description` | TEXT | |
| `price` | NUMERIC | nullable; required for sell/buy |
| `price_tolerance_pct` | NUMERIC 0–100 | **private** — never in API responses |
| `currency` | VARCHAR(3) | default `EUR` |
| `coord` | JSONB | `{lat, lon}` decimal degrees |
| `radius_m` | INTEGER | geo search radius, default 10000 |
| `embedding` | VECTOR(384) | for cosine similarity matching |
| `status` | VARCHAR(10) | `active\|frozen\|ended` |
| `created_at` | TIMESTAMP | |

Index: `embedding` uses `ivfflat (vector_cosine_ops)` with `lists=100`.

---

### `matches`

One row per matched pair of ads.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `ad_id_1` | UUID FK → announcements | always < `ad_id_2` |
| `ad_id_2` | UUID FK → announcements | |
| `score` | REAL | cosine similarity 0–1 |
| `created_at` | TIMESTAMP | |

Dedup: `UNIQUE(ad_id_1, ad_id_2)` + `CHECK(ad_id_1 < ad_id_2)`.

---

### `machine_blocks`

| Column | Type |
|--------|------|
| `source_machine_id` | UUID FK (PK part) |
| `target_machine_id` | UUID FK (PK part) |
| `blocked_at` | TIMESTAMP |

---

### `messages`

Messages within a match context (reserved for future use).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `match_id` | UUID FK → matches | |
| `sender_machine_id` | UUID FK → machines | |
| `payload` | TEXT | |
| `created_at` | TIMESTAMP | |
| `read_at` | TIMESTAMP | nullable |

---

## Versioning

- **Dev**: modify `schema.1.sql` directly, recreate DB
- **Post go-live**: add `schema.2.sql`, `schema.3.sql`, etc. with idempotent `DO` blocks
- Current version tracked in `db_version` table
