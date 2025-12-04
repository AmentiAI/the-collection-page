import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const STALE_THRESHOLD_DAYS = 7

export async function GET() {
  try {
    const pool = getPool()

    // Calculate stale threshold
    const staleThreshold = new Date()
    staleThreshold.setDate(staleThreshold.getDate() - STALE_THRESHOLD_DAYS)

    // Query to get graverobable count per wallet with profile info
    const result = await pool.query(
      `
      SELECT 
        b.ordinal_wallet,
        COUNT(b.id)::int AS graverobable_count,
        p.username AS discord_username,
        p.ascension_powder,
        p.avatar_url
      FROM abyss_burns b
      LEFT JOIN profiles p ON LOWER(p.wallet_address) = LOWER(b.ordinal_wallet)
      WHERE b.inscription_id NOT LIKE 'ascended_%'
        AND b.hidden = FALSE
        AND (b.updated_at IS NULL OR b.updated_at < $1)
      GROUP BY b.ordinal_wallet, p.username, p.ascension_powder, p.avatar_url
      ORDER BY COUNT(b.id) DESC
      `,
      [staleThreshold.toISOString()],
    )

    return NextResponse.json({
      success: true,
      staleThresholdDays: STALE_THRESHOLD_DAYS,
      staleThresholdDate: staleThreshold.toISOString(),
      totalWallets: result.rowCount ?? 0,
      totalEligibleGraves: result.rows.reduce((sum, row) => sum + (row.graverobable_count ?? 0), 0),
      wallets: result.rows.map((row) => ({
        walletAddress: row.ordinal_wallet,
        graverobableCount: row.graverobable_count ?? 0,
        discordUsername: row.discord_username || null,
        ascensionPowder: row.ascension_powder ?? 0,
        avatarUrl: row.avatar_url || null,
      })),
    })
  } catch (error) {
    console.error('[admin/graverobbing][GET]', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch graverobbing data' 
      },
      { status: 500 }
    )
  }
}

