# AGENTS.md — M2M Classified Service

Read by AI agents (Copilot, Codex, Claude, etc.).
Contains mandatory rules, patterns and the repository map.
Do not change the structure without updating this file.

---

## Repository — structure and git

```
classified/
├── app/               ← PRIVATE — not distributed
│   ├── src/
│   ├── db/
│   ├── docs/
│   ├── public/
│   └── test/
│
└── clients/           ← PUBLIC — each subfolder is an independent package
    ├── m2m-ads/       ← public npm package (CLI + SDK)
    └── openclaw/      ← skill for the OpenClaw framework
```

**Git rules:**
- The monorepo root has a single `.git` — all packages are in the same repo
- `app/` is private (`"private": true`) — never publish to npm
- `clients/m2m-ads/` is published to npm and GitHub
- `clients/openclaw/` is distributed as an OpenClaw skill
- Do not mix app and client concerns in the same commit

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 25 + `--import tsx/esm` |
| HTTP | Fastify 5 |
| Validation | `@sinclair/typebox` (TypeBox) |
| API docs | `@fastify/swagger` + custom HTML page (GET /docs, spec GET /docs/openapi.json) |
| Static | `@fastify/static` serves `public/` at `/` |
| DB driver | `pg` (node-postgres) |
| Query builder | `kysely` (type-safe, no ORM) |
| Vectors | `pgvector` |
| Database | PostgreSQL 17.5 via Docker |
| Tests | Mocha + supertest + chai |

---

## Commands

```bash
npm run dev     # start src/server.ts on :3000
npm test        # Mocha, 14 tests, 10s timeout
```

Entrypoint: `src/server.ts` — do NOT use `src/index.ts` (Express legacy, ignored).

---

## Database — rules and patterns

### Connection
- URL: `postgres://admin:secret@localhost:5432/m2m_dev` (from `.env`)
- Kysely pool defined in `src/db.ts`
- All table types declared in the `Database` interface in `src/db.ts`
- Always add the column to `Database` before using it in a query

### UUID v7
- All primary keys are `UUID DEFAULT gen_random_uuid()` — PG17 generates UUID v7 natively
- No SERIAL, no integer PKs
- Corresponding Kysely types: `Generated<string>` for columns with defaults, `string` elsewhere

### Timestamps
- All timestamp columns are `TIMESTAMP NOT NULL DEFAULT now()` (without timezone)
- `src/db.ts` sets `pg.types.setTypeParser(1114, ...)` to force UTC — do not remove it

### Schema versioning
- **During development**: edit `db/schema.1.sql` directly, then recreate the DB:
  ```bash
  cd db && docker compose down && sudo rm -rf postgres_data init
  docker compose up -d && ./create-db.sh
  ```
- **After go-live**: add migration files `db/init/schemas/<version>.sql` and activate them in `db/init/migrate.sh`
- Details: `docs/SCHEMA.md`

### Migration rules (MANDATORY)
- **Migrations must never be destructive.** `DROP COLUMN` and `DROP TABLE` are forbidden in production migrations.
- If a column must be removed, the migration must first copy its data to the new structure, then add a deprecation comment — removal is a separate future version.
- Every migration must be self-contained and idempotent where possible.
- Example of a safe rename: `ADD COLUMN new_col; UPDATE ... SET new_col = old_col; -- DROP old_col in vX.Y.Z`
- The v1.1.0 migration (`DROP COLUMN match_webhook_url, message_webhook_url`) was acceptable **only** because it happened before go-live with no production data.

---

## API — mandatory patterns

### Route structure
Each route group is a file in `src/api/` that exports an `async (app: FastifyInstance)` function.
Registered in `src/app.ts`.

### Request/response schema
Use TypeBox for **all** bodies, query params and responses:
```ts
schema: {
  body: Type.Object({ ... }),
  response: {
    200: Type.Object({ ... }),
    401: Type.Object({ error: Type.String() })
  }
}
```
Shared types in `src/types.ts`.
Full spec: `docs/API.md`.

> **WARNING — nullable fields in responses:**
> `Type.Union([Type.Number(), Type.Null()])` generates `anyOf` which Fastify 5 + TypeBox
> does not handle in response serialization (causes 500).
> For nullable fields in a 200 response schema, omit the 200 schema and let
> Fastify use native `JSON.stringify`, or define only error schemas (401, 404, etc.).
> 200 response schemas should only be defined when ALL fields are non-nullable.

### Authentication
All protected routes read `Authorization: Bearer <token>` and verify against `machines.access_token`.
Helper pattern: local `getMachineId(token)` function in each route file.

### URL versioning
`/v1/` prefix on all API routes. Future breaking changes use `/v2/`, etc.

### HTTP status codes
| Case | Code |
|---|---|
| Resource creation | 201 |
| Update with no response body | 204 |
| Unauthenticated | 401 |
| Resource not found | 404 |
| Client logic error | 400 |
| Forbidden state transition | 409 |

### Private fields (never exposed in responses)

| Field | Table | Purpose |
|---|---|---|
| `price_tolerance_pct` | `announcements` | Acceptable price range (±%). Used only in matching. |

Rule: any field marked as private must not appear in any response schema or be returned by any GET route. Check before adding fields to `select`.

### Ad lifecycle
Valid status transitions for `announcements.status`:

| From | To |
|---|---|
| `active` | `frozen`, `ended` |
| `frozen` | `active`, `ended` |
| `ended` | — (terminal) |

- `GET /v1/ads/:id` — ad detail (owner only, 404 if not owner)
- `PATCH /v1/ads/:id/status` — change status; 409 if transition is not allowed

---

## Matching engine

The matching engine is in `src/matching.ts`.
Called fire-and-forget after every `POST /v1/ads`:
```ts
runMatching(result.id).catch(console.error);
```

Logic:
- Finds ads with complementary `op` (sell/buy, exchange/exchange, gift/buy)
- Filters by cosine similarity >= 0.3 on `announcements.embedding` (384-dim vectors)
- Geo filter: Haversine distance ≤ `Math.min(radius_A, radius_B)`
- Price filter: `sell.price × (1 - pct/100) ≤ buy.price × (1 + pct/100)` using `price_tolerance_pct`
- Inserts rows into `matches` with `ad_id_1 < ad_id_2` (canonical UUID v7 order)
- The `score` field is the cosine similarity value

### Webhook — match notification

After each insert, for each machine involved a POST is fired to `machines.match_webhook_url` (if set):

```json
{ "event": "match", "match_id": "<uuid-v7>" }
```

- Fire-and-forget, 5s timeout, errors silently ignored
- The receiving machine uses `match_id` to call `GET /v1/matches` with its own token
- The payload contains no data from the other machine (security)

---

## Specification documents

| File | Contents |
|---|---|
| `docs/API.md` | Full endpoint specifications |
| `docs/SCHEMA.md` | DB schema and versioning policy |
| `docs/CLIENT.md` | npm client `m2m-ads` documentation |
| `docs/SKILL.md` | OpenClaw skill documentation |
| `docs/WEB.md` | Web / landing page documentation |

---

## npm client — clients/m2m-ads

- Package: `m2m-ads`, binary: `m2m-ads`
- CLI commands: `register`, `publish`
- `DEFAULT_SERVER_URL = 'https://m2m-ads.com'`
- Overridable via config `baseUrl` (to point to localhost in tests)
- Client tests are in `clients/m2m-ads/test/` and require the server listening on :3000
- GitHub: https://github.com/6leonardo/m2m-ads
- npm: https://www.npmjs.com/package/m2m-ads

## OpenClaw client — clients/openclaw

- Skill for the OpenClaw framework
- Spec: `docs/SKILL.md`

---

## Repository — struttura e git

```
classified/
├── app/               ← PRIVATO — git separato, non distribuito
│   ├── src/
│   ├── db/
│   ├── docs/
│   ├── public/
│   └── test/
│
└── clients/           ← PUBLIC — ogni sotto-cartella e' un repo git autonomo
    ├── m2m-ads/       ← pacchetto npm pubblico (CLI + SDK)
    └── openclaw/      ← skill per il framework OpenClaw
```

**Regola git:**
- `app/` ha il proprio `.git` — non pushare su repo pubblici
- `clients/m2m-ads/` ha il proprio `.git` — distribuito su npm e GitHub
- `clients/openclaw/` ha il proprio `.git` — distribuito come skill OpenClaw
- Non mixare commit tra app e clients

---

## Stack tecnico

| Layer | Tecnologia |
|---|---|
| Runtime | Node.js 25 + `--import tsx/esm` |
| HTTP | Fastify 5 |
| Validazione | `@sinclair/typebox` (TypeBox) |
| Docs API | `@fastify/swagger` + `@scalar/fastify-api-reference` (GET /docs, spec GET /docs/openapi.json) |
| Static | `@fastify/static` serve `public/` su `/` |
| DB driver | `pg` (node-postgres) |
| Query builder | `kysely` (type-safe, niente ORM) |
| Vettori | `pgvector` |
| Database | PostgreSQL 17.5 via Docker |
| Test | Mocha + supertest + chai |

---

## Comandi

```bash
npm run dev     # avvia src/server.ts su :3000
npm test        # Mocha, 10 test, timeout 10s
```

Entrypoint: `src/server.ts` — NON usare `src/index.ts` (Express legacy, ignorato).

---

## Database — regole e pattern

### Connessione
- URL: `postgres://admin:secret@localhost:5432/m2m_dev` (da `.env`)
- Pool Kysely definito in `src/db.ts`
- Tutti i tipi delle tabelle dichiarati nell'interfaccia `Database` in `src/db.ts`
- Aggiungere sempre la colonna in `Database` prima di usarla in una query

### UUID v7
- Tutti i primary key sono `UUID DEFAULT gen_random_uuid()` — PG17 genera UUID v7 nativamente
- Niente SERIAL, niente integer PK
- I tipi Kysely corrispondenti: `Generated<string>` per colonne con default, `string` altrove

### Timestamp
- Tutte le colonne timestamp sono `TIMESTAMP NOT NULL DEFAULT now()` (senza timezone)
- In `db.ts` e' impostato `pg.types.setTypeParser(1114, ...)` per forzare UTC — non rimuoverlo

### Schema versioning
- **In sviluppo**: modifica `db/schema.1.sql` direttamente, poi ricrea il DB:
  ```bash
  cd db && docker compose down && sudo rm -rf postgres_data init
  docker compose up -d && ./create-db.sh
  ```
- **Dopo il go-live**: aggiungi `db/schema.2.sql`, `schema.3.sql`, ecc. con DO block idempotente
- Dettagli: `docs/SCHEMA.md`

---

## API — pattern obbligatori

### Struttura route
Ogni gruppo di route e' un file in `src/api/` che esporta una funzione `async (app: FastifyInstance)`.
Viene registrato in `src/app.ts`.

### Schema request/response
Usare TypeBox per **tutti** i body, query e response:
```ts
schema: {
  body: Type.Object({ ... }),
  response: {
    200: Type.Object({ ... }),
    401: Type.Object({ error: Type.String() })
  }
}
```
Tipi condivisi in `src/types.ts`.
Specifiche complete: `docs/API.md`.

> **ATTENZIONE — campi nullable nelle response:**
> `Type.Union([Type.Number(), Type.Null()])` genera `anyOf` che Fastify 5 + TypeBox
> non gestisce nella serializzazione response (errore 500).
> Per i campi nullable in un response schema 200, omettere lo schema 200 e
> lasciare che Fastify usi `JSON.stringify` nativo, oppure gestire solo gli schemi
> degli errori (401, 404, ecc.). I response schema 200 con campi nullable vanno
> definiti SOLO se tutti i campi sono non-nullable.

### Autenticazione
Tutte le route protette leggono `Authorization: Bearer <token>` e verificano in `machines.access_token`.
Pattern helper: funzione `getMachineId(token)` locale nel file di route.

### Versioning URL
Prefisso `/v1/` su tutte le route API. Futuri breaking change usano `/v2/`, ecc.

### Codici HTTP
| Caso | Codice |
|---|---|
| Creazione risorsa | 201 |
| Update senza body | 204 |
| Non autenticato | 401 |
| Risorsa non trovata | 404 |
| Errore logico client | 400 |
| Transizione di stato non permessa | 409 |

### Campi privati (mai esposti nelle response)

| Campo | Tabella | Scopo |
|---|---|---|
| `price_tolerance_pct` | `announcements` | Range accettabile intorno al prezzo (±%). Usato solo nel matching. |

Regola: qualsiasi campo marcato come privato non deve apparire in nessun response schema né essere restituito da nessuna route GET. Verificare prima di aggiungere campi alle `select`.

### Lifecycle annunci
Le transizioni di stato valide per `announcements.status` sono:

| Da | A |
|---|---|
| `active` | `frozen`, `ended` |
| `frozen` | `active`, `ended` |
| `ended` | — (terminale) |

- `GET /v1/ads/:id` — dettaglio annuncio (solo owner, 404 se non è owner)
- `PATCH /v1/ads/:id/status` — cambia stato; 409 se la transizione non è permessa

---

## Matching engine

Il motore di matching e' in `src/matching.ts`.
Viene chiamato fire-and-forget dopo ogni `POST /v1/ads`:
```ts
runMatching(result.id).catch(console.error);
```

Logica:
- Cerca annunci con `op` complementare (sell/buy, exchange/exchange, gift/gift)
- Filtra con cosine similarity >= 0.3 su `announcements.embedding` (vettori 1536-dim)
- Inserisce righe in `matches` con `ad_id_1 < ad_id_2` (ordine canonico UUID v7)
- Il campo `score` e' il valore di cosine similarity

### Webhook — notifica match

Dopo ogni inserimento, per ogni macchina coinvolta viene fatto un POST a `machines.match_webhook_url` (se configurato):

```json
{ "event": "match", "match_id": "<uuid-v7>" }
```

- Fire-and-forget, timeout 5 s, errori ignorati silenziosamente
- La macchina ricevente usa `match_id` per chiamare `GET /v1/matches` con il proprio token
- Il payload non contiene dati dell'altra macchina (sicurezza)

---

## Documenti di specifica

| File | Contenuto |
|---|---|
| `docs/API.md` | Specifiche complete degli endpoint |
| `docs/SCHEMA.md` | Schema DB e policy versioning |
| `docs/CLIENT.md` | Documentazione del client npm `m2m-ads` |
| `docs/SKILL.md` | Documentazione skill OpenClaw |
| `docs/WEB.md` | Documentazione pagina web / landing |

---

## Client npm — clients/m2m-ads

- Pacchetto: `m2m-ads`, binario: `m2m-ads`
- Comandi CLI: `register`, `publish`
- `DEFAULT_SERVER_URL = 'https://api.m2m-ads.com'`
- Overridabile via config `baseUrl` (per puntare a localhost in test)
- I test del client sono in `clients/m2m-ads/test/` e richiedono il server in ascolto su :3000

## Client OpenClaw — clients/openclaw

- Skill per il framework OpenClaw
- Specifica: `docs/SKILL.md`