import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Migration endpoint to add payment_address column
export async function GET() {
  try {
    const pool = getPool()
    
    // Check if payment_address column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='profiles' AND column_name='payment_address'
    `)
    
    if (columnCheck.rows.length > 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'payment_address column already exists',
        migrated: false
      })
    }
    
    // Add payment_address column
    await pool.query(`
      ALTER TABLE profiles 
      ADD COLUMN payment_address TEXT
    `)
    
    // Update existing rows to set payment_address = wallet_address
    await pool.query(`
      UPDATE profiles 
      SET payment_address = wallet_address 
      WHERE payment_address IS NULL
    `)
    
    return NextResponse.json({ 
      success: true, 
      message: 'Migration completed successfully - payment_address column added',
      migrated: true
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}


