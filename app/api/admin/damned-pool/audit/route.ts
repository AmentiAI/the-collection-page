import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 50), 1), 200)
    const walletFilter = (searchParams.get('wallet') ?? '').toString().trim().toLowerCase()

    const pool = getPool()

    // Recent circles with participants
    const circlesRes = await pool.query(
      `
        SELECT
          c.id,
          c.creator_wallet,
          c.creator_inscription_id,
          c.status,
          c.required_participants,
          c.locked_at,
          c.completed_at,
          c.expires_at,
          c.burn_window_granted,
          c.created_at,
          c.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', p.id,
                'wallet', p.wallet,
                'inscriptionId', p.inscription_id,
                'image', p.inscription_image,
                'role', p.role,
                'joinedAt', p.joined_at,
                'completed', p.completed,
                'completedAt', p.completed_at
              )
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::json
          ) AS participants
        FROM damned_pool_circles c
        LEFT JOIN damned_pool_participants p ON p.circle_id = c.id
        ${walletFilter ? `WHERE LOWER(c.creator_wallet) = $1 OR EXISTS (SELECT 1 FROM damned_pool_participants px WHERE px.circle_id = c.id AND LOWER(px.wallet) = $1)` : ``}
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT ${limit}
      `,
      walletFilter ? [walletFilter] : [],
    )

    // Per-wallet summary across creator and participants
    const summaryRes = await pool.query(
      `
        WITH creators AS (
          SELECT LOWER(creator_wallet) AS wallet,
                 COUNT(*) FILTER (WHERE status IN ('open','filling','ready'))::int AS active_created,
                 COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_created,
                 COUNT(*)::int AS total_created,
                 MAX(created_at) AS last_created_at
          FROM damned_pool_circles
          GROUP BY LOWER(creator_wallet)
        ),
        participants AS (
          SELECT LOWER(wallet) AS wallet,
                 COUNT(*) FILTER (WHERE c.status IN ('open','filling','ready'))::int AS active_joined,
                 COUNT(*) FILTER (WHERE c.status = 'completed')::int AS completed_joined,
                 COUNT(*)::int AS total_joined,
                 MAX(p.joined_at) AS last_joined_at
          FROM damned_pool_participants p
          JOIN damned_pool_circles c ON c.id = p.circle_id
          GROUP BY LOWER(wallet)
        )
        SELECT
          COALESCE(c.wallet, p.wallet) AS wallet,
          COALESCE(c.active_created, 0) AS active_created,
          COALESCE(c.completed_created, 0) AS completed_created,
          COALESCE(c.total_created, 0) AS total_created,
          COALESCE(p.active_joined, 0) AS active_joined,
          COALESCE(p.completed_joined, 0) AS completed_joined,
          COALESCE(p.total_joined, 0) AS total_joined,
          GREATEST(COALESCE(c.last_created_at, to_timestamp(0)), COALESCE(p.last_joined_at, to_timestamp(0))) AS last_activity
        FROM creators c
        FULL OUTER JOIN participants p ON p.wallet = c.wallet
        ${walletFilter ? `WHERE COALESCE(c.wallet, p.wallet) = $1` : ``}
        ORDER BY last_activity DESC
      `,
      walletFilter ? [walletFilter] : [],
    )

    return NextResponse.json({
      success: true,
      circles: circlesRes.rows,
      summary: summaryRes.rows,
    })
  } catch (error) {
    console.error('[admin/damned-pool/audit][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to load damned pool audit data' }, { status: 500 })
  }
}


