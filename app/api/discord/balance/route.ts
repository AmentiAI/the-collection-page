import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Get ascension powder balance for a Discord user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const discordUserId = searchParams.get('discordUserId')

    console.log('[discord/balance][GET] Request received for discordUserId:', discordUserId)

    if (!discordUserId) {
      console.log('[discord/balance][GET] Missing discordUserId parameter')
      return NextResponse.json(
        { success: false, error: 'discordUserId is required' },
        { status: 400 }
      )
    }

    const pool = getPool()
    console.log('[discord/balance][GET] Querying database for Discord user:', discordUserId)

    // Get user's profile via Discord ID
    const profileRes = await pool.query(
      `SELECT p.wallet_address, p.ascension_powder, p.username
       FROM profiles p
       INNER JOIN discord_users du ON du.profile_id = p.id
       WHERE du.discord_user_id = $1
       LIMIT 1`,
      [discordUserId]
    )

    console.log('[discord/balance][GET] Query result rows:', profileRes.rows.length)

    if (!profileRes.rows[0]) {
      console.log('[discord/balance][GET] User not found in database')
      return NextResponse.json(
        { 
          success: false, 
          error: 'User not found. Please link your Discord account to your wallet first.',
          balance: 0
        },
        { status: 404 }
      )
    }

    const balance = Number(profileRes.rows[0].ascension_powder ?? 0)
    const wallet = profileRes.rows[0].wallet_address
    const username = profileRes.rows[0].username

    console.log('[discord/balance][GET] Success - Balance:', balance, 'Wallet:', wallet, 'Username:', username)

    return NextResponse.json({
      success: true,
      balance,
      wallet,
      username,
    })
  } catch (error) {
    console.error('[discord/balance][GET] Error:', error)
    console.error('[discord/balance][GET] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch balance.',
        balance: 0
      },
      { status: 500 }
    )
  }
}

