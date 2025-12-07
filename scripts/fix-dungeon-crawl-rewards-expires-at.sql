-- Fix expires_at column to allow NULL for permanent rewards
-- The schema comment says "NULL for permanent rewards" but the column has a NOT NULL constraint

ALTER TABLE dungeon_crawl_rewards
ALTER COLUMN expires_at DROP NOT NULL;

