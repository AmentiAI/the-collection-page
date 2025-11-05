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
        rejectUnauthorized: false,
        require: true // Neon requires SSL
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
    
    // Insert default tasks if they don't exist
    const existingTasks = await pool.query('SELECT COUNT(*) FROM karma_tasks')
    if (parseInt(existingTasks.rows[0].count) === 0) {
      // Default good karma tasks
      await pool.query(`
        INSERT INTO karma_tasks (title, description, type, points, category) VALUES
        ('Help a community member', 'Assist someone in Discord or community channels', 'good', 10, 'Community'),
        ('Share quality content', 'Post valuable content related to The Damned', 'good', 5, 'Content'),
        ('Report a bug', 'Report a legitimate bug or issue', 'good', 15, 'Development'),
        ('Create fan art', 'Share original fan art of The Damned', 'good', 20, 'Creative'),
        ('Organize community event', 'Host or organize a community event', 'good', 50, 'Community'),
        ('Mentor new member', 'Help onboard a new community member', 'good', 25, 'Community'),
        ('Translation contribution', 'Provide translations for the project', 'good', 30, 'Contribution'),
        ('Social media promotion', 'Share The Damned on social media', 'good', 5, 'Marketing')
      `)
      
      // Default bad karma tasks
      await pool.query(`
        INSERT INTO karma_tasks (title, description, type, points, category) VALUES
        ('Spam in channels', 'Post spam or off-topic content repeatedly', 'bad', -10, 'Behavior'),
        ('Harassment', 'Harass or bully other community members', 'bad', -50, 'Behavior'),
        ('Scam attempt', 'Attempt to scam or defraud community members', 'bad', -100, 'Security'),
        ('Spread misinformation', 'Intentionally spread false information', 'bad', -20, 'Behavior'),
        ('Violate community rules', 'Break established community guidelines', 'bad', -15, 'Behavior'),
        ('Toxic behavior', 'Engage in toxic or disruptive behavior', 'bad', -25, 'Behavior')
      `)
    }
    
    console.log('✅ Database tables initialized successfully')
  } catch (error) {
    console.error('❌ Error initializing database:', error)
    throw error
  }
}

