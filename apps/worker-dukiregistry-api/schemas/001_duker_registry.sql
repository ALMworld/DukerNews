-- DukerRegistry + DukigenRegistry event indexer schema
-- Composite PK: (chain_eid, evt_seq) — unique per chain.

-- ═══════════════════════════════════════════════════════════
--  DUKER REGISTRY — Identity events
-- ═══════════════════════════════════════════════════════════

-- Materialized identity view (one row per user per chain)
CREATE TABLE IF NOT EXISTS duker_users (
    chain_eid       INTEGER NOT NULL,
    token_id        TEXT    NOT NULL,   -- uint256 as text
    owner           TEXT    NOT NULL,   -- wallet address (lower-case)
    username        TEXT    NOT NULL,   -- "alice.30184"
    display_name    TEXT    NOT NULL,   -- "alice"
    origin_eid      INTEGER NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'active', -- active | burned
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    PRIMARY KEY (chain_eid, token_id)
);

CREATE INDEX IF NOT EXISTS idx_duker_users_owner ON duker_users(owner);
CREATE INDEX IF NOT EXISTS idx_duker_users_username ON duker_users(username);

-- Per-agent DUKI bps preferences
CREATE TABLE IF NOT EXISTS duker_preferences (
    chain_eid       INTEGER NOT NULL,
    token_id        TEXT    NOT NULL,   -- identity token
    agent_id        TEXT    NOT NULL,   -- dukigen agent token id
    prefer_bps      INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL,
    PRIMARY KEY (chain_eid, token_id, agent_id)
);

-- Raw DukerEvent log (append-only)
CREATE TABLE IF NOT EXISTS duker_registry_events (
    chain_eid    INTEGER NOT NULL,
    evt_seq      INTEGER NOT NULL,
    token_id     TEXT    NOT NULL,
    event_type   INTEGER NOT NULL,
    ego          TEXT    NOT NULL,
    username     TEXT    NOT NULL,
    evt_time     INTEGER NOT NULL,
    tx_hash      TEXT    NOT NULL,
    block_number INTEGER NOT NULL,
    event_data   TEXT,   -- JSON-encoded event-specific data
    PRIMARY KEY (chain_eid, evt_seq)
);

CREATE INDEX IF NOT EXISTS idx_duker_events_tx ON duker_registry_events(tx_hash);
CREATE INDEX IF NOT EXISTS idx_duker_events_token ON duker_registry_events(token_id);

-- ═══════════════════════════════════════════════════════════
--  DUKIGEN REGISTRY — Agent/payment events
-- ═══════════════════════════════════════════════════════════

-- Materialized agent view
CREATE TABLE IF NOT EXISTS dukigen_agents (
    agent_id         TEXT    NOT NULL PRIMARY KEY,  -- uint256 as text
    name             TEXT    NOT NULL DEFAULT '',
    agent_uri        TEXT    NOT NULL DEFAULT '',
    owner            TEXT    NOT NULL,   -- wallet address
    origin_chain_eid INTEGER NOT NULL,
    default_duki_bps INTEGER NOT NULL DEFAULT 5000,
    min_duki_bps     INTEGER NOT NULL DEFAULT 5000,
    max_duki_bps     INTEGER NOT NULL DEFAULT 9900,
    product_type     INTEGER NOT NULL DEFAULT 0,
    duki_type        INTEGER NOT NULL DEFAULT 0,
    pledge_url       TEXT    NOT NULL DEFAULT '',
    tags             TEXT    NOT NULL DEFAULT '[]', -- JSON array
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
);

-- Raw DukigenEvent log (append-only)
CREATE TABLE IF NOT EXISTS dukigen_registry_events (
    chain_eid    INTEGER NOT NULL,
    evt_seq      INTEGER NOT NULL,
    agent_id     TEXT    NOT NULL,
    event_type   INTEGER NOT NULL,
    ego          TEXT    NOT NULL,
    evt_time     INTEGER NOT NULL,
    tx_hash      TEXT    NOT NULL,
    block_number INTEGER NOT NULL,
    event_data   TEXT,   -- JSON-encoded event-specific data
    PRIMARY KEY (chain_eid, evt_seq)
);

CREATE INDEX IF NOT EXISTS idx_dukigen_events_tx ON dukigen_registry_events(tx_hash);
CREATE INDEX IF NOT EXISTS idx_dukigen_events_agent ON dukigen_registry_events(agent_id);
