const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const connectionString = process.env.NEON_DB || process.env.SUPABASE_DB

if (!connectionString) {
  console.error('❌ NEON_DB or SUPABASE_DB environment variable is not set')
  process.exit(1)
}

let dbConfig = null

try {
  const cleanString = connectionString.split('?')[0]
  let urlMatch = cleanString.match(/postgresql:\/\/([^:]+):([^@]+)@([^/:]+)(?::(\d+))?\/(.+)/)

  if (!urlMatch) {
    const decodedString = decodeURIComponent(cleanString)
    urlMatch = decodedString.match(/postgresql:\/\/([^:]+):([^@]+)@([^/:]+)(?::(\d+))?\/(.+)/)
  }

  if (urlMatch) {
    const [, user, password, host, port, database] = urlMatch
    dbConfig = {
      host,
      port: port ? parseInt(port) : 5432,
      database: database.split('?')[0],
      user: decodeURIComponent(user),
      password: decodeURIComponent(password),
    }
  } else {
    console.error('❌ Failed to parse database connection string')
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Error parsing connection string:', error)
  process.exit(1)
}

async function runMigration() {
  const pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: { rejectUnauthorized: false },
  })

  let client
  try {
    console.log('🔌 Connecting to database...')
    client = await pool.connect()

    console.log('📄 Reading migration file...')
    const sqlPath = path.join(__dirname, 'create-battle-commitments-table.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('⚡ Running migration...')
    await client.query(sql)

    console.log('✅ Migration completed successfully!')
    console.log('')
    console.log('Created:')
    console.log('  - battle_commitments table')
    console.log('  - idx_bc_queue index')
    console.log('  - idx_bc_player index')
    console.log('')
    console.log('🎉 Battle commitments table is ready!')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

runMigration()
