import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Get Twitter user info for a profile
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()

    // Get Twitter user linked to this wallet address
    const result = await pool.query(`
      SELECT tu.twitter_user_id, tu.twitter_username, tu.verified_at, tu.created_at
      FROM twitter_users tu
      INNER JOIN profiles p ON tu.profile_id = p.id
      WHERE p.wallet_address = $1
      LIMIT 1
    `, [walletAddress])

    if (result.rows.length === 0) {
      return NextResponse.json({ linked: false })
    }

    return NextResponse.json({
      linked: true,
      twitterUserId: result.rows[0].twitter_user_id,
      twitterUsername: result.rows[0].twitter_username,
      verifiedAt: result.rows[0].verified_at,
      createdAt: result.rows[0].created_at
    })
  } catch (error) {
    console.error('Twitter profile fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

