import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Test database connection
export async function GET() {
  try {
    const pool = getPool()
    
    // Simple query to test connection
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version')
    
    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      timestamp: result.rows[0].current_time,
      version: result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]
    })
  } catch (error) {
    console.error('Database connection test error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Make sure NEON_DB or SUPABASE_DB environment variable is set correctly'
      },
      { status: 500 }
    )
  }
}

