import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const walletParam = (searchParams.get('wallet') ?? '').toString().trim()
    if (!walletParam) {
      return NextResponse.json({ success: false, error: 'wallet is required' }, { status: 400 })
    }
    const wallet = walletParam.toLowerCase()
    const pool = getPool()
    const res = await pool.query(
      `
        WITH created AS (
          SELECT COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_created
          FROM damned_pool_circles
          WHERE LOWER(creator_wallet) = $1
        ),
        joined AS (
          SELECT COUNT(*) FILTER (WHERE c.status = 'completed')::int AS completed_joined
          FROM damned_pool_participants p
          JOIN damned_pool_circles c ON c.id = p.circle_id
          WHERE LOWER(p.wallet) = $1
        )
        SELECT
          (SELECT completed_created FROM created) AS completed_created,
          (SELECT completed_joined FROM joined) AS completed_joined
      `,
      [wallet],
    )
    const row = res.rows[0] ?? { completed_created: 0, completed_joined: 0 }
    const completedCreated = Number(row.completed_created ?? 0)
    const completedJoined = Number(row.completed_joined ?? 0)
    const isPortalSummoner = completedCreated + completedJoined > 0
    return NextResponse.json({
      success: true,
      completedCreated,
      completedJoined,
      isPortalSummoner,
    })
  } catch (error) {
    console.error('[damned-pool/summary][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to load portal summary' }, { status: 500 })
  }
}


