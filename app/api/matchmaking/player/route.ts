import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Returns the active (waiting or matched) queue entry for a given player_id
export async function GET(req: NextRequest) {
  const player_id = req.nextUrl.searchParams.get('player_id')
  if (!player_id) {
    return NextResponse.json({ error: 'player_id required' }, { status: 400 })
  }

  const pool = getPool()

  const { rows } = await pool.query(
    `SELECT id, status, fighter_data, opponent_queue_id
     FROM matchmaking_queue
     WHERE player_id = $1
       AND status IN ('waiting', 'matched')
       AND expires_at > NOW()
     ORDER BY joined_at DESC
     LIMIT 1`,
    [player_id]
  )

  const entry = rows[0]
  if (!entry) return NextResponse.json({ found: false })

  let opponent = null
  if (entry.status === 'matched' && entry.opponent_queue_id) {
    const { rows: oppRows } = await pool.query(
      `SELECT fighter_data FROM matchmaking_queue WHERE id = $1`,
      [entry.opponent_queue_id]
    )
    opponent = oppRows[0]?.fighter_data ?? null
  }

  return NextResponse.json({
    found: true,
    queue_id: entry.id,
    status: entry.status,
    fighter_data: entry.fighter_data,
    opponent,
  })
}
