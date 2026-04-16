CREATE TABLE IF NOT EXISTS users (
  ego TEXT NOT NULL COLLATE NOCASE, -- 主键
  ego_owner TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  latest_evt_seq INTEGER NOT NULL DEFAULT 0, --  ego event sequence
  latest_evt_nonce TEXT NOT NULL DEFAULT '', -- an mapping from latest_evt_seq
  create_time INTEGER NOT NULL, -- Record creation time (unix epoch in milliseconds)
  update_time INTEGER NOT NULL, -- Record update time (unix epoch in milliseconds)
  PRIMARY KEY (ego)
);

CREATE INDEX IF NOT EXISTS idx_users_ego_owner ON users (ego_owner);

CREATE TABLE IF NOT EXISTS user_events (
  ego TEXT NOT NULL, -- ego is a uuid v4 string 
  evt_seq INTEGER NOT NULL, -- (ego+evt_seq is the primary key))
  evt_type INTEGER NOT NULL, -- Event type enum
  evt_time INTEGER NOT NULL, -- Event timestamp (uint64 evtTime from proto, or tx_time)
  bagua_role INTEGER NOT NULL DEFAULT 3, -- bagua_role type enum
  create_time INTEGER NOT NULL, -- Record creation time (unix epoch in milliseconds)
  payload BLOB, -- Protobuf serialized bytes
  PRIMARY KEY (ego, evt_seq)
);

-- CREATE TABLE IF NOT EXISTS dao_events (
--   dao_evt_seq INTEGER NOT NULL, -- (ego+evt_seq is the primary key))
--   ego TEXT NOT NULL, -- ego is a uuid v4 string 
--   evt_type INTEGER NOT NULL, -- Event type enum
--   evt_time INTEGER NOT NULL, -- Event timestamp (uint64 evtTime from proto, or tx_time)
--   bagua_role INTEGER NOT NULL DEFAULT 3, -- bagua_role type enum
--   create_time INTEGER NOT NULL, -- Record creation time (unix epoch in milliseconds)
--   block_num INTEGER, -- Block number
--   tx_hash text, -- Transaction hash, NULL if not on-chain event
--   payload BLOB, -- Protobuf serialized bytes
--   PRIMARY KEY (dao_evt_seq)
-- );
-- CREATE INDEX IF NOT EXISTS idx_dao_ego ON dao_events (ego);