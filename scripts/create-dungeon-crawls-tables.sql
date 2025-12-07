    -- Dungeon Crawls System - Optimized Database Schema
    -- This system allows 60-man dungeon crawls with 3 check-in levels over 10 minutes

    -- Main dungeon crawls table (admin-configured)
    CREATE TABLE IF NOT EXISTS dungeon_crawls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    required_participants INTEGER NOT NULL DEFAULT 60,
    allow_multiple_from_stock BOOLEAN NOT NULL DEFAULT FALSE,
    allowed_traits TEXT NOT NULL DEFAULT 'all' CHECK (allowed_traits IN ('all', 'angelic', 'demonic')), -- Which traits can join: all, angelic only, or demonic only
    restart_after_failure_hours INTEGER NOT NULL DEFAULT 2, -- How often to restart after failure
    cooldown_hours INTEGER NOT NULL DEFAULT 168, -- How long to close after completion (in hours, default 7 days)
    never_restart_after_completion BOOLEAN NOT NULL DEFAULT FALSE, -- If true, never restart after successful completion
    reward_type TEXT NOT NULL CHECK (reward_type IN ('block_chance', 'life_force_cap')),
    reward_value INTEGER NOT NULL, -- e.g., 10 for +10% block chance, 20 for +20 life force
    -- Note: rewards are now permanent (no expiration), reward_duration_hours removed
    level_1_window_start_minutes INTEGER NOT NULL DEFAULT 0, -- Minutes from start
    level_1_window_duration_minutes INTEGER NOT NULL DEFAULT 2, -- 2 minute window
    level_2_window_start_minutes INTEGER NOT NULL DEFAULT 4, -- Minutes from start
    level_2_window_duration_minutes INTEGER NOT NULL DEFAULT 2, -- 2 minute window
    level_3_window_start_minutes INTEGER NOT NULL DEFAULT 8, -- Minutes from start
    level_3_window_duration_minutes INTEGER NOT NULL DEFAULT 2, -- 2 minute window
    min_participation_percent INTEGER NOT NULL DEFAULT 80, -- 80% must complete each level
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT -- Admin wallet
    );

    -- Active dungeon crawl instances (one per crawl config when open)
    CREATE TABLE IF NOT EXISTS dungeon_crawl_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crawl_id UUID NOT NULL REFERENCES dungeon_crawls(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3', 'completed', 'failed', 'expired')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    level_1_started_at TIMESTAMPTZ,
    level_1_completed_at TIMESTAMPTZ,
    level_2_started_at TIMESTAMPTZ,
    level_2_completed_at TIMESTAMPTZ,
    level_3_started_at TIMESTAMPTZ,
    level_3_completed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    last_restart_at TIMESTAMPTZ, -- When this crawl config last restarted
    next_restart_at TIMESTAMPTZ, -- When next crawl should open
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Participants in dungeon crawls
    CREATE TABLE IF NOT EXISTS dungeon_crawl_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES dungeon_crawl_instances(id) ON DELETE CASCADE,
    wallet TEXT NOT NULL,
    inscription_id TEXT NOT NULL,
    inscription_image TEXT,
    trait TEXT CHECK (trait IN ('Angelic', 'Demonic')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    level_1_completed BOOLEAN NOT NULL DEFAULT FALSE,
    level_1_completed_at TIMESTAMPTZ,
    level_2_completed BOOLEAN NOT NULL DEFAULT FALSE,
    level_2_completed_at TIMESTAMPTZ,
    level_3_completed BOOLEAN NOT NULL DEFAULT FALSE,
    level_3_completed_at TIMESTAMPTZ,
    reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
    reward_granted_at TIMESTAMPTZ,
    UNIQUE(instance_id, inscription_id) -- One inscription per instance
    );

    -- Active rewards (buffs granted to participants)
    CREATE TABLE IF NOT EXISTS dungeon_crawl_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES dungeon_crawl_instances(id) ON DELETE CASCADE,
    wallet TEXT NOT NULL,
    inscription_id TEXT, -- NULL for wallet-wide rewards, set for inscription-specific
    reward_type TEXT NOT NULL CHECK (reward_type IN ('block_chance', 'life_force_cap')),
    reward_value INTEGER NOT NULL,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- NULL for permanent rewards
    is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

    -- Reward items (earned with chance-based drops, can be applied later)
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
    expires_at TIMESTAMPTZ, -- NULL for permanent rewards (when applied)
    is_applied BOOLEAN NOT NULL DEFAULT FALSE
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawls_active ON dungeon_crawls(is_active, id);
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawls_next_restart ON dungeon_crawls(id, next_restart_at) WHERE is_active = TRUE;

    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_instances_crawl ON dungeon_crawl_instances(crawl_id, status);
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_instances_status ON dungeon_crawl_instances(status, started_at);
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_instances_next_restart ON dungeon_crawl_instances(crawl_id, next_restart_at) WHERE status IN ('completed', 'failed', 'expired');

    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_participants_instance ON dungeon_crawl_participants(instance_id);
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_participants_wallet ON dungeon_crawl_participants(wallet);
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_participants_inscription ON dungeon_crawl_participants(inscription_id);
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_participants_levels ON dungeon_crawl_participants(instance_id, level_1_completed, level_2_completed, level_3_completed);

    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_rewards_wallet ON dungeon_crawl_rewards(wallet, is_active, expires_at);
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_rewards_inscription ON dungeon_crawl_rewards(inscription_id, is_active, expires_at) WHERE inscription_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_rewards_active ON dungeon_crawl_rewards(is_active, expires_at);

    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_reward_items_wallet ON dungeon_crawl_reward_items(wallet, is_applied);
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_reward_items_applied ON dungeon_crawl_reward_items(is_applied, expires_at);
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_reward_items_inscription ON dungeon_crawl_reward_items(applied_to_inscription_id, is_applied) WHERE applied_to_inscription_id IS NOT NULL;

    -- Composite indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_participants_instance_wallet ON dungeon_crawl_participants(instance_id, wallet);
    CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_rewards_wallet_active ON dungeon_crawl_rewards(wallet, is_active) WHERE expires_at > NOW();

