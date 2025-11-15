import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const pool = getPool()

    // Get all profiles with their ascension powder (available balance)
    const profilesRes = await pool.query(
      `
        SELECT 
          wallet_address,
          COALESCE(ascension_powder, 0)::int AS available,
          username,
          avatar_url
        FROM profiles
        WHERE COALESCE(ascension_powder, 0) > 0
           OR wallet_address IN (
             SELECT DISTINCT ordinal_wallet
             FROM abyss_burns
             WHERE COALESCE(ascension_powder, 0) > 0
           )
        ORDER BY wallet_address
      `,
    )

    // Get total spent per wallet from abyss_burns
    const spentRes = await pool.query(
      `
        SELECT 
          ordinal_wallet AS wallet_address,
          COALESCE(SUM(ascension_powder), 0)::bigint AS spent
        FROM abyss_burns
        WHERE COALESCE(ascension_powder, 0) > 0
        GROUP BY ordinal_wallet
      `,
    )

    // Create a map of spent amounts
    const spentMap = new Map<string, number>()
    for (const row of spentRes.rows) {
      spentMap.set(row.wallet_address.toLowerCase(), Number(row.spent))
    }

    // Combine data
    const leaderboard = profilesRes.rows.map((row) => {
      const wallet = row.wallet_address.toLowerCase()
      const available = Number(row.available ?? 0)
      const spent = spentMap.get(wallet) ?? 0
      const total = available + spent

      return {
        walletAddress: row.wallet_address,
        username: row.username,
        avatarUrl: row.avatar_url,
        available,
        spent,
        total,
      }
    })

    // Also include wallets that have spent but no profile record
    for (const row of spentRes.rows) {
      const wallet = row.wallet_address.toLowerCase()
      const exists = leaderboard.some((entry) => entry.walletAddress.toLowerCase() === wallet)
      if (!exists) {
        const spent = Number(row.spent)
        leaderboard.push({
          walletAddress: row.wallet_address,
          username: null,
          avatarUrl: null,
          available: 0,
          spent,
          total: spent,
        })
      }
    }

    // Sort by total descending
    leaderboard.sort((a, b) => b.total - a.total)

    return NextResponse.json({
      success: true,
      leaderboard,
    })
  } catch (error) {
    console.error('[ascension/leaderboard][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch ascension leaderboard.' }, { status: 500 })
  }
}

