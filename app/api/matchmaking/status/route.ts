import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const queue_id = req.nextUrl.searchParams.get('queue_id')
  const player_id = req.nextUrl.searchParams.get('player_id')
  if (!queue_id || !player_id) {
    return NextResponse.json({ error: 'queue_id and player_id required' }, { status: 400 })
  }

  const pool = getPool()

  const { rows } = await pool.query(
    `SELECT id, status, opponent_queue_id FROM matchmaking_queue WHERE id = $1`,
    [queue_id]
  )
  const entry = rows[0]

  if (!entry) return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 })
  if (entry.status === 'cancelled') return NextResponse.json({ status: 'cancelled' })

  if (entry.status === 'matched' && entry.opponent_queue_id) {
    const { rows: oppRows } = await pool.query(
      `SELECT fighter_data FROM matchmaking_queue WHERE id = $1`,
      [entry.opponent_queue_id]
    )
    return NextResponse.json({ status: 'matched', opponent: oppRows[0]?.fighter_data ?? null })
  }

  // Still waiting — retry claiming to handle simultaneous-join race
  const { rows: claimed } = await pool.query(`
    UPDATE matchmaking_queue
    SET status = 'matched'
    WHERE id = (
      SELECT id FROM matchmaking_queue
      WHERE status = 'waiting'
        AND player_id != $1
        AND id != $2
        AND expires_at > NOW()
      ORDER BY joined_at ASC
      LIMIT 1
    )
    RETURNING id, fighter_data
  `, [player_id, queue_id])

  if (claimed.length > 0) {
    await pool.query(`UPDATE matchmaking_queue SET status = 'matched', opponent_queue_id = $1 WHERE id = $2`, [claimed[0].id, queue_id])
    await pool.query(`UPDATE matchmaking_queue SET opponent_queue_id = $1 WHERE id = $2`, [queue_id, claimed[0].id])
    return NextResponse.json({ status: 'matched', opponent: claimed[0].fighter_data })
  }

  return NextResponse.json({ status: 'waiting' })
}
