-- DukigenAgent credibility metrics, windowed by timescale.
-- One row per (agent_id, timescale). Sorted reads are cheap because the
-- composite index covers (timescale, credibility DESC, agent_id DESC) which
-- is exactly the cursor key used by ListAgentsRanked.
--
-- Credibility is treated as an opaque integer score; the producer (whether
-- an indexer, a periodic job, or a manual admin script) is responsible for
-- choosing the units. The /market UI just sorts by it.

CREATE TABLE IF NOT EXISTS dukigen_agent_metrics (
    agent_id    TEXT    NOT NULL,                          -- matches dukigen_agents.agent_id (uint256 as text)
    timescale   TEXT    NOT NULL,                          -- 'all' | 'year' | 'month' | 'week'
    credibility INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (agent_id, timescale)
);

CREATE INDEX IF NOT EXISTS idx_dukigen_agent_metrics_rank
    ON dukigen_agent_metrics (timescale, credibility DESC, agent_id DESC);
