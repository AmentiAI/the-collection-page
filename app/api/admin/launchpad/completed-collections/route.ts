import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

export async function GET(request: NextRequest) {
  try {
    // Check admin token
    if (ADMIN_TOKEN) {
      const headerToken = request.headers.get('x-admin-token')
      if (headerToken !== ADMIN_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)))
    const offset = (page - 1) * limit
    const search = url.searchParams.get('search')?.trim() || ''
    const sortColumn = url.searchParams.get('sortColumn') || null
    const sortDirection = url.searchParams.get('sortDirection') || 'asc'

    const pool = getPool()
    const client = await pool.connect()

    try {
      // Build WHERE clause
      const whereConditions: string[] = []
      const queryParams: any[] = []
      let paramIndex = 1

      if (search) {
        const searchStr = String(search).trim()
        whereConditions.push(`(
          lp_public_key ILIKE $${paramIndex} OR
          host_name ILIKE $${paramIndex} OR
          asset_a_name ILIKE $${paramIndex} OR
          asset_b_name ILIKE $${paramIndex} OR
          asset_a_symbol ILIKE $${paramIndex} OR
          asset_b_symbol ILIKE $${paramIndex} OR
          asset_a_address ILIKE $${paramIndex} OR
          asset_b_address ILIKE $${paramIndex}
        )`)
        queryParams.push(`%${searchStr}%`)
        paramIndex++
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : ''

      // Build ORDER BY clause
      let orderBy = 'ORDER BY created_at DESC'
      if (sortColumn) {
        const validColumns = [
          'id', 'lp_public_key', 'network', 'host_name', 'host_namespace', 'curve_type',
          'asset_a_address', 'asset_b_address', 'asset_a_name', 'asset_b_name',
          'asset_a_symbol', 'asset_b_symbol', 'asset_a_decimals', 'asset_b_decimals',
          'asset_a_reserve', 'asset_b_reserve', 'tvl_asset_b', 'volume_24h_asset_b',
          'price_change_percent_24h', 'current_price_a_in_b', 'lp_fee_bps', 'host_fee_bps',
          'created_at', 'updated_at', 'last_synced_at'
        ]
        const sortColumnStr = String(sortColumn).trim()
        if (validColumns.includes(sortColumnStr)) {
          orderBy = `ORDER BY ${sortColumnStr} ${sortDirection === 'desc' ? 'DESC' : 'ASC'}`
        }
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM flashnet_pools ${whereClause}`
      const countResult = await client.query(countQuery, queryParams)
      const total = parseInt(countResult.rows[0].total, 10)

      // Get records
      const dataQuery = `
        SELECT 
          id,
          lp_public_key,
          network,
          host_name,
          host_namespace,
          curve_type,
          asset_a_address,
          asset_b_address,
          asset_a_name,
          asset_b_name,
          asset_a_symbol,
          asset_b_symbol,
          asset_a_decimals,
          asset_b_decimals,
          asset_a_reserve,
          asset_b_reserve,
          tvl_asset_b,
          volume_24h_asset_b,
          price_change_percent_24h,
          current_price_a_in_b,
          lp_fee_bps,
          host_fee_bps,
          created_at,
          updated_at,
          last_synced_at
        FROM flashnet_pools
        ${whereClause}
        ${orderBy}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `
      queryParams.push(limit, offset)
      const dataResult = await client.query(dataQuery, queryParams)

      const totalPages = Math.ceil(total / limit)

      return NextResponse.json({
        records: dataResult.rows,
        total,
        totalPages,
        page,
        limit,
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Completed collections GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

