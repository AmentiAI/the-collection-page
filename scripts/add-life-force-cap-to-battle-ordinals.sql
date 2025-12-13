-- Add life_force_cap column to battle_ordinals table
-- This stores the maximum life force (100 + bonuses from dungeon crawl rewards)

ALTER TABLE battle_ordinals 
ADD COLUMN IF NOT EXISTS life_force_cap INTEGER DEFAULT 100 CHECK (life_force_cap >= 100);

-- Create index on life_force_cap for filtering/sorting
CREATE INDEX IF NOT EXISTS idx_battle_ordinals_life_force_cap ON battle_ordinals(life_force_cap);

-- Populate life_force_cap from dungeon_crawl_rewards
-- Calculate the cap for each inscription: 100 (base) + sum of all active life_force_cap rewards
UPDATE battle_ordinals bo
SET life_force_cap = (
  SELECT 100 + COALESCE(SUM(dcr.reward_value), 0)::int
  FROM dungeon_crawl_rewards dcr
  WHERE LOWER(dcr.wallet) = LOWER(bo.wallet_address)
    AND dcr.inscription_id = bo.inscription_id
    AND dcr.reward_type = 'life_force_cap'
    AND dcr.is_active = TRUE
    AND (dcr.expires_at IS NULL OR dcr.expires_at > NOW())
);

-- Set default for any rows that might still be NULL (shouldn't happen, but safety check)
UPDATE battle_ordinals
SET life_force_cap = 100
WHERE life_force_cap IS NULL;

