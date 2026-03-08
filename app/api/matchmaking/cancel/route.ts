import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { queue_id } = await req.json()
  if (!queue_id) {
    return NextResponse.json({ error: 'queue_id required' }, { status: 400 })
  }

  const pool = getPool()
  await pool.query(
    `UPDATE matchmaking_queue SET status = 'cancelled' WHERE id = $1 AND status = 'waiting'`,
    [queue_id]
  )

  return NextResponse.json({ ok: true })
}
