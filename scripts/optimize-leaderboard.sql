-- Leaderboard Optimization Script
-- This script creates a materialized view for fast leaderboard queries
-- and adds necessary indexes to speed up participant queries

-- Step 1: Create indexes on participant tables for faster joins
CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_wallet_lower 
  ON abyss_summon_participants(LOWER(wallet));

CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_summon 
  ON abyss_summon_participants(summon_id);

CREATE INDEX IF NOT EXISTS idx_damned_pool_participants_wallet_lower 
  ON damned_pool_participants(LOWER(wallet));

CREATE INDEX IF NOT EXISTS idx_damned_pool_participants_circle 
  ON damned_pool_participants(circle_id);

CREATE INDEX IF NOT EXISTS idx_dead_demons_participants_wallet_lower 
  ON dead_demons_participants(LOWER(wallet));

CREATE INDEX IF NOT EXISTS idx_dead_demons_participants_circle 
  ON dead_demons_participants(circle_id);

-- Step 2: Create indexes on circle tables
CREATE INDEX IF NOT EXISTS idx_abyss_summons_creator_lower 
  ON abyss_summons(LOWER(creator_wallet));

CREATE INDEX IF NOT EXISTS idx_abyss_summons_status 
  ON abyss_summons(status) 
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_damned_pool_circles_creator_lower 
  ON damned_pool_circles(LOWER(creator_wallet));

CREATE INDEX IF NOT EXISTS idx_damned_pool_circles_status 
  ON damned_pool_circles(status) 
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_dead_demons_circles_creator_lower 
  ON dead_demons_circles(LOWER(creator_wallet));

CREATE INDEX IF NOT EXISTS idx_dead_demons_circles_status 
  ON dead_demons_circles(status) 
  WHERE status = 'completed';

-- Step 3: Create materialized view for leaderboard stats
-- This pre-aggregates all the data for fast queries
DROP MATERIALIZED VIEW IF EXISTS leaderboard_stats_mv;

CREATE MATERIALIZED VIEW leaderboard_stats_mv AS
WITH completed_circles AS (
  -- Abyss summons
  SELECT 
    id,
    LOWER(creator_wallet) AS wallet,
    completed_at,
    'abyss' AS circle_type
  FROM abyss_summons
  WHERE status = 'completed'
  
  UNION ALL
  
  -- Damned pool (portal) circles
  SELECT 
    id,
    LOWER(creator_wallet) AS wallet,
    completed_at,
    'damned_pool' AS circle_type
  FROM damned_pool_circles
  WHERE status = 'completed'
  
  UNION ALL
  
  -- Dead demons circles
  SELECT 
    id,
    LOWER(creator_wallet) AS wallet,
    completed_at,
    'dead_demons' AS circle_type
  FROM dead_demons_circles
  WHERE status = 'completed'
),
hosted_stats AS (
  SELECT 
    wallet,
    COUNT(*) AS hosted_count,
    MAX(completed_at) AS last_hosted_at
  FROM completed_circles
  GROUP BY wallet
),
participation_stats AS (
  SELECT 
    wallet,
    COUNT(*) AS participations,
    MAX(last_participated_at) AS last_participated_at
  FROM (
    -- Abyss participants
    SELECT 
      LOWER(asp.wallet) AS wallet,
      s.completed_at AS last_participated_at
    FROM abyss_summon_participants asp
    INNER JOIN abyss_summons s ON s.id = asp.summon_id
    WHERE s.status = 'completed'
    
    UNION ALL
    
    -- Damned pool participants
    SELECT 
      LOWER(dpp.wallet) AS wallet,
      dpc.completed_at AS last_participated_at
    FROM damned_pool_participants dpp
    INNER JOIN damned_pool_circles dpc ON dpc.id = dpp.circle_id
    WHERE dpc.status = 'completed'
    
    UNION ALL
    
    -- Dead demons participants
    SELECT 
      LOWER(ddp.wallet) AS wallet,
      ddc.completed_at AS last_participated_at
    FROM dead_demons_participants ddp
    INNER JOIN dead_demons_circles ddc ON ddc.id = ddp.circle_id
    WHERE ddc.status = 'completed'
  ) t
  GROUP BY wallet
),
burns_stats AS (
  SELECT 
    LOWER(ordinal_wallet) AS wallet,
    COUNT(*) AS burn_count,
    COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_burn_count,
    MAX(updated_at) AS last_burn_at
  FROM abyss_burns
  GROUP BY LOWER(ordinal_wallet)
),
combined_wallets AS (
  SELECT wallet FROM hosted_stats
  UNION
  SELECT wallet FROM participation_stats
)
SELECT
  c.wallet,
  COALESCE(b.burn_count, 0) AS burns,
  COALESCE(b.confirmed_burn_count, 0) AS confirmed_burn_count,
  COALESCE(h.hosted_count, 0) AS hosted_count,
  COALESCE(p.participations, 0) AS participations,
  b.last_burn_at,
  h.last_hosted_at,
  p.last_participated_at,
  (COALESCE(b.burn_count, 0) * 6)
    + (COALESCE(h.hosted_count, 0) * 2)
    + (COALESCE(p.participations, 0) * 1) AS score
FROM combined_wallets c
LEFT JOIN burns_stats b ON b.wallet = c.wallet
LEFT JOIN hosted_stats h ON h.wallet = c.wallet
LEFT JOIN participation_stats p ON p.wallet = c.wallet
WHERE COALESCE(h.hosted_count, 0) > 0 OR COALESCE(p.participations, 0) > 0;

-- Step 4: Create index on materialized view for fast sorting
CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_stats_mv_wallet 
  ON leaderboard_stats_mv(wallet);

CREATE INDEX IF NOT EXISTS idx_leaderboard_stats_mv_score 
  ON leaderboard_stats_mv(score DESC, burns DESC, hosted_count DESC, participations DESC);

-- Step 5: Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_leaderboard_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_stats_mv;
END;
$$;

-- Step 6: Initial refresh
REFRESH MATERIALIZED VIEW leaderboard_stats_mv;

-- Step 7: Optional - Create a scheduled job (requires pg_cron extension)
-- Uncomment if you have pg_cron installed:
-- SELECT cron.schedule('refresh-leaderboard', '*/5 * * * *', 'SELECT refresh_leaderboard_stats()');

COMMENT ON MATERIALIZED VIEW leaderboard_stats_mv IS 'Pre-aggregated leaderboard stats for fast queries. Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_stats_mv;';

