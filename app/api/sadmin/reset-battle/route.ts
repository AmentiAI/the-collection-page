import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST() {
  const pool = getPool()
  try {
    await pool.query(`TRUNCATE TABLE matchmaking_queue RESTART IDENTITY CASCADE`)
    await pool.query(`TRUNCATE TABLE battle_commitments RESTART IDENTITY CASCADE`)
    await pool.query(`UPDATE profiles SET battles_won = 0, battles_lost = 0`)
    return NextResponse.json({ success: true, message: 'matchmaking_queue, battle_commitments, and profile battle stats reset' })
  } catch (e) {
    console.error('[sadmin/reset-battle]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
