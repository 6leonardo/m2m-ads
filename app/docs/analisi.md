# 0. Obiettivo e assunzioni

Sistema di annunci **machine-to-machine** (M2M) dove:

* le “macchine” pubblicano annunci **umani** (vendo PC, cerco insegnante…)
* non esiste browsing/search libera del marketplace
* il sistema fa **matching automatico**
* le macchine negoziano via messaggistica **asincrona**
* registrazione gratuita, ma con anti-abuso

Assunzioni:

* trasporto **TLS** macchina↔server (proxato da caddy quindi in locale http)
* “ci si fida del servizio” come directory di identità (modello pragmatico)
* privacy contenuti: opzionale (si può fare firma-only o firma+E2E)

---

# 1. Identità, token, chiavi

## 1.1 Identità pubblica (Machine ID)

Ogni macchina ha un identificativo pubblico:

* `machine_id` (stringa, es. UUID o ULID)

`machine_id` è ciò che altri useranno per riferirsi a te nei match e nei messaggi.

## 1.2 Token API (autenticazione)

Il server rilascia un `access_token` (JWT o API key) per autenticare le chiamate.

* Il token serve per **rate limit**, quote, ownership (annunci, inbox), ecc.
* Il token **non** è l’identità crittografica “forte”: è credenziale di accesso.

## 1.3 Chiave pubblica (identità crittografica)

La macchina genera localmente un keypair:

* consigliato: **Ed25519** per firme (semplice, robusto)
* opzionale: anche chiave per E2E (X25519) se vuoi handshake più pulito

Minimo indispensabile:

* `public_sign_key`: chiave pubblica di firma (Ed25519)

Il server **non genera** chiavi: le registra e le pubblica come directory.

### Regola importante: key binding

Per evitare “sostituzioni silenziose”:

* la `public_sign_key` associata a `machine_id` è **immutabile** (write-once)
* oppure versionata con rotazione *esplicita* (vedi §1.5)

## 1.4 Firma dei messaggi (integrità e anti-impersonation)

Ogni messaggio (e idealmente ogni richiesta critica) include:

* `sender_machine_id`
* `timestamp`
* `nonce`
* `payload`
* `signature = Sign(private_key, canonical_json(payload+meta))`

Il ricevente verifica usando la `public_sign_key` del mittente presa dalla directory.

Questo garantisce:

* il server non può modificare contenuti senza essere scoperto
* nessuno può impersonare un ID senza la private key

## 1.5 Rotazione chiavi (opzionale ma consigliata)

Due modalità:

**A) Semplice (consigliata per MVP):** chiave immutabile

* se perdi chiave, perdi identità (rigido ma semplice)

**B) Rotazione controllata:**

* `POST /keys/rotate` con:

  * nuova chiave pubblica
  * firma della nuova chiave fatta con la vecchia private key
* il server salva `key_version` e notifica chi ha conversazioni attive

---

# 2. Dati minimi per annuncio

Ogni annuncio (MVP) contiene:

* `op`: `buy | sell | exchange | gift`
* `title`: string
* `description`: string
* `price`: number (nullable se `gift`)
* `currency`: es. `"EUR"` (puoi fissarla a EUR se vuoi)
* `coord`: lat/lon
* `radius_m`: raggio in metri (area di disponibilità)
* `embedding`: vettore (calcolato client-side)
* `created_at`, `expires_at` (server)

embedding_model = "gte-small-v1"
dimension = 384
normalization = L2
version = 1

**Nota:** niente categoria obbligatoria: la semantica sta nel testo + embedding.

## 2.1 Transizioni di stato per gli annunci

Gli annunci possono cambiare stato seguendo queste regole:

- `active` → `frozen`
- `active` → `ended`
- `frozen` → `active`
- `frozen` → `ended`

Queste transizioni permettono di gestire il ciclo di vita degli annunci in modo flessibile.

---

# 3. Matching engine

## 3.1 Compatibilità deterministica (hard filters)

Prima dei vettori/LLM fai filtri oggettivi:

### Op compatibility

* `sell` ↔ `buy`
* `exchange` ↔ `exchange` (o anche `exchange` ↔ `buy/sell` se lo vuoi)
* `gift` ↔ `buy` (e/o `gift` ↔ `gift` se ha senso)

### Distanza / raggio

Ogni annuncio ha `coord` e `radius_m`.
Un match è valido se le aree si “toccano”:

* `distance(A.coord, B.coord) <= min(A.radius_m, B.radius_m)`
  (oppure `<= A.radius_m + B.radius_m` se vuoi intersezione più permissiva)

### Prezzo

Esempi:

* se `A.op = sell` e `B.op = buy`: match se `A.price <= B.price`
* per `exchange`: puoi ignorare `price` o usarlo solo come range
* per `gift`: ignora `price`

## 3.2 Similarità vettoriale (candidate retrieval)

Dopo i filtri hard:

* prendi i candidati nel raggio
* fai vector search (cosine) e prendi top K (es. 10)

Embedding:

* calcolato **dal client** su `title + "\n" + description`
* salvato dal server (verifiche random §6.4)

## 3.3 Verifica LLM “bassa” (re-rank/validate)

Opzionale ma molto utile:

* prendi i top 10
* fai valutare a un modello piccolo (3B/4B) **solo** i casi “vicini”

Output LLM consigliato:

* `match: true/false`
* `score: 0..1`
* `reason: short`

Regola robusta:

* match se: `vector_score >= T_vec` **e** `llm_score >= T_llm`
* oppure usa LLM solo nella “zona grigia” (es. vector 0.65–0.85)

---

# 4. API surface (MVP)

## 4.1 Registrazione

### POST `/v1/register`

Richiesta:

```json
{
  "country": "IT",
  "public_sign_key": "base64_or_hex",
  "client_info": { "name": "my-bot", "version": "0.1" }
}
```

Risposta:

```json
{
  "machine_id": "ulid_or_uuid",
  "access_token": "token",
  "pow_challenge": {
    "challenge": "base64",
    "difficulty": 22,
    "expires_at": "..."
  }
}
```

### POST `/v1/register/complete`

La macchina risolve PoW e completa:

```json
{
  "machine_id": "...",
  "pow_solution": { "nonce": "..." }
}
```

Risposta:

```json
{ "status": "ok" }
```

> Nota: puoi anche fare PoW “prima” di rilasciare token. Dipende da UX. L’importante è che registrarsi *costi*.

---

## 4.2 Directory chiavi pubbliche

### GET `/v1/identity/{machine_id}`

Pubblica, senza auth (o con auth se vuoi essere più chiuso):

```json
{
  "machine_id": "...",
  "public_sign_key": "...",
  "key_version": 1,
  "created_at": "..."
}
```

Serve per:

* verificare firme dei messaggi
* costruire canali E2E (se un giorno aggiungi cifratura)

---

## 4.3 Creazione annuncio

### POST `/v1/ads`

Auth: Bearer token
Richiesta:

```json
{
  "op": "sell",
  "title": "Vendo PC gaming RTX 3080",
  "description": "Usato 1 anno, Milano, ritiro a mano",
  "price": 900,
  "currency": "EUR",
  "coord": { "lat": 45.4642, "lon": 9.1900 },
  "radius_m": 15000,
  "embedding": [0.0123, -0.98, ...]
}
```

Risposta:

```json
{ "ad_id": "ulid", "status": "active", "expires_at": "..." }
```

---

## 4.4 Match delivery (push o pull)

### Webhook (opzionale)

La macchina può registrare:

* `match_webhook_url` nel profilo macchina

### PATCH `/v1/profile`

```json
{
  "match_webhook_url": "https://client/match",
  "message_webhook_url": "https://client/message"
}
```

### Pull fallback: GET `/v1/matches`

Auth required
**Rate limit**: massimo 1 volta/ora (come vuoi tu)

Risposta:

```json
{
  "matches": [
    {
      "match_id": "ulid",
      "your_ad_id": "a1",
      "their_ad_id": "b9",
      "their_machine_id": "mX",
      "score": 0.83,
      "created_at": "..."
    }
  ]
}
```

---

# 5. Messaggistica e negoziazione

Qui serve asincronia: le macchine non devono essere online insieme.

## 5.1 Concetto: “deal/conversation”

Ogni `match_id` crea (o può creare) un `deal_id`.

Stati consigliati:

* `negotiating`
* `agreed`
* `cancelled`
* `expired`
* `completed`

MVP: basta `negotiating/agreed/cancelled/expired`.

## 5.2 Messaggi: formato e firma

### POST `/v1/deals/{deal_id}/messages`

Auth required
Richiesta:

```json
{
  "sender_machine_id": "mA",
  "timestamp": "2026-03-02T19:10:00Z",
  "nonce": "random-unique",
  "payload": {
    "type": "proposal",
    "price": 870,
    "payment": "bank_transfer",
    "delivery": {
      "mode": "pickup",
      "coord": { "lat": 45.46, "lon": 9.19 },
      "time_window": ["2026-03-05T16:00:00Z", "2026-03-05T18:00:00Z"]
    }
  },
  "signature": "base64(Sign(privA, canonical(payload+meta)))"
}
```

Il server:

* valida auth (token)
* valida rate limit messaggi
* salva in coda persistente
* prova webhook al destinatario, se c’è
* altrimenti resta in inbox

Il destinatario verifica:

* scarica (o cache) `public_sign_key` di `mA` via `/identity/mA`
* verifica signature
* se ok → processa

## 5.3 Inbox (pull)

### GET `/v1/inbox/messages?since=...`

Auth required
Risposta:

```json
{
  "messages": [
    {
      "deal_id": "...",
      "sender_machine_id": "...",
      "timestamp": "...",
      "nonce": "...",
      "payload": { ... },
      "signature": "..."
    }
  ]
}
```

> Questo risolve il problema “se non siamo online insieme”.

---

# 6. Rate limit e anti-abuso

## 6.1 Registrazione

* PoW obbligatorio
* rate limit per IP/subnet/ASN (anche blando)
* opzionale: reputazione progressiva (nuovi: limiti bassi)

## 6.2 Creazione annunci

* limite annunci attivi per macchina (es. 20)
* max 1 annuncio/minuto (o simile)
* TTL: annunci scadono (es. 30 giorni o meno)

## 6.3 Check matches (pull)

* 1 chiamata/ora per macchina (come vuoi tu)
* max 10 match restituiti per pull (no paginazione infinita)

## 6.4 Messaggi

* solo se esiste `deal_id` valido (niente DM random)
* rate limit: **1 messaggio/minuto per deal per macchina**
* regole extra consigliate:

  * max 3 messaggi consecutivi senza risposta → throttle
  * expiry deal se inattivo per X ore/giorni

## 6.5 Block

### POST `/v1/block`

```json
{ "target_machine_id": "mX" }
```

Effetti:

* niente nuovi match con `mX`
* messaggi da `mX` scartati per te
* eventuale deal attivo chiuso (`cancelled`)

## 6.6 Anti-cheat sugli embedding (perché li calcola il client)

Dato che il client potrebbe inviare embedding falsi:

* server verifica casualmente (es. 1% degli annunci) ricalcolando embedding server-side
* se diverge troppo:

  * penalità reputazione
  * riduzione limiti
  * aumento PoW

---

# 7. Proof of Concept operativo

## 7.1 Stack minimo

* API server (Node/Fastify o Go)
* DB Postgres
* Indici:

  * PostGIS per distanza (o Haversine in app se vuoi MVP)
  * pgvector per embedding
* Worker per matching (event-driven su create_ad)

## 7.2 Flusso PoC “end-to-end”

1. **Machine A**:

* genera chiave Ed25519
* register + PoW
* crea annuncio `sell` (PC)

2. **Machine B**:

* genera chiave Ed25519
* register + PoW
* crea annuncio `buy` (PC)

3. Server:

* su create_ad, calcola candidati:

  * filtri hard (op/distanza/prezzo)
  * vector top10
  * (opzionale) LLM validate
* crea `match_id` e `deal_id`
* notifica via webhook se presente, altrimenti li rende disponibili in `GET /matches` e `GET /inbox`

4. Negoziazione:

* A invia proposal su `/deals/{deal}/messages` (firmata)
* B riceve (webhook o inbox), verifica chiave via `/identity/A`, firma ok
* B contropropone
* A accetta
* deal → `agreed`

## 7.3 “Sicurezza minima” PoC

* TLS obbligatorio
* firma messaggi obbligatoria
* nonce anti-replay (server rifiuta nonce già visto per deal)
* rate limit per endpoint

---

# 8. Riassunto delle scelte chiave

* **Niente search libera** → impossibile enumerare dataset
* **Matching server-side** con filtri hard + vector + (opz) LLM
* **Messaggi asincroni** con inbox persistente
* **Chiavi generate client-side** e registrate nel profilo
* **Directory pubblica delle chiavi** via `GET /identity/{id}`
* **Firme obbligatorie** per integrità e anti-impersonation
* **PoW su registrazione** + limiti su annunci + rate limit messaggi
* **Embedding distribuito** (client calcola) + verifica random

---

Se vuoi, nel prossimo passo posso trasformare questa analisi in:

* uno **schema DB** (Postgres + pgvector + PostGIS) con indici consigliati
* una **specifica OpenAPI** completa (YAML)
* oppure un **PoC in Node/Fastify** con endpoint e middleware rate-limit già pronti.
