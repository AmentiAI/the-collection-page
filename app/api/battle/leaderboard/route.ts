import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const walletAddress = searchParams.get('wallet')

  const pool = getPool()

  try {
    // Top leaderboard by wins
    const { rows: leaders } = await pool.query(
      `SELECT
         wallet_address,
         COALESCE(battles_won, 0)  AS wins,
         COALESCE(battles_lost, 0) AS losses,
         CASE
           WHEN COALESCE(battles_won, 0) + COALESCE(battles_lost, 0) > 0
           THEN ROUND(COALESCE(battles_won, 0)::numeric
                  / (COALESCE(battles_won, 0) + COALESCE(battles_lost, 0)) * 100, 1)
           ELSE 0
         END AS win_pct
       FROM profiles
       WHERE COALESCE(battles_won, 0) > 0 OR COALESCE(battles_lost, 0) > 0
       ORDER BY wins DESC, win_pct DESC
       LIMIT $1`,
      [limit]
    )

    // Rank position for a specific wallet (optional)
    let myStats = null
    if (walletAddress) {
      const { rows } = await pool.query(
        `SELECT
           wallet_address,
           COALESCE(battles_won, 0)  AS wins,
           COALESCE(battles_lost, 0) AS losses,
           CASE
             WHEN COALESCE(battles_won, 0) + COALESCE(battles_lost, 0) > 0
             THEN ROUND(COALESCE(battles_won, 0)::numeric
                    / (COALESCE(battles_won, 0) + COALESCE(battles_lost, 0)) * 100, 1)
             ELSE 0
           END AS win_pct,
           (
             SELECT COUNT(*) + 1 FROM profiles p2
             WHERE COALESCE(p2.battles_won, 0) > COALESCE(p.battles_won, 0)
               AND (COALESCE(p2.battles_won, 0) > 0 OR COALESCE(p2.battles_lost, 0) > 0)
           ) AS rank
         FROM profiles p
         WHERE LOWER(wallet_address) = LOWER($1)`,
        [walletAddress]
      )
      if (rows.length) myStats = rows[0]
    }

    return NextResponse.json({ success: true, leaders, myStats })
  } catch (error) {
    console.error('[battle/leaderboard]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
