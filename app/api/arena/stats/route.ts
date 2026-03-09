import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const pool = getPool()
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM matchmaking_queue
         WHERE status = 'waiting' AND expires_at > NOW())::int AS in_queue,

        (SELECT COUNT(*) / 2 FROM matchmaking_queue
         WHERE status = 'matched' AND expires_at > NOW())::int AS active_matches,

        (SELECT COALESCE(SUM(battles_won), 0) FROM profiles)::int AS total_fights,

        (SELECT COUNT(DISTINCT wallet_address) FROM profiles
         WHERE COALESCE(battles_won, 0) > 0 OR COALESCE(battles_lost, 0) > 0)::int AS total_fighters
    `)
    return NextResponse.json({ success: true, ...rows[0] })
  } catch (e) {
    console.error('[arena/stats]', e)
    return NextResponse.json({ success: false, in_queue: 0, active_matches: 0, total_fights: 0, total_fighters: 0 })
  }
}
