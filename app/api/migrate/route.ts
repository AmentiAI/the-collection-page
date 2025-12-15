import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Migration endpoint to add columns to profiles table
export async function GET() {
  try {
    const pool = getPool()
    const migrations: string[] = []
    
    // Check and add payment_address column if needed
    const paymentAddressCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='profiles' AND column_name='payment_address'
    `)
    
    if (paymentAddressCheck.rows.length === 0) {
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
      
      migrations.push('payment_address column added')
    }
    
    // Check and add recent_ip column if needed
    const recentIpCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='profiles' AND column_name='recent_ip'
    `)
    
    if (recentIpCheck.rows.length === 0) {
      await pool.query(`
        ALTER TABLE profiles 
        ADD COLUMN recent_ip TEXT
      `)
      
      migrations.push('recent_ip column added')
    }
    
    if (migrations.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'All migrations already applied',
        migrated: false
      })
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Migration completed successfully - ${migrations.join(', ')}`,
      migrations,
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


