const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const dbUrl = process.env.NEON_DB || process.env.SUPABASE_DB

if (!dbUrl) {
  console.error('❌ Error: NEON_DB or SUPABASE_DB environment variable is not set')
  process.exit(1)
}

const url = new URL(dbUrl)
const dbConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 5432,
  database: url.pathname.slice(1),
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

    const sqlPath = path.join(__dirname, 'update-landmarks-coordinate-ranges.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('📝 Running migration to update coordinate ranges...')
    console.log('   Updating map_x constraint: 0-2048 -> 0-4096')
    console.log('   Updating map_y constraint: 0-2048 -> 0-2728')
    await client.query(sql)
    console.log('✅ Migration completed successfully!')
    console.log('   Landmarks table now supports new map size (4096 x 2728)')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

runMigration()

