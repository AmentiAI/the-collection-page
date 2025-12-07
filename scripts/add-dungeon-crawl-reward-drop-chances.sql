-- Add configurable reward drop chance fields to dungeon_crawls table
-- These control the probability of each ordinal winning a reward based on how many a wallet uses

ALTER TABLE dungeon_crawls 
ADD COLUMN IF NOT EXISTS reward_drop_chance_1_ordinal INTEGER NOT NULL DEFAULT 20,
ADD COLUMN IF NOT EXISTS reward_drop_chance_2_ordinals INTEGER NOT NULL DEFAULT 10,
ADD COLUMN IF NOT EXISTS reward_drop_chance_3plus_ordinals INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN dungeon_crawls.reward_drop_chance_1_ordinal IS 'Drop chance percentage (0-100) per ordinal when wallet uses 1 ordinal';
COMMENT ON COLUMN dungeon_crawls.reward_drop_chance_2_ordinals IS 'Drop chance percentage (0-100) per ordinal when wallet uses 2 ordinals';
COMMENT ON COLUMN dungeon_crawls.reward_drop_chance_3plus_ordinals IS 'Drop chance percentage (0-100) per ordinal when wallet uses 3 or more ordinals';

