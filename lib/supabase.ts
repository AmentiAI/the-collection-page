// Parse database connection string (supports both Supabase and Neon)
const connectionString = process.env.NEON_DB || process.env.SUPABASE_DB

if (!connectionString) {
  console.warn('NEON_DB or SUPABASE_DB environment variable is not set')
}

// Parse the connection string
let dbConfig: {
  host: string
  port: number
  database: string
  user: string
  password: string
} | null = null

if (connectionString) {
  try {
    // Remove query parameters (like ?sslmode=require&channel_binding=require)
    const cleanString = connectionString.split('?')[0]
    
    // Try to parse the connection string
    // Format: postgresql://user:password@host:port/database
    // Or: postgresql://user:password@host/database (default port 5432)
    let urlMatch = cleanString.match(/postgresql:\/\/([^:]+):([^@]+)@([^/:]+)(?::(\d+))?\/(.+)/)
    
    if (!urlMatch) {
      // Try decoding first if it doesn't match
      const decodedString = decodeURIComponent(cleanString)
      urlMatch = decodedString.match(/postgresql:\/\/([^:]+):([^@]+)@([^/:]+)(?::(\d+))?\/(.+)/)
    }
    
    if (urlMatch) {
      const [, user, password, host, port, database] = urlMatch
      dbConfig = {
        host,
        port: port ? parseInt(port) : 5432, // Default to 5432 if no port specified
        database: database.split('?')[0], // Remove any query params from database name
        user: decodeURIComponent(user),
        password: decodeURIComponent(password), // Decode password in case it has special chars
      }
      console.log('✅ Database config parsed successfully')
    } else {
      console.error('Failed to parse database connection string. Format should be: postgresql://user:password@host:port/database')
    }
  } catch (error) {
    console.error('Error parsing connection string:', error)
  }
}

// Server-side database connection info
export { dbConfig }

