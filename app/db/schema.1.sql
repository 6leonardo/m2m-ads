-- M2M Classified Service — full schema v1.0.0
-- PostgreSQL 17+ required (gen_random_uuid() generates UUID v7)

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Machines ──────────────────────────────────────────────────────────────────
CREATE TABLE machines (
    machine_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_sign_key     TEXT NOT NULL,
    access_token        TEXT NOT NULL UNIQUE,
    country             VARCHAR(2),
    match_webhook_url   TEXT,
    message_webhook_url TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX machines_access_token_idx ON machines (access_token);
CREATE INDEX machines_created_at_idx   ON machines (created_at);

-- ── Challenges (PoW registration) ─────────────────────────────────────────────
CREATE TABLE challenges (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge   TEXT NOT NULL,
    difficulty  INT NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX challenges_expires_at_idx ON challenges (expires_at);

-- ── Announcements ─────────────────────────────────────────────────────────────
CREATE TABLE announcements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id  UUID NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE,
    op          VARCHAR(10) NOT NULL CHECK (op IN ('buy', 'sell', 'exchange', 'gift')),
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    price                NUMERIC,
    price_tolerance_pct  NUMERIC NOT NULL DEFAULT 0 CHECK (price_tolerance_pct >= 0 AND price_tolerance_pct <= 100),
    currency             VARCHAR(3) NOT NULL DEFAULT 'EUR',
    coord       JSONB NOT NULL,
    radius_m    INTEGER NOT NULL DEFAULT 10000,
    embedding   VECTOR(384) NOT NULL,
    status      VARCHAR(10) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'frozen', 'ended')),
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX announcements_machine_id_idx  ON announcements (machine_id);
CREATE INDEX announcements_op_idx          ON announcements (op);
CREATE INDEX announcements_status_idx      ON announcements (status);
CREATE INDEX announcements_created_at_idx  ON announcements (created_at);
CREATE INDEX announcements_embedding_cosine_idx
    ON announcements USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ── Matches ───────────────────────────────────────────────────────────────────
CREATE TABLE matches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id_1     UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    ad_id_2     UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    score       REAL NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    -- canonical order: smaller UUID first, prevents duplicate (a,b)/(b,a) pairs
    CONSTRAINT matches_order CHECK (ad_id_1 < ad_id_2),
    UNIQUE (ad_id_1, ad_id_2)
);

CREATE INDEX matches_ad_id_1_idx   ON matches (ad_id_1);
CREATE INDEX matches_ad_id_2_idx   ON matches (ad_id_2);
CREATE INDEX matches_created_at_idx ON matches (created_at);

-- ── Machine blocks ────────────────────────────────────────────────────────────
CREATE TABLE machine_blocks (
    source_machine_id   UUID NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE,
    target_machine_id   UUID NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE,
    blocked_at          TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (source_machine_id, target_machine_id)
);

CREATE INDEX machine_blocks_source_idx ON machine_blocks (source_machine_id);
CREATE INDEX machine_blocks_target_idx ON machine_blocks (target_machine_id);

-- ── Messages ──────────────────────────────────────────────────────────────────
CREATE TABLE messages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id          UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_machine_id UUID NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE,
    payload           TEXT NOT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    read_at           TIMESTAMP
);

CREATE INDEX messages_match_id_idx    ON messages (match_id);
CREATE INDEX messages_sender_idx      ON messages (sender_machine_id);
CREATE INDEX messages_created_at_idx  ON messages (created_at);
CREATE INDEX messages_unread_idx      ON messages (read_at) WHERE read_at IS NULL;

-- ── Schema version ────────────────────────────────────────────────────────────
CREATE TABLE db_version (
    id          SERIAL PRIMARY KEY,
    version     TEXT NOT NULL UNIQUE,
    applied_at  TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO db_version (version) VALUES ('1.0.0');
