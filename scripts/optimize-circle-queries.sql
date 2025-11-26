-- Circle Query Optimization Script
-- Adds indexes to speed up participant queries and Discord user lookups

-- Step 1: Create indexes on profiles for faster wallet lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_lower 
  ON profiles(LOWER(wallet_address));

-- Step 2: Create indexes on participant tables for faster joins
-- (These may already exist from leaderboard optimization, but ensure they're there)
CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_summon 
  ON abyss_summon_participants(summon_id);

CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_wallet_lower 
  ON abyss_summon_participants(LOWER(wallet));

CREATE INDEX IF NOT EXISTS idx_damned_pool_participants_circle 
  ON damned_pool_participants(circle_id);

CREATE INDEX IF NOT EXISTS idx_damned_pool_participants_wallet_lower 
  ON damned_pool_participants(LOWER(wallet));

CREATE INDEX IF NOT EXISTS idx_dead_demons_participants_circle 
  ON dead_demons_participants(circle_id);

CREATE INDEX IF NOT EXISTS idx_dead_demons_participants_wallet_lower 
  ON dead_demons_participants(LOWER(wallet));

CREATE INDEX IF NOT EXISTS idx_summoning_powder_participants_circle 
  ON summoning_powder_participants(circle_id);

CREATE INDEX IF NOT EXISTS idx_summoning_powder_participants_wallet_lower 
  ON summoning_powder_participants(LOWER(wallet));


-- Step 4: Create composite indexes for common query patterns
-- These help when filtering by status and joining participants
CREATE INDEX IF NOT EXISTS idx_abyss_summons_status_created 
  ON abyss_summons(status, created_at DESC) 
  WHERE status IN ('open', 'filling', 'ready');

CREATE INDEX IF NOT EXISTS idx_damned_pool_circles_status_created 
  ON damned_pool_circles(status, created_at DESC) 
  WHERE status IN ('open', 'filling', 'ready');

CREATE INDEX IF NOT EXISTS idx_dead_demons_circles_status_created 
  ON dead_demons_circles(status, created_at DESC) 
  WHERE status IN ('open', 'filling', 'ready');

CREATE INDEX IF NOT EXISTS idx_summoning_powder_circles_status_created 
  ON summoning_powder_circles(status, created_at DESC) 
  WHERE status IN ('open', 'filling', 'ready');

-- Step 5: Analyze tables to update statistics for query planner
ANALYZE profiles;
ANALYZE discord_users;
ANALYZE abyss_summon_participants;
ANALYZE damned_pool_participants;
ANALYZE dead_demons_participants;
ANALYZE summoning_powder_participants;
ANALYZE abyss_summons;
ANALYZE damned_pool_circles;
ANALYZE dead_demons_circles;
ANALYZE summoning_powder_circles;

COMMENT ON INDEX idx_profiles_wallet_lower IS 'Speeds up case-insensitive wallet lookups in participant queries';
COMMENT ON INDEX idx_discord_users_profile_id IS 'Speeds up Discord user lookups when joining with profiles';

