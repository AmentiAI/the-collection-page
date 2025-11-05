import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'good' // 'good' or 'bad'
    const limit = parseInt(searchParams.get('limit') || '50')
    
    const pool = getPool()
    
    let query = ''
    if (type === 'good') {
      query = `
        SELECT 
          p.*,
          p.total_good_karma as total_points,
          RANK() OVER (ORDER BY p.total_good_karma DESC) as rank
        FROM profiles p
        WHERE p.total_good_karma > 0
        ORDER BY p.total_good_karma DESC
        LIMIT $1
      `
    } else {
      query = `
        SELECT 
          p.*,
          p.total_bad_karma as total_points,
          RANK() OVER (ORDER BY p.total_bad_karma DESC) as rank
        FROM profiles p
        WHERE p.total_bad_karma > 0
        ORDER BY p.total_bad_karma DESC
        LIMIT $1
      `
    }
    
    const result = await pool.query(query, [limit])
    
    return NextResponse.json({
      leaderboard: result.rows,
      type
    })
  } catch (error) {
    console.error('Leaderboard fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


