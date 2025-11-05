import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Get Discord user info for a profile
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()

    // Get Discord user linked to this wallet address
    const result = await pool.query(`
      SELECT du.discord_user_id, du.verified_at, du.created_at
      FROM discord_users du
      INNER JOIN profiles p ON du.profile_id = p.id
      WHERE p.wallet_address = $1
      LIMIT 1
    `, [walletAddress])

    if (result.rows.length === 0) {
      return NextResponse.json({ linked: false })
    }

    return NextResponse.json({
      linked: true,
      discordUserId: result.rows[0].discord_user_id,
      verifiedAt: result.rows[0].verified_at,
      createdAt: result.rows[0].created_at
    })
  } catch (error) {
    console.error('Discord profile fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
