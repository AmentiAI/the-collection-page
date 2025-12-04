import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const pool = getPool()
    const res = await pool.query(`SELECT COUNT(*)::int AS total FROM abyss_burns`)
    const total = Number(res.rows[0]?.total ?? 0)
    return NextResponse.json({ success: true, total })
  } catch (error) {
    console.error('[abyss/burns/total][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch total burns' }, { status: 500 })
  }
}


