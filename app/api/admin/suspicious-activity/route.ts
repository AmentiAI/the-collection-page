import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const pool = getPool()
    const searchParams = request.nextUrl.searchParams
    const hours = Number(searchParams.get('hours') || '1')
    
    // Find wallets with excessive completion attempts
    const suspiciousCompletions = await pool.query(`
      SELECT 
        wallet,
        COUNT(*) as completion_attempts,
        COUNT(DISTINCT circle_id) as unique_circles,
        MIN(completed_at) as first_attempt,
        MAX(completed_at) as last_attempt,
        EXTRACT(EPOCH FROM (MAX(completed_at) - MIN(completed_at))) / 60 as duration_minutes
      FROM (
        SELECT wallet, circle_id, joined_at as completed_at FROM dead_demons_participants WHERE joined_at > NOW() - INTERVAL '${hours} hours'
        UNION ALL
        SELECT wallet, circle_id, joined_at as completed_at FROM summoning_powder_participants WHERE joined_at > NOW() - INTERVAL '${hours} hours'
        UNION ALL
        SELECT wallet, circle_id, joined_at as completed_at FROM damned_pool_participants WHERE joined_at > NOW() - INTERVAL '${hours} hours'
      ) all_attempts
      GROUP BY wallet
      HAVING COUNT(*) > ${20 * hours} -- More than 20 attempts per hour is suspicious
      ORDER BY completion_attempts DESC
      LIMIT 50
    `)

    // Find circles being targeted excessively
    const suspiciousCircles = await pool.query(`
      SELECT 
        circle_id,
        COUNT(*) as participant_changes,
        COUNT(DISTINCT wallet) as unique_wallets,
        MIN(joined_at) as first_change,
        MAX(joined_at) as last_change
      FROM (
        SELECT circle_id, wallet, joined_at FROM dead_demons_participants WHERE joined_at > NOW() - INTERVAL '${hours} hours'
        UNION ALL
        SELECT circle_id, wallet, joined_at FROM summoning_powder_participants WHERE joined_at > NOW() - INTERVAL '${hours} hours'
        UNION ALL
        SELECT circle_id, wallet, joined_at FROM damned_pool_participants WHERE joined_at > NOW() - INTERVAL '${hours} hours'
      ) all_changes
      GROUP BY circle_id
      HAVING COUNT(*) > 100 -- More than 100 changes to a single circle is suspicious
      ORDER BY participant_changes DESC
      LIMIT 20
    `)

    return NextResponse.json({
      success: true,
      timeWindow: `Last ${hours} hour(s)`,
      suspiciousWallets: suspiciousCompletions.rows,
      suspiciousCircles: suspiciousCircles.rows,
      summary: {
        flaggedWallets: suspiciousCompletions.rows.length,
        flaggedCircles: suspiciousCircles.rows.length,
      },
    })
  } catch (error) {
    console.error('[admin/suspicious-activity]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch suspicious activity' },
      { status: 500 },
    )
  }
}

