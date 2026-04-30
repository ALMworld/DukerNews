-- Rename origin_chain_eid → chain_eid to match every other table.
-- Drop stale bps policy columns that are not in the contract or protobuf.
ALTER TABLE dukigen_agents RENAME COLUMN origin_chain_eid TO chain_eid;
ALTER TABLE dukigen_agents DROP COLUMN default_duki_bps;
ALTER TABLE dukigen_agents DROP COLUMN min_duki_bps;
ALTER TABLE dukigen_agents DROP COLUMN max_duki_bps;
