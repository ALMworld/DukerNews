-- DukerRegistry + DukigenRegistry event indexer schema
-- Composite PK: (chain_eid, evt_seq) — unique per chain.
-- ═══════════════════════════════════════════════════════════
--  DUKER REGISTRY — Identity events
-- ═══════════════════════════════════════════════════════════
-- Materialized identity view (one row per user)
CREATE TABLE IF NOT EXISTS duker_users (
    token_id TEXT NOT NULL PRIMARY KEY, -- EID-encoded uint256 (globally unique across chains)
    username TEXT NOT NULL UNIQUE, -- "alice.30184" (globally unique, encodes origin chain)
    chain_eid INTEGER NOT NULL, -- chain where this identity lives
    ego TEXT NOT NULL COLLATE NOCASE, -- wallet address (case-insensitive)
    display_name TEXT NOT NULL, -- "alice"
    active INTEGER NOT NULL DEFAULT 1, -- 1: active, 0: burned
    bio TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_duker_users_ego ON duker_users (ego);

CREATE INDEX IF NOT EXISTS idx_duker_users_chain ON duker_users (chain_eid);

-- Per-agent deal DUKI bps
CREATE TABLE IF NOT EXISTS duker_preferences (
    chain_eid INTEGER NOT NULL,
    token_id TEXT NOT NULL, -- identity token
    agent_id TEXT NOT NULL, -- dukigen agent token id
    deal_duki_bps INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (chain_eid, token_id, agent_id)
);

-- Raw DukerEvent log (append-only)
CREATE TABLE IF NOT EXISTS duker_registry_events (
    chain_eid INTEGER NOT NULL,
    evt_seq INTEGER NOT NULL,
    token_id TEXT NOT NULL,
    event_type INTEGER NOT NULL,
    ego TEXT NOT NULL,
    username TEXT NOT NULL,
    evt_time INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    event_data BLOB, -- proto-serialized event payload
    PRIMARY KEY (chain_eid, evt_seq)
);

CREATE INDEX IF NOT EXISTS idx_duker_events_tx ON duker_registry_events (tx_hash);

CREATE INDEX IF NOT EXISTS idx_duker_events_token ON duker_registry_events (token_id);

-- ═══════════════════════════════════════════════════════════
--  DUKIGEN REGISTRY — Agent/payment events
-- ═══════════════════════════════════════════════════════════
-- Materialized agent view
CREATE TABLE IF NOT EXISTS dukigen_agents (
    agent_id TEXT NOT NULL PRIMARY KEY, -- uint256 as text
    name TEXT NOT NULL DEFAULT '',
    agent_uri TEXT NOT NULL DEFAULT '',
    agent_uri_hash TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL, -- wallet address
    chain_eid INTEGER NOT NULL,
    approx_bps INTEGER NOT NULL DEFAULT 0,
    product_type INTEGER NOT NULL DEFAULT 0,
    duki_type INTEGER NOT NULL DEFAULT 0,
    pledge_url TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    reputation_wallet TEXT NOT NULL DEFAULT '',
    op_contracts TEXT NOT NULL DEFAULT '[]', -- JSON array of {chainEid, contractAddr}
    reputation_d6 INTEGER NOT NULL DEFAULT 0,
    reputation_snapshot_ms INTEGER NOT NULL DEFAULT 0,
    mint_reputation_d6 INTEGER NOT NULL DEFAULT 0,
    mint_reputation_snapshot_id TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Raw DukigenEvent log (append-only)
CREATE TABLE IF NOT EXISTS dukigen_registry_events (
    chain_eid INTEGER NOT NULL,
    evt_seq INTEGER NOT NULL,
    agent_id TEXT NOT NULL,
    event_type INTEGER NOT NULL,
    ego TEXT NOT NULL,
    evt_time INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    event_data BLOB, -- proto-serialized event payload
    PRIMARY KEY (chain_eid, evt_seq)
);

CREATE INDEX IF NOT EXISTS idx_dukigen_events_tx ON dukigen_registry_events (tx_hash);

CREATE INDEX IF NOT EXISTS idx_dukigen_events_agent ON dukigen_registry_events (agent_id);

-- DukigenAgent reputation metrics, windowed by timescale.
-- One row per (agent_id, timescale). Sorted reads are cheap because the
-- composite index covers (timescale, reputation DESC, agent_id DESC) which
-- is exactly the cursor key used by ListAgentsRanked.
--
-- Reputation is treated as an opaque integer score; the producer (whether
-- an indexer, a periodic job, or a manual admin script) is responsible for
-- choosing the units. The /market UI just sorts by it.
CREATE TABLE IF NOT EXISTS dukigen_agent_metrics (
    agent_id TEXT NOT NULL, -- matches dukigen_agents.agent_id (uint256 as text)
    timescale TEXT NOT NULL, -- 'all' | 'year' | 'month' | 'week'
    reputation INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (agent_id, timescale)
);

CREATE INDEX IF NOT EXISTS idx_dukigen_agent_metrics_rank ON dukigen_agent_metrics (timescale, reputation DESC, agent_id DESC);

-- AlmWorldDukiMinter event indexer.
-- One row per DealDukiMinted log. Composite PK (chain_eid, evt_seq) — `evt_seq`
-- is the monotonic counter the contract assigns at mint time.
-- Amounts are stored as TEXT because uint256 doesn't fit in any SQLite numeric type.
CREATE TABLE IF NOT EXISTS deal_duki_minted_events (
    chain_eid INTEGER NOT NULL,
    evt_seq INTEGER NOT NULL, -- uint64, per-chain monotonic
    -- Compact sortable id: hex (evt_time:08x)(chain_eid:04x)(evt_seq:016x).
    -- Lexicographic order = (evt_time, chain_eid, evt_seq) — events near the
    -- same time across chains cluster naturally.
    id TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    evt_time INTEGER NOT NULL, -- block timestamp (unix seconds)
    yang_receiver TEXT NOT NULL COLLATE NOCASE,
    yin_receiver TEXT NOT NULL COLLATE NOCASE,
    stablecoin TEXT NOT NULL COLLATE NOCASE,
    duki_amount TEXT NOT NULL, -- d18, uint256 as text
    alm_yang_amount TEXT NOT NULL,
    alm_yin_amount TEXT NOT NULL,
    duki_d6_amount INTEGER NOT NULL,
    alm_yang_d6_amount INTEGER NOT NULL,
    alm_yin_d6_amount INTEGER NOT NULL,
    minter TEXT NOT NULL COLLATE NOCASE,
    agent_id TEXT NOT NULL, -- 0 for direct (non-agent) mints
    PRIMARY KEY (chain_eid, evt_seq)
);

-- Cross-chain time-ordered scans + watermarks for dukigen_metrics task.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_duki_minted_id ON deal_duki_minted_events (id);

-- Agent detail page filter (newest first).
CREATE INDEX IF NOT EXISTS idx_deal_duki_minted_agent ON deal_duki_minted_events (agent_id, block_number DESC, evt_seq DESC);

-- Market activity feed (newest first across all agents).
CREATE INDEX IF NOT EXISTS idx_deal_duki_minted_recent ON deal_duki_minted_events (block_number DESC, evt_seq DESC);

CREATE INDEX IF NOT EXISTS idx_deal_duki_minted_tx ON deal_duki_minted_events (tx_hash);

-- Sync cursor — last processed block and evt_seq per chain per contract.
CREATE TABLE IF NOT EXISTS sync_state (
    chain_eid INTEGER NOT NULL,
    contract_address TEXT NOT NULL COLLATE NOCASE,
    last_block_number INTEGER NOT NULL DEFAULT 0,
    last_evt_seq INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (chain_eid, contract_address)
);

-- ═══════════════════════════════════════════════════════════
--  DUKIGEN METRICS — periodic mint snapshot per agent per chain
-- ═══════════════════════════════════════════════════════════
-- Materialised sum of duki_d6_amount from deal_duki_minted_events.
-- One row per (chain_eid, agent_id). Per-chain rollup → minter_overview;
-- distinct agent_id count → total_agents in /market quick overview.
-- mint_reputation_snapshot_id is the highest deal id (sortable text id from
-- deal_duki_minted_events.id) included so far — acts as the watermark for
-- incremental updates.
CREATE TABLE IF NOT EXISTS dukigen_metrics (
    chain_eid INTEGER NOT NULL,
    agent_id TEXT NOT NULL,
    contract_addr TEXT NOT NULL COLLATE NOCASE,
    total_d6_amount INTEGER NOT NULL DEFAULT 0, -- accumulated duki_d6_amount
    transactions_count INTEGER NOT NULL DEFAULT 0, -- accumulated count of deals
    mint_reputation_snapshot_id TEXT NOT NULL DEFAULT '', -- watermark: max deal id included
    snapshot_ms INTEGER NOT NULL, -- unix milliseconds
    PRIMARY KEY (chain_eid, agent_id)
);

-- Cross-chain agent rollup (sum total_d6_amount across chains for one agent).
CREATE INDEX IF NOT EXISTS idx_dukigen_metrics_agent ON dukigen_metrics (agent_id);

-- ═══════════════════════════════════════════════════════════
--  KV CONFIG — generic JSON config (featured_agents, trending_agents, …)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS kv_config (
    cfg_key TEXT NOT NULL PRIMARY KEY,
    cfg_json_value TEXT NOT NULL,
    create_ms INTEGER NOT NULL,
    update_ms INTEGER NOT NULL
);

-- ═══════════════════════════════════════════════════════════
--  CRON STATE — interval gate (avoids KV namespace dependency)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cron_state (
    job_name TEXT NOT NULL PRIMARY KEY,
    last_run_at INTEGER NOT NULL DEFAULT 0
);