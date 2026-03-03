# AGENTS.md — M2M Classified Service

File letto da agenti AI (Copilot, Codex, Claude, ecc.).
Contiene regole, pattern obbligatori e mappa del repository.
Non modificare la struttura senza aggiornare questo file.

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