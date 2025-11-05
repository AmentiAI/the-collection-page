import { NextResponse } from 'next/server'
import { initDatabase } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Set a longer timeout for initialization
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database initialization timeout')), 60000) // 60 second timeout
    })
    
    await Promise.race([initDatabase(), timeoutPromise])
    return NextResponse.json({ success: true, message: 'Database initialized' })
  } catch (error) {
    console.error('Database initialization error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        hint: 'Check your NEON_DB or SUPABASE_DB connection string and ensure the database is accessible'
      },
      { status: 500 }
    )
  }
}

