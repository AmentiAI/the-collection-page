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
    // Create profiles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT UNIQUE NOT NULL,
        username TEXT,
        avatar_url TEXT,
        total_good_karma INTEGER DEFAULT 0,
        total_bad_karma INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Add payment_address column if it doesn't exist (for existing databases)
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='profiles' AND column_name='payment_address'
      `)
      
      if (columnCheck.rows.length === 0) {
        await pool.query(`
          ALTER TABLE profiles ADD COLUMN payment_address TEXT
        `)
        
        // Update existing rows
        await pool.query(`
          UPDATE profiles 
          SET payment_address = wallet_address 
          WHERE payment_address IS NULL
        `)
        
        console.log('✅ Added payment_address column to profiles table')
      }
    } catch (error) {
      console.error('Error adding payment_address column:', error)
      // Continue anyway - migration endpoint can handle this
    }
    
    // Create karma_points table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS karma_points (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        points INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('good', 'bad')),
        reason TEXT,
        given_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_karma_points_profile_id ON karma_points(profile_id)
    `)
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_karma_points_created_at ON karma_points(created_at DESC)
    `)
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address ON profiles(wallet_address)
    `)

    // Create discord_users table to link Discord user IDs to wallet addresses
    await pool.query(`
      CREATE TABLE IF NOT EXISTS discord_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        discord_user_id TEXT UNIQUE NOT NULL,
        wallet_address TEXT NOT NULL REFERENCES profiles(wallet_address) ON DELETE CASCADE,
        verified_at TIMESTAMPTZ DEFAULT NOW(),
        last_checked_at TIMESTAMPTZ,
        has_holder_role BOOLEAN DEFAULT false,
        last_ordinal_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Add last_ordinal_count column if it doesn't exist (for existing databases)
    try {
      const columnCheck = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='discord_users' AND column_name='last_ordinal_count'
      `)
      
      if (columnCheck.rows.length === 0) {
        await pool.query(`
          ALTER TABLE discord_users ADD COLUMN last_ordinal_count INTEGER DEFAULT 0
        `)
        console.log('✅ Added last_ordinal_count column to discord_users table')
      }
    } catch (error) {
      console.error('Error adding last_ordinal_count column:', error)
    }

    // Add last_checkin column if it doesn't exist (for existing databases)
    try {
      const columnCheck = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='discord_users' AND column_name='last_checkin'
      `)
      
      if (columnCheck.rows.length === 0) {
        await pool.query(`
          ALTER TABLE discord_users ADD COLUMN last_checkin TIMESTAMPTZ
        `)
        console.log('✅ Added last_checkin column to discord_users table')
      }
    } catch (error) {
      console.error('Error adding last_checkin column:', error)
    }

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_discord_users_discord_id ON discord_users(discord_user_id)
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_discord_users_wallet_address ON discord_users(wallet_address)
    `)

    // Create ordinal_sales table to track sales and karma deductions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ordinal_sales (
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
      CREATE INDEX IF NOT EXISTS idx_ordinal_sales_wallet_address ON ordinal_sales(wallet_address)
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ordinal_sales_sold_at ON ordinal_sales(sold_at DESC)
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
            WHERE profile_id = NEW.profile_id AND type = 'bad'
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
      CREATE TABLE IF NOT EXISTS karma_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL CHECK (type IN ('good', 'bad')),
        points INTEGER NOT NULL,
        category TEXT,
        is_active BOOLEAN DEFAULT true,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create user_task_completions table to track completed tasks
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_task_completions (
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
      CREATE INDEX IF NOT EXISTS idx_karma_tasks_type ON karma_tasks(type, is_active)
    `)
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_task_completions_profile_id ON user_task_completions(profile_id)
    `)
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_task_completions_task_id ON user_task_completions(task_id)
    `)
    
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
        INSERT INTO karma_tasks (title, description, type, points, category, is_active)
        VALUES ('Trial Win', 'Win a trial or challenge', 'good', 10, 'Trial', true)
      `)
    } else {
      // Update if exists
      await pool.query(`
        UPDATE karma_tasks 
        SET description = 'Win a trial or challenge', points = 10, category = 'Trial', is_active = true
        WHERE title = 'Trial Win' AND type = 'good'
      `)
    }
    
    // Ensure Trial Loss exists as first bad karma task
    const trialLossCheck = await pool.query(
      "SELECT id FROM karma_tasks WHERE title = 'Trial Loss' AND type = 'bad'"
    )
    if (trialLossCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO karma_tasks (title, description, type, points, category, is_active)
        VALUES ('Trial Loss', 'Lose a trial or challenge', 'bad', -10, 'Trial', true)
      `)
    } else {
      // Update if exists
      await pool.query(`
        UPDATE karma_tasks 
        SET description = 'Lose a trial or challenge', points = -10, category = 'Trial', is_active = true
        WHERE title = 'Trial Loss' AND type = 'bad'
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
        is_active: true
      },
      {
        title: 'Purchased The Damned Ordinal',
        description: 'Purchase a new The Damned ordinal on Magic Eden',
        type: 'good',
        points: 20,
        category: 'Automated',
        is_active: true
      },
      {
        title: 'Ordinal Ownership',
        description: 'Own The Damned ordinals (awarded per ordinal owned)',
        type: 'good',
        points: 5,
        category: 'Automated',
        is_active: true
      },
      {
        title: 'Sold The Damned Ordinal',
        description: 'Sell a The Damned ordinal',
        type: 'bad',
        points: -20,
        category: 'Automated',
        is_active: true
      },
      {
        title: 'Missed Daily Check-in',
        description: 'Did not check in within 24 hours',
        type: 'bad',
        points: -5,
        category: 'Automated',
        is_active: true
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
          INSERT INTO karma_tasks (title, description, type, points, category, is_active, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, 'system')
        `, [task.title, task.description, task.type, task.points, task.category, task.is_active])
      } else {
        // Update if exists
        await pool.query(`
          UPDATE karma_tasks 
          SET description = $1, points = $2, category = $3, is_active = $4
          WHERE title = $5 AND type = $6
        `, [task.description, task.points, task.category, task.is_active, task.title, task.type])
      }
    }
    
    console.log('✅ Database tables initialized successfully')
  } catch (error) {
    console.error('❌ Error initializing database:', error)
    throw error
  }
}

