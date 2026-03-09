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
    `SELECT id, status, fighter_data, opponent_queue_id, battle_result
     FROM matchmaking_queue
     WHERE player_id = $1
       AND status IN ('waiting', 'matched', 'completed')
     ORDER BY joined_at DESC
     LIMIT 1`,
    [player_id]
  )

  const entry = rows[0]
  if (!entry) return NextResponse.json({ found: false })

  // Completed battle — return result directly
  if (entry.status === 'completed' && entry.battle_result) {
    return NextResponse.json({
      found: true,
      queue_id: entry.id,
      status: 'completed',
      fighter_data: entry.fighter_data,
      battle_result: entry.battle_result,
      opponent: null,
      opponent_player_id: null,
    })
  }

  let opponent = null
  let opponent_player_id = null
  if (entry.status === 'matched' && entry.opponent_queue_id) {
    const { rows: oppRows } = await pool.query(
      `SELECT player_id, fighter_data FROM matchmaking_queue WHERE id = $1`,
      [entry.opponent_queue_id]
    )
    opponent = oppRows[0]?.fighter_data ?? null
    opponent_player_id = oppRows[0]?.player_id ?? null
  }

  return NextResponse.json({
    found: true,
    queue_id: entry.id,
    status: entry.status,
    fighter_data: entry.fighter_data,
    opponent,
    opponent_player_id,
  })
}
