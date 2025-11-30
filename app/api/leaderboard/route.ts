import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let client
  try {
    client = await getPool().connect()

    // Get leaderboard stats for both sides
    // Score is calculated as: total_battles - total_deaths
    const result = await client.query(`
      SELECT 
        side,
        total_battles,
        total_deaths,
        total_resurrections,
        score,
        last_updated
      FROM angel_demon_leaderboard
      ORDER BY score DESC, total_battles DESC
    `)

    return NextResponse.json({
      success: true,
      leaderboard: result.rows,
    })
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}
