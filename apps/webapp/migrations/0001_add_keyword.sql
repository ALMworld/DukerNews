-- Add keyword column to posts (replaces product_tags repeated-string in WorksPostData).
-- Stored denormalized for SQL filtering; authoritative value is in post_data blob.
ALTER TABLE posts ADD COLUMN keyword TEXT NOT NULL DEFAULT '';
