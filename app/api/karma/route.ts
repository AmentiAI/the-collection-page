import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Add karma points
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, points, type, reason, givenBy } = body
    
    if (!walletAddress || !points || !type) {
      return NextResponse.json(
        { error: 'walletAddress, points, and type are required' },
        { status: 400 }
      )
    }
    
    if (type !== 'good' && type !== 'evil') {
      return NextResponse.json(
        { error: 'type must be "good" or "evil"' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Get or create profile
    let profileResult = await pool.query(
      'SELECT id FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    
    if (profileResult.rows.length === 0) {
      const insertResult = await pool.query(
        'INSERT INTO profiles (wallet_address) VALUES ($1) RETURNING id',
        [walletAddress]
      )
      profileResult = insertResult
    }
    
    const profileId = profileResult.rows[0].id
    
    // Add karma points (negative for bad karma)
    const pointsValue = type === 'evil' ? -Math.abs(points) : Math.abs(points)
    
    const result = await pool.query(
      `INSERT INTO karma_points (profile_id, points, type, reason, given_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [profileId, pointsValue, type, reason || null, givenBy || null]
    )
    
    // Get updated profile
    const updatedProfile = await pool.query(
      'SELECT * FROM profiles WHERE id = $1',
      [profileId]
    )
    
    return NextResponse.json({
      karmaPoint: result.rows[0],
      profile: updatedProfile.rows[0]
    })
  } catch (error) {
    console.error('Karma add error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Get karma history for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const walletAddress = searchParams.get('walletAddress')
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }
    
    const pool = getPool()
    
    // Get profile
    const profileResult = await pool.query(
      'SELECT id FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    
    if (profileResult.rows.length === 0) {
      return NextResponse.json({ karmaHistory: [], profile: null })
    }
    
    const profileId = profileResult.rows[0].id
    
    // Get karma history
    const historyResult = await pool.query(
      `SELECT * FROM karma_points 
       WHERE profile_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100`,
      [profileId]
    )
    
    // Get profile
    const profile = await pool.query(
      'SELECT * FROM profiles WHERE id = $1',
      [profileId]
    )
    
    return NextResponse.json({
      karmaHistory: historyResult.rows,
      profile: profile.rows[0] || null
    })
  } catch (error) {
    console.error('Karma history fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


