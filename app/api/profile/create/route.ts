import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Auto-create profile for wallet address
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, paymentAddress } = body
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }
    
    const pool = getPool()
    
    // Check if profile exists
    const existing = await pool.query(
      'SELECT * FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    
    if (existing.rows.length > 0) {
      // Update payment_address if provided and different
      if (paymentAddress && existing.rows[0].payment_address !== paymentAddress) {
        const updated = await pool.query(
          `UPDATE profiles 
           SET payment_address = $1, updated_at = NOW()
           WHERE wallet_address = $2
           RETURNING *`,
          [paymentAddress, walletAddress]
        )
        return NextResponse.json(updated.rows[0])
      }
      return NextResponse.json(existing.rows[0])
    }
    
    // Create or update profile in a single UPSERT to avoid race conditions
    let result
    try {
      result = await pool.query(
        `INSERT INTO profiles (wallet_address, payment_address)
         VALUES ($1, $2)
         ON CONFLICT (wallet_address) DO UPDATE
         SET payment_address = EXCLUDED.payment_address,
             updated_at = NOW()
         RETURNING *`,
        [walletAddress, paymentAddress || walletAddress]
      )
    } catch (error: any) {
      // Fallback if payment_address column is missing
      if (error.message && error.message.includes('payment_address')) {
        console.warn('payment_address column not found, upserting profile without it')
        result = await pool.query(
          `INSERT INTO profiles (wallet_address)
           VALUES ($1)
           ON CONFLICT (wallet_address) DO UPDATE
           SET updated_at = NOW()
           RETURNING *`,
          [walletAddress]
        )
      } else {
        throw error
      }
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Profile creation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

