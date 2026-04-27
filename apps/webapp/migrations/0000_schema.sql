-- Duker News — Unified D1 Schema
-- Consolidation of all migrations (0001–0005)
-- Drop and recreate for dev environments
-- Users
CREATE TABLE IF NOT EXISTS users (
  address TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
  username TEXT UNIQUE NOT NULL,                 -- primary in-use identity
  chain_identities TEXT NOT NULL DEFAULT '[]',   -- JSON: [{chainEid,username,tokenId}, …]
  karma INTEGER DEFAULT 1,
  about TEXT DEFAULT '',
  email TEXT DEFAULT '',
  duki_bps INTEGER DEFAULT 0,
  latest_evt_seq INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL REFERENCES users (username),
  title TEXT NOT NULL,
  url TEXT,
  domain TEXT,
  text TEXT,
  title_en TEXT DEFAULT '',
  url_en TEXT DEFAULT '',
  text_en TEXT DEFAULT '',
  kind TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  post_data BLOB,
  boost_amount INTEGER DEFAULT 0,
  total_boost INTEGER DEFAULT 0,
  points INTEGER DEFAULT 1,
  comment_count INTEGER DEFAULT 0,
  flags INTEGER DEFAULT 0,
  dead INTEGER DEFAULT 0,
  latest_evt_seq INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_points ON posts (points DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_total_boost ON posts (total_boost DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_kind ON posts (kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_username ON posts (username);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts (id),
  username TEXT NOT NULL REFERENCES users (username),
  text TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  parent_id INTEGER REFERENCES comments (id),
  ancestor_path TEXT NOT NULL DEFAULT '',
  depth INTEGER NOT NULL DEFAULT 0,
  points INTEGER DEFAULT 1,
  boost_amount INTEGER DEFAULT 0,
  total_boost INTEGER DEFAULT 0,
  dead INTEGER DEFAULT 0,
  latest_evt_seq INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id, ancestor_path);

CREATE INDEX IF NOT EXISTS idx_comments_username ON comments (username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);

-- User Interactions (bitmask: bits 0-1=vote, bit 2=flag, bit 3=hide, bit 4=favorite, bit 5=vouch, bit 6=boost)
-- agg_type stores AggType integer: 2=post, 3=comment
CREATE TABLE IF NOT EXISTS user_interactions (
  username TEXT NOT NULL,
  agg_type INTEGER NOT NULL,
  agg_id INTEGER NOT NULL,
  bits_flag INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (username, agg_type, agg_id)
);

CREATE INDEX IF NOT EXISTS idx_ui_item ON user_interactions (agg_type, agg_id);

CREATE INDEX IF NOT EXISTS idx_ui_user ON user_interactions (username, updated_at DESC);

-- Events (on-chain source of truth — evt_seq from contract, NOT autoincrement)
CREATE TABLE IF NOT EXISTS events (
  evt_seq INTEGER PRIMARY KEY, -- on-chain DukerEvent.evtSeq
  address TEXT NOT NULL, -- actor wallet address
  username TEXT NOT NULL, -- actor username
  evt_type INTEGER NOT NULL, -- EventType enum value
  agg_type INTEGER NOT NULL DEFAULT 0, -- AggType enum: 0=unspecified, 1=user, 2=works
  agg_id INTEGER NOT NULL DEFAULT 0, -- aggregate ID from contract
  evt_time INTEGER NOT NULL, -- block.timestamp
  block_number INTEGER NOT NULL DEFAULT 0, -- block number the event was emitted in
  tx_hash TEXT NOT NULL DEFAULT '', -- transaction hash
  user_evt_seq INTEGER NOT NULL DEFAULT 0, -- per-user event sequence
  payload BLOB, -- protobuf EventData bytes
  created_at INTEGER NOT NULL -- indexing timestamp
);

CREATE INDEX IF NOT EXISTS idx_events_address ON events (address, evt_seq);

CREATE INDEX IF NOT EXISTS idx_events_agg ON events (agg_type, agg_id, evt_seq);

CREATE INDEX IF NOT EXISTS idx_events_tx_hash ON events (tx_hash);

-- x402 payment state machine — tracks every payment through verify → settled → executed
CREATE TABLE IF NOT EXISTS duker_payments (
  id TEXT PRIMARY KEY, -- idempotency key: keccak256(user:action:params)
  payer_address TEXT NOT NULL COLLATE NOCASE, -- user wallet address
  pay_to TEXT NOT NULL COLLATE NOCASE, -- recipient address (contract or operator)
  amount INTEGER NOT NULL, -- payment amount (micro-units, e.g. 1000000 = 1 USDT)
  token_address TEXT NOT NULL COLLATE NOCASE, -- stablecoin contract address
  chain_id INTEGER NOT NULL, -- chain ID (196 = XLayer)
  -- business context
  evt_type INTEGER NOT NULL, -- EventType enum (USER_MINTED, POST_CREATED, etc.)
  action_params TEXT, -- JSON: business-specific params (username, dukiBps, etc.)
  -- payment signature
  payment_scheme TEXT NOT NULL, -- 'eip3009' | 'eip2612' | 'mock'
  payment_data BLOB, -- serialized PaymentData proto (for retry)
  -- state machine: verified → settled → executed | failed
  status TEXT NOT NULL DEFAULT 'verified',
  -- on-chain evidence
  settle_tx_hash TEXT, -- OKX settle / mock mint tx hash
  exec_tx_hash TEXT, -- contract execution tx hash
  -- error tracking
  error_msg TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_duker_payments_status ON duker_payments (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_duker_payments_payer ON duker_payments (payer_address, created_at DESC);

-- Translations (server-side cache)
CREATE TABLE IF NOT EXISTS translations (
  tid TEXT NOT NULL,
  locale TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tid, locale)
);