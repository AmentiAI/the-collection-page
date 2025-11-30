import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let client
  try {
    const searchParams = request.nextUrl.searchParams
    const side = searchParams.get('side') // 'Angelic' or 'Demonic'
    const limit = parseInt(searchParams.get('limit') || '50')

    if (side && side !== 'Angelic' && side !== 'Demonic') {
      return NextResponse.json(
        { error: 'side must be "Angelic" or "Demonic"' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Get individual leader stats by aggregating from attack logs and battle_ordinals
    // Score = total_battles - total_deaths
    const params: any[] = []
    let paramCount = 1

    let query = `
      WITH wallet_stats AS (
        SELECT 
          al.wallet_address,
          COUNT(DISTINCT al.id) as total_battles,
          COUNT(DISTINCT CASE WHEN al.life_force_after = 0 AND al.life_force_before > 0 THEN al.id END) as total_deaths,
          bo.trait
        FROM mega_monster_attack_logs al
        JOIN battle_ordinals bo ON al.army_id = bo.id
        WHERE al.trait = bo.trait
    `

    if (side) {
      query += ` AND al.trait = $${paramCount}`
      params.push(side)
      paramCount++
    }

    query += `
        GROUP BY al.wallet_address, bo.trait
      ),
      resurrection_stats AS (
        SELECT 
          wallet_address,
          COUNT(*) as total_resurrections
        FROM battle_ordinals
        WHERE resurrection_time IS NOT NULL
          AND is_dead = false
    `

    if (side) {
      query += ` AND trait = $${paramCount}`
      params.push(side)
      paramCount++
    }

    query += `
        GROUP BY wallet_address
      )
      SELECT 
        ws.wallet_address,
        ws.trait,
        COALESCE(ws.total_battles, 0)::bigint as total_battles,
        COALESCE(ws.total_deaths, 0)::bigint as total_deaths,
        COALESCE(rs.total_resurrections, 0)::bigint as total_resurrections,
        (COALESCE(ws.total_battles, 0) - COALESCE(ws.total_deaths, 0))::bigint as score
      FROM wallet_stats ws
      LEFT JOIN resurrection_stats rs ON ws.wallet_address = rs.wallet_address
    `

    if (side) {
      query += ` WHERE ws.trait = $${paramCount}`
      params.push(side)
      paramCount++
    }

    query += `
      ORDER BY score DESC, total_battles DESC
      LIMIT $${paramCount}
    `
    params.push(limit)

    const result = await client.query(query, params)

    return NextResponse.json({
      success: true,
      leaders: result.rows,
    })
  } catch (error) {
    console.error('Error fetching individual leaders:', error)
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

