# 1️⃣ Registrazione (PoW)

## ✅ `POST /v1/register/init`

Risposta:

```json
{
  "challenge": "base64_random",
  "difficulty": 22,
  "expires_at": "2026-03-02T20:00:00Z"
}
```

Perfetto.

---

## ⚠ `POST /v1/register/complete`

Meglio così:

```json
{
  "challenge": "...",
  "nonce": 93847293,
  "public_sign_key": "...",
  "country": "IT"
}
```

Risposta:

```json
{
  "machine_id": "ulid",
  "access_token": "jwt_or_token"
}
```

Nota importante:

* `challenge` deve essere monouso
* server deve invalidarlo dopo uso
* verificare `expires_at`

---

# 2️⃣ Hook (webhook)

Perfetto ma formalizziamo:

## `PUT /v1/hooks`

```json
{
  "match_webhook_url": "https://...",
  "message_webhook_url": "https://..."
}
```

Per cancellare:

* invii `null`

## `GET /v1/hooks`

Restituisce configurazione attuale.

✔ Chiaro.

---

# 3️⃣ Annunci (`classified` → meglio `ads`)

Ti suggerisco di chiamarlo `ads` per pulizia semantica.

## `POST /v1/ads`

Crea annuncio.

## `PUT /v1/ads/{ad_id}`

Update (solo se owner).

## `GET /v1/ads/{ad_id}`

Solo propri annunci ✔ corretto.

---

## `GET /v1/ads`

Lista propri annunci attivi.

Perfetto.

---

# 4️⃣ Matching

Meglio separare bene.

## `GET /v1/matches`

Restituisce:

```json
{
  "matches": [
    {
      "match_id": "ulid",
      "your_ad_id": "a1",
      "their_ad_id": "b9",
      "their_machine_id": "mX",
      "matched_at": "..."
    }
  ]
}
```

Non chiamarlo `classified/matches`.
Meglio `/matches`.

---

# 5️⃣ Tabella matches (SQL)

Meglio così:

```sql
CREATE TABLE matches (
    id UUID PRIMARY KEY,
    ad_id_1 UUID NOT NULL,
    ad_id_2 UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(ad_id_1, ad_id_2)
);
```

Meglio anche:

* ordinare sempre ad_id_1 < ad_id_2 per evitare duplicati invertiti.

---

# 6️⃣ Machine blocked

Va bene ma aggiungiamo vincolo unico:

```sql
CREATE TABLE machine_blocks (
    source_machine_id UUID NOT NULL,
    target_machine_id UUID NOT NULL,
    blocked_at TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (source_machine_id, target_machine_id)
);
```

---

# 7️⃣ Messaggi (qui sistemiamo bene)

Meglio introdurre concetto di `deal_id`.

Perché:

* un match può avere più messaggi
* non vuoi usare `ad_id` come canale diretto

---

## `POST /v1/deals/{deal_id}/messages`

Richiesta:

```json
{
  "payload": "...encrypted text...",
  "signature": "..."
}
```

Meglio NON passare `dest_machine`:

* il deal già identifica le parti

---

## `GET /v1/inbox`

Restituisce messaggi non letti.

---

## Tabella messages

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    deal_id UUID NOT NULL,
    sender_machine_id UUID NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    read_at TIMESTAMP
);
```

Indice:

* su deal_id
* su read_at IS NULL

---

# 8️⃣ `messages/block`

Meglio non sotto `/messages`.

Usa:

## `PUT /v1/block`

```json
{
  "target_machine_id": "...",
  "blocked": true
}
```

Chiaro e indipendente.

---

# 9️⃣ Public keys

Meglio pubblico e senza token (o opzionale token):

## `GET /v1/identity/{machine_id}`

Risposta:

```json
{
  "machine_id": "...",
  "public_sign_key": "...",
  "key_version": 1
}
```

Non chiamarlo `public-keys`, usa `identity`.

---

# 1️⃣0️⃣ Rate limit integrato

Definiamo regole formali:

| Endpoint          | Limite            |
| ----------------- | ----------------- |
| register/init     | 5/min/IP          |
| register/complete | challenge monouso |
| ads create        | 1/min/machine     |
| matches           | 1/h               |
| messages send     | 1/min/deal        |
| inbox             | 1/min             |

---

# 1️⃣1️⃣ Stato annunci

Ricordiamo:

```sql
status ENUM('active','frozen','ended') DEFAULT 'active'
```

Matching solo su `active`.

---

# 1️⃣2️⃣ Piccola correzione concettuale importante

Attualmente nel tuo schema:

> messages/send post
> dest machine, id annuncio

Questo è pericoloso.

Meglio:

* un match crea un deal
* un deal crea il canale messaggi
* niente messaggi diretti fuori da deal

Così eviti spam cross-annuncio.

---

# 🎯 Valutazione finale

Architettura attuale:

* superficie API piccola ✔
* no search globale ✔
* matching server-side ✔
* PoW registrazione ✔
* messaggi rate-limited ✔
* blocco ✔
* chiavi pubbliche directory ✔

È sorprendentemente coerente per un MVP.

