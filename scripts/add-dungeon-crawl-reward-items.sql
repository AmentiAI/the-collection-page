-- Add reward items system for dungeon crawls
-- Items are earned with chance-based drops and can be applied later

CREATE TABLE IF NOT EXISTS dungeon_crawl_reward_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES dungeon_crawl_instances(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  inscription_id TEXT, -- The ordinal that earned it (can be NULL if not tied to specific ordinal)
  reward_type TEXT NOT NULL CHECK (reward_type IN ('block_chance', 'life_force_cap')),
  reward_value INTEGER NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  applied_to_inscription_id TEXT, -- Which ordinal it's applied to (NULL if not applied yet)
  applied_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- When the applied reward expires (NULL if not applied yet)
  is_applied BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_reward_items_wallet ON dungeon_crawl_reward_items(wallet, is_applied);
CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_reward_items_applied ON dungeon_crawl_reward_items(is_applied, expires_at);
CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_reward_items_inscription ON dungeon_crawl_reward_items(applied_to_inscription_id, is_applied) WHERE applied_to_inscription_id IS NOT NULL;

-- Drop the old automatic rewards table (or keep it for backwards compatibility, but we'll use items now)
-- We'll keep dungeon_crawl_rewards for tracking applied items


