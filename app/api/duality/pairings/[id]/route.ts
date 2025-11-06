import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (ADMIN_TOKEN) {
      const headerToken = request.headers.get('x-admin-token')
      if (headerToken !== ADMIN_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const pairId = params.id
    if (!pairId) {
      return NextResponse.json({ error: 'Pair id is required.' }, { status: 400 })
    }

    const { status, cooldownMinutes = 60 } = await request.json().catch(() => ({}))
    if (!status) {
      return NextResponse.json({ error: 'status is required.' }, { status: 400 })
    }

    const pool = getPool()

    const pairRes = await pool.query(
      `SELECT * FROM duality_pairs WHERE id = $1`,
      [pairId]
    )

    if (pairRes.rows.length === 0) {
      return NextResponse.json({ error: 'Pairing session not found.' }, { status: 404 })
    }

    const pairRow = pairRes.rows[0]

    const now = new Date()
    const cooldownEnds = new Date(now.getTime() + Number(cooldownMinutes) * 60 * 1000)

    await pool.query(
      `UPDATE duality_pairs
       SET status = $2,
           updated_at = NOW(),
           completed_at = CASE WHEN $2 IN ('completed', 'cancelled') THEN NOW() ELSE completed_at END
       WHERE id = $1`,
      [pairId, status]
    )

    await pool.query(
      `UPDATE duality_participants
       SET current_pair_id = NULL,
           locked_at = NULL,
           ready_for_pairing = false,
           next_available_at = $2,
           updated_at = NOW()
       WHERE id = ANY($1::uuid[])`,
      [[pairRow.good_participant_id, pairRow.evil_participant_id], cooldownEnds.toISOString()]
    )

    const updatedPairRes = await pool.query(
      `SELECT * FROM duality_pairs WHERE id = $1`,
      [pairId]
    )

    return NextResponse.json({
      success: true,
      pair: updatedPairRes.rows[0],
      cooldownMinutes,
      cooldownEnds: cooldownEnds.toISOString()
    })
  } catch (error) {
    console.error('Duality pair release error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
