-- Performance optimizations for mega_monster_attack_logs table
-- Add indexes for fast queries on large datasets

-- Index on wallet_address for user-specific queries
CREATE INDEX IF NOT EXISTS idx_attack_logs_wallet ON mega_monster_attack_logs(wallet_address);

-- Index on created_at for time-based queries and sorting
CREATE INDEX IF NOT EXISTS idx_attack_logs_created_at ON mega_monster_attack_logs(created_at DESC);

-- Composite index for common query pattern (wallet + time)
CREATE INDEX IF NOT EXISTS idx_attack_logs_wallet_time ON mega_monster_attack_logs(wallet_address, created_at DESC);

-- Index on monster_id for monster-specific queries
CREATE INDEX IF NOT EXISTS idx_attack_logs_monster ON mega_monster_attack_logs(monster_id);

-- Index on army_id for joining with battle_ordinals
CREATE INDEX IF NOT EXISTS idx_attack_logs_army ON mega_monster_attack_logs(army_id);

-- Add trait column to attack logs for side-based aggregation
ALTER TABLE mega_monster_attack_logs 
ADD COLUMN IF NOT EXISTS trait TEXT CHECK (trait IN ('Angelic', 'Demonic'));

-- Index on trait for leaderboard aggregation queries
CREATE INDEX IF NOT EXISTS idx_attack_logs_trait ON mega_monster_attack_logs(trait);

-- Composite index for trait + time queries
CREATE INDEX IF NOT EXISTS idx_attack_logs_trait_time ON mega_monster_attack_logs(trait, created_at DESC);

