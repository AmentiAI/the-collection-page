import { Pool } from 'pg'
import { dbConfig } from './supabase'

// Create a connection pool
let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    if (!dbConfig) {
      throw new Error('Database configuration is not set. Please set NEON_DB or SUPABASE_DB environment variable.')
    }
    
    if (!dbConfig.host || !dbConfig.database || !dbConfig.user || !dbConfig.password) {
      throw new Error('Database configuration is incomplete')
    }
    
    pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      ssl: {
        rejectUnauthorized: false // Neon requires SSL, but we don't need certificate validation
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // 10 seconds
      query_timeout: 30000, // 30 seconds for queries
      statement_timeout: 30000, // 30 seconds for statements
    })
  }
  
  return pool
}

// Initialize database tables
export async function initDatabase() {
  const pool = getPool()
  
  try {
    // Drop all tables first (in correct order to handle foreign key constraints)
    console.log('🗑️ Dropping all existing tables...')
    
    // Drop dependent tables first
    await pool.query(`DROP TABLE IF EXISTS user_task_completions CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS duality_events CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS duality_trials CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS duality_pairs CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS duality_participants CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS karma_points CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS ordinal_sales CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS verification_codes CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS discord_users CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS twitter_users CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS flashnet_pools CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS flashnet_token_metadata CASCADE`)
    
    // Drop main tables
    await pool.query(`DROP TABLE IF EXISTS duality_cycles CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS profiles CASCADE`)
    await pool.query(`DROP TABLE IF EXISTS karma_tasks CASCADE`)
    
    // Drop triggers and functions
    await pool.query(`DROP TRIGGER IF EXISTS trigger_update_profile_karma ON karma_points`)
    await pool.query(`DROP FUNCTION IF EXISTS update_profile_karma() CASCADE`)
    
    console.log('✅ All tables dropped successfully')
    
    // Create profiles table
    await pool.query(`
      CREATE TABLE profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT UNIQUE NOT NULL,
        username TEXT,
        avatar_url TEXT,
        payment_address TEXT,
        total_good_karma INTEGER DEFAULT 0,
        total_bad_karma INTEGER DEFAULT 0,
        last_ordinal_count INTEGER DEFAULT 0,
        current_ordinal_count INTEGER DEFAULT 0,
        has_holder_role BOOLEAN DEFAULT false,
        last_holder_check TIMESTAMPTZ,
        last_daily_checkin TIMESTAMPTZ,
        chosen_side TEXT CHECK (chosen_side IN ('good', 'evil')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create karma_points table
    await pool.query(`
      CREATE TABLE karma_points (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        points INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('good', 'evil')),
        reason TEXT,
        given_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create indexes
    await pool.query(`
      CREATE INDEX idx_karma_points_profile_id ON karma_points(profile_id)
    `)
    
    await pool.query(`
      CREATE INDEX idx_karma_points_created_at ON karma_points(created_at DESC)
    `)
    
    await pool.query(`
      CREATE INDEX idx_profiles_wallet_address ON profiles(wallet_address)
    `)

    // Create discord_users table - simple Discord info only (no ordinal counts, no holder role status, no wallet_address)
    await pool.query(`
      CREATE TABLE discord_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        discord_user_id TEXT UNIQUE NOT NULL,
        profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        verified_at TIMESTAMPTZ DEFAULT NOW(),
        last_checked_at TIMESTAMPTZ,
        last_checkin TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    


    await pool.query(`
      CREATE INDEX idx_discord_users_discord_id ON discord_users(discord_user_id)
    `)

    await pool.query(`
      CREATE INDEX idx_discord_users_profile_id ON discord_users(profile_id)
    `)

    // Create twitter_users table - simple Twitter info only (similar to discord_users)
    await pool.query(`
      CREATE TABLE twitter_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        twitter_user_id TEXT UNIQUE NOT NULL,
        twitter_username TEXT,
        profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        verified_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    await pool.query(`
      CREATE INDEX idx_twitter_users_twitter_id ON twitter_users(twitter_user_id)
    `)

    await pool.query(`
      CREATE INDEX idx_twitter_users_profile_id ON twitter_users(profile_id)
    `)

    // Create Luminex tokens table
    await pool.query(`
      CREATE TABLE flashnet_pools (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lp_public_key TEXT UNIQUE NOT NULL,
        network TEXT,
        host_name TEXT,
        host_namespace TEXT,
        curve_type TEXT,
        asset_a_address TEXT NOT NULL,
        asset_b_address TEXT NOT NULL,
        asset_a_name TEXT,
        asset_b_name TEXT,
        asset_a_symbol TEXT,
        asset_b_symbol TEXT,
        asset_a_decimals INTEGER,
        asset_b_decimals INTEGER,
        asset_a_reserve NUMERIC,
        asset_b_reserve NUMERIC,
        tvl_asset_b NUMERIC,
        volume_24h_asset_b NUMERIC,
        price_change_percent_24h NUMERIC,
        current_price_a_in_b NUMERIC,
        lp_fee_bps INTEGER,
        host_fee_bps INTEGER,
        created_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ,
        last_synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await pool.query(`
      CREATE INDEX idx_flashnet_pools_lp ON flashnet_pools(lp_public_key)
    `)

    await pool.query(`
      CREATE INDEX idx_flashnet_pools_asset_a ON flashnet_pools((LOWER(asset_a_address)))
    `)

    await pool.query(`
      CREATE INDEX idx_flashnet_pools_asset_b ON flashnet_pools((LOWER(asset_b_address)))
    `)

    await pool.query(`
      CREATE INDEX idx_flashnet_pools_host ON flashnet_pools((LOWER(host_name)))
    `)

    await pool.query(`
      CREATE TABLE flashnet_token_metadata (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token_identifier TEXT UNIQUE NOT NULL,
        token_address TEXT,
        name TEXT,
        ticker TEXT,
        decimals INTEGER,
        max_supply NUMERIC,
        icon_url TEXT,
        last_synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await pool.query(`
      CREATE INDEX idx_flashnet_token_metadata_identifier ON flashnet_token_metadata(token_identifier)
    `)

    // Create ordinal_sales table to track sales and karma deductions
    await pool.query(`
      CREATE TABLE ordinal_sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT NOT NULL,
        inscription_id TEXT,
        sold_at TIMESTAMPTZ DEFAULT NOW(),
        karma_deducted INTEGER DEFAULT 0,
        noted BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await pool.query(`
      CREATE INDEX idx_ordinal_sales_wallet_address ON ordinal_sales(wallet_address)
    `)

    await pool.query(`
      CREATE INDEX idx_ordinal_sales_sold_at ON ordinal_sales(sold_at DESC)
    `)

    // Create verification_codes table for Discord wallet verification
    await pool.query(`
      CREATE TABLE verification_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        wallet_address TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        is_used BOOLEAN DEFAULT false
      )
    `)

    await pool.query(`
      CREATE INDEX idx_verification_codes_code ON verification_codes(code)
    `)

    await pool.query(`
      CREATE INDEX idx_verification_codes_wallet_address ON verification_codes(wallet_address)
    `)

    await pool.query(`
      CREATE INDEX idx_verification_codes_expires_at ON verification_codes(expires_at)
    `)
    
    // Create function to update profile karma totals
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_profile_karma()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.type = 'good' THEN
          UPDATE profiles 
          SET total_good_karma = (
            SELECT COALESCE(SUM(points), 0) 
            FROM karma_points 
            WHERE profile_id = NEW.profile_id AND type = 'good'
          )
          WHERE id = NEW.profile_id;
        ELSE
          UPDATE profiles 
          SET total_bad_karma = (
            SELECT COALESCE(SUM(ABS(points)), 0) 
            FROM karma_points 
            WHERE profile_id = NEW.profile_id AND type = 'evil'
          )
          WHERE id = NEW.profile_id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
    
    // Create trigger to auto-update karma totals
    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_update_profile_karma ON karma_points;
      CREATE TRIGGER trigger_update_profile_karma
      AFTER INSERT OR UPDATE OR DELETE ON karma_points
      FOR EACH ROW
      EXECUTE FUNCTION update_profile_karma();
    `)
    
    // Create karma_tasks table
    await pool.query(`
      CREATE TABLE karma_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL CHECK (type IN ('good', 'evil')),
        points INTEGER NOT NULL,
        category TEXT,
        is_active BOOLEAN DEFAULT true,
        proof_required BOOLEAN DEFAULT false,
        required_platform TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create user_task_completions table to track completed tasks
    await pool.query(`
      CREATE TABLE user_task_completions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        task_id UUID REFERENCES karma_tasks(id) ON DELETE CASCADE,
        completed_at TIMESTAMPTZ DEFAULT NOW(),
        proof TEXT,
        verified_by TEXT,
        karma_points_id UUID REFERENCES karma_points(id) ON DELETE SET NULL,
        UNIQUE(profile_id, task_id)
      )
    `)
    
    // Create indexes for tasks
    await pool.query(`
      CREATE INDEX idx_karma_tasks_type ON karma_tasks(type, is_active)
    `)
    
    await pool.query(`
      CREATE INDEX idx_user_task_completions_profile_id ON user_task_completions(profile_id)
    `)
    
    await pool.query(`
      CREATE INDEX idx_user_task_completions_task_id ON user_task_completions(task_id)
    `)
    
    // Duality protocol tables
    await pool.query(`
      CREATE TABLE duality_cycles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        week_start DATE NOT NULL,
        week_end DATE NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'alignment', 'active', 'trial', 'completed')),
        active_effect TEXT,
        effect_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await pool.query(`
      CREATE TABLE duality_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_id UUID REFERENCES duality_cycles(id) ON DELETE CASCADE,
        profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        alignment TEXT NOT NULL CHECK (alignment IN ('good', 'evil')),
        fate_meter INTEGER DEFAULT 50,
        karma_snapshot INTEGER,
        participation_count INTEGER DEFAULT 0,
        quest_completed BOOLEAN DEFAULT false,
        eligible_for_trial BOOLEAN DEFAULT false,
        locked_at TIMESTAMPTZ,
        ready_for_pairing BOOLEAN DEFAULT false,
        next_available_at TIMESTAMPTZ,
        current_pair_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(cycle_id, profile_id)
      )
    `)

    await pool.query(`
      CREATE TABLE duality_pairs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_id UUID REFERENCES duality_cycles(id) ON DELETE CASCADE,
        good_participant_id UUID REFERENCES duality_participants(id) ON DELETE CASCADE,
        evil_participant_id UUID REFERENCES duality_participants(id) ON DELETE CASCADE,
        fate_meter INTEGER DEFAULT 50,
        status TEXT DEFAULT 'active',
        window_start TIMESTAMPTZ DEFAULT NOW(),
        window_end TIMESTAMPTZ,
        cooldown_minutes INTEGER DEFAULT 60,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await pool.query(`
      CREATE TABLE duality_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_id UUID REFERENCES duality_cycles(id) ON DELETE CASCADE,
        pair_id UUID REFERENCES duality_pairs(id) ON DELETE CASCADE,
        participant_id UUID REFERENCES duality_participants(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        cycle_day INTEGER,
        result TEXT,
        karma_delta_good INTEGER DEFAULT 0,
        karma_delta_evil INTEGER DEFAULT 0,
        metadata JSONB,
        occurred_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await pool.query(`
      CREATE TABLE duality_trials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_id UUID REFERENCES duality_cycles(id) ON DELETE CASCADE,
        participant_id UUID REFERENCES duality_participants(id) ON DELETE CASCADE,
        scheduled_at TIMESTAMPTZ NOT NULL,
        vote_ends_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('scheduled', 'voting', 'resolved', 'cancelled')),
        verdict TEXT,
        votes_absolve INTEGER DEFAULT 0,
        votes_condemn INTEGER DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await pool.query(`CREATE INDEX idx_duality_participants_cycle ON duality_participants(cycle_id, alignment)`)
    await pool.query(`CREATE INDEX idx_duality_pairs_cycle ON duality_pairs(cycle_id)`)
    await pool.query(`CREATE INDEX idx_duality_events_pair ON duality_events(pair_id)`)
    await pool.query(`CREATE INDEX idx_duality_trials_cycle ON duality_trials(cycle_id)`)
    
    // Always remove all placeholder karma tasks (keep only Trial Win and Trial Loss)
    const placeholderTasks = [
      'Help a community member',
      'Share quality content',
      'Report a bug',
      'Create fan art',
      'Organize community event',
      'Mentor new member',
      'Translation contribution',
      'Social media promotion',
      'Spam in channels',
      'Harassment',
      'Scam attempt',
      'Spread misinformation',
      'Violate community rules',
      'Toxic behavior'
    ]
    
    // Delete placeholder tasks (always run, not just on first init)
    for (const taskTitle of placeholderTasks) {
      try {
        await pool.query(
          "DELETE FROM karma_tasks WHERE title = $1",
          [taskTitle]
        )
      } catch (error) {
        // Ignore errors if task doesn't exist
        console.log(`Task "${taskTitle}" not found or already deleted`)
      }
    }
    
    // Insert or update Trial tasks (fully database-driven - only Trial Win and Trial Loss)
    
    // Ensure Trial Win exists as first good karma task
    const trialWinCheck = await pool.query(
      "SELECT id FROM karma_tasks WHERE title = 'Trial Win' AND type = 'good'"
    )
    if (trialWinCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO karma_tasks (title, description, type, points, category, is_active, proof_required, required_platform)
        VALUES ('Trial Win', 'Win a trial or challenge', 'good', 10, 'Trial', true, false, NULL)
      `)
    } else {
      // Update if exists
      await pool.query(`
        UPDATE karma_tasks 
        SET description = 'Win a trial or challenge', points = 10, category = 'Trial', is_active = true, proof_required = false, required_platform = NULL
        WHERE title = 'Trial Win' AND type = 'good'
      `)
    }
    
    // Ensure Trial Loss exists as first evil karma task
    const trialLossCheck = await pool.query(
      "SELECT id FROM karma_tasks WHERE title = 'Trial Loss' AND type = 'evil'"
    )
    if (trialLossCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO karma_tasks (title, description, type, points, category, is_active, proof_required, required_platform)
        VALUES ('Trial Loss', 'Lose a trial or challenge', 'evil', -10, 'Trial', true, false, NULL)
      `)
    } else {
      // Update if exists
      await pool.query(`
        UPDATE karma_tasks 
        SET description = 'Lose a trial or challenge', points = -10, category = 'Trial', is_active = true, proof_required = false, required_platform = NULL
        WHERE title = 'Trial Loss' AND type = 'evil'
      `)
    }
    
    // Add automated karma action tasks
    const automatedTasks = [
      {
        title: 'Daily Check-in',
        description: 'Check in daily using /checkin command in Discord (once every 24 hours)',
        type: 'good',
        points: 5,
        category: 'Automated',
        is_active: true,
        proof_required: false,
        required_platform: null
      },
      {
        title: 'Daily Check-in',
        description: 'Check in daily using /checkin command in Discord (once every 24 hours)',
        type: 'evil',
        points: -5,
        category: 'Automated',
        is_active: true,
        proof_required: false,
        required_platform: null
      },
      {
        title: 'Purchased The Damned Ordinal',
        description: 'Purchase a new The Damned ordinal on Magic Eden',
        type: 'good',
        points: 20,
        category: 'Automated',
        is_active: true,
        proof_required: false,
        required_platform: null
      },
      {
        title: 'Ordinal Ownership',
        description: 'Own The Damned ordinals (awarded per ordinal owned)',
        type: 'good',
        points: 5,
        category: 'Automated',
        is_active: true,
        proof_required: false,
        required_platform: null
      },
      {
        title: 'Sold The Damned Ordinal',
        description: 'Sell a The Damned ordinal',
        type: 'evil',
        points: -20,
        category: 'Automated',
        is_active: true,
        proof_required: false,
        required_platform: null
      },
      {
        title: 'Missed Daily Check-in',
        description: 'Did not check in within 24 hours',
        type: 'evil',
        points: -5,
        category: 'Automated',
        is_active: true,
        proof_required: false,
        required_platform: null
      }
    ]
    
    // Ensure all automated tasks exist
  for (const task of automatedTasks) {
    const taskCheck = await pool.query(
      "SELECT id FROM karma_tasks WHERE title = $1 AND type = $2",
      [task.title, task.type]
    )
    
    if (taskCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO karma_tasks (title, description, type, points, category, is_active, proof_required, required_platform, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'system')
      `, [
        task.title,
        task.description,
        task.type,
        task.points,
        task.category,
        task.is_active,
        task.proof_required ?? false,
        task.required_platform
      ])
    } else {
      // Update if exists
      await pool.query(`
        UPDATE karma_tasks 
        SET description = $1, points = $2, category = $3, is_active = $4, proof_required = $5, required_platform = $6
        WHERE title = $7 AND type = $8
      `, [
        task.description,
        task.points,
        task.category,
        task.is_active,
        task.proof_required ?? false,
        task.required_platform,
        task.title,
        task.type
      ])
    }
  }

  // Seed initial Duality cycle so automation can run immediately
  const now = new Date()
  const utcDay = now.getUTCDay()
  const diff = utcDay === 0 ? -6 : 1 - utcDay // start cycle on Monday UTC
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff))
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)

  await pool.query(
    `INSERT INTO duality_cycles (week_start, week_end, status)
     VALUES ($1, $2, 'alignment')`,
    [weekStart.toISOString().slice(0, 10), weekEnd.toISOString().slice(0, 10)]
  )

  console.log('✅ Seeded initial Duality cycle in alignment phase')

  console.log('✅ Database tables initialized successfully')
} catch (error) {
  console.error('❌ Error initializing database:', error)
  throw error
}
}

