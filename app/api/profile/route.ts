import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Get or create profile
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const walletAddress = searchParams.get('walletAddress')
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }
    
    const pool = getPool()
    
    // Use a timeout for the query
    const queryPromise = pool.query(
      'SELECT * FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), 10000)
    })
    
    const result = await Promise.race([queryPromise, timeoutPromise]) as any
    
    if (result.rows.length === 0) {
      // Create new profile - handle both with and without payment_address column
      let insertResult
      try {
        insertResult = await pool.query(
          `INSERT INTO profiles (wallet_address, payment_address) 
           VALUES ($1, $1) 
           RETURNING *`,
          [walletAddress]
        )
      } catch (error: any) {
        // If payment_address column doesn't exist, create without it
        if (error.message && error.message.includes('payment_address')) {
          console.warn('payment_address column not found, creating profile without it')
          insertResult = await pool.query(
            `INSERT INTO profiles (wallet_address) 
             VALUES ($1) 
             RETURNING *`,
            [walletAddress]
          )
        } else {
          throw error
        }
      }
      return NextResponse.json(insertResult.rows[0])
    }
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Profile fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

  // Update profile
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, paymentAddress, username, avatarUrl } = body
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }
    
    const pool = getPool()
    
    // Check if payment_address column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='profiles' AND column_name='payment_address'
    `)
    
    let result
    if (columnCheck.rows.length > 0 && paymentAddress) {
      // Update with payment_address
      result = await pool.query(
        `UPDATE profiles 
         SET payment_address = COALESCE($1, payment_address),
             username = COALESCE($2, username), 
             avatar_url = COALESCE($3, avatar_url),
             updated_at = NOW()
         WHERE wallet_address = $4
         RETURNING *`,
        [paymentAddress, username || null, avatarUrl || null, walletAddress]
      )
    } else {
      // Update without payment_address
      result = await pool.query(
        `UPDATE profiles 
         SET username = COALESCE($1, username), 
             avatar_url = COALESCE($2, avatar_url),
             updated_at = NOW()
         WHERE wallet_address = $3
         RETURNING *`,
        [username || null, avatarUrl || null, walletAddress]
      )
    }
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

