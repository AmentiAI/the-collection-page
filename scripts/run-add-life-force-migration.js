const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const dbUrl = process.env.NEON_DB || process.env.SUPABASE_DB

if (!dbUrl) {
  console.error('❌ Error: NEON_DB or SUPABASE_DB environment variable is not set')
  process.exit(1)
}

// Parse database URL
const url = new URL(dbUrl)
const dbConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 5432,
  database: url.pathname.slice(1), // Remove leading /
  user: url.username,
  password: url.password,
  ssl: {
    rejectUnauthorized: false
  }
}

const pool = new Pool(dbConfig)

async function runMigration() {
  let client
  try {
    console.log('📦 Connecting to database...')
    client = await pool.connect()
    console.log('✅ Connected to database')

    const sqlPath = path.join(__dirname, 'add-life-force-to-battle-ordinals.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('📝 Running migration...')
    await client.query(sql)
    console.log('✅ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

runMigration()






