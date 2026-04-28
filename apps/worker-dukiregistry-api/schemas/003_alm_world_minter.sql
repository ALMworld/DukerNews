-- AlmWorldDukiMinter event indexer.
-- One row per DealDukiMinted log. Composite PK (chain_eid, sequence) — `sequence`
-- is the monotonic counter the contract assigns at mint time.
-- Amounts are stored as TEXT because uint256 doesn't fit in any SQLite numeric type.

CREATE TABLE IF NOT EXISTS deal_duki_minted_events (
    chain_eid       INTEGER NOT NULL,
    sequence        TEXT    NOT NULL,   -- uint256 as text (per-chain monotonic)
    tx_hash         TEXT    NOT NULL,
    block_number    INTEGER NOT NULL,
    evt_time        INTEGER NOT NULL,   -- block timestamp (unix seconds)
    yang_receiver   TEXT    NOT NULL COLLATE NOCASE,
    yin_receiver    TEXT    NOT NULL COLLATE NOCASE,
    stablecoin      TEXT    NOT NULL COLLATE NOCASE,
    duki_amount     TEXT    NOT NULL,   -- d18, uint256 as text
    alm_yang_amount TEXT    NOT NULL,
    alm_yin_amount  TEXT    NOT NULL,
    minter          TEXT    NOT NULL COLLATE NOCASE,
    agent_id        TEXT    NOT NULL,   -- 0 for direct (non-agent) mints
    PRIMARY KEY (chain_eid, sequence)
);

-- Agent detail page filter (newest first).
CREATE INDEX IF NOT EXISTS idx_deal_duki_minted_agent
    ON deal_duki_minted_events (agent_id, block_number DESC, sequence DESC);

-- Market activity feed (newest first across all agents).
CREATE INDEX IF NOT EXISTS idx_deal_duki_minted_recent
    ON deal_duki_minted_events (block_number DESC, sequence DESC);

CREATE INDEX IF NOT EXISTS idx_deal_duki_minted_tx
    ON deal_duki_minted_events (tx_hash);

-- Sync cursor — last processed block per chain so backfill can resume.
CREATE TABLE IF NOT EXISTS minter_sync_state (
    chain_eid          INTEGER NOT NULL PRIMARY KEY,
    last_block_indexed INTEGER NOT NULL DEFAULT 0,
    updated_at         INTEGER NOT NULL
);
