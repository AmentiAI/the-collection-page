import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check admin token
    if (ADMIN_TOKEN) {
      const headerToken = request.headers.get('x-admin-token')
      if (headerToken !== ADMIN_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { id } = params
    const body = await request.json()

    const pool = getPool()
    const client = await pool.connect()

    try {
      // Build UPDATE query dynamically based on provided fields
      const allowedFields = [
        'lp_public_key', 'network', 'host_name', 'host_namespace', 'curve_type',
        'asset_a_address', 'asset_b_address', 'asset_a_name', 'asset_b_name',
        'asset_a_symbol', 'asset_b_symbol', 'asset_a_decimals', 'asset_b_decimals',
        'asset_a_reserve', 'asset_b_reserve', 'tvl_asset_b', 'volume_24h_asset_b',
        'price_change_percent_24h', 'current_price_a_in_b', 'lp_fee_bps', 'host_fee_bps',
        'created_at', 'updated_at', 'last_synced_at'
      ]

      const updates: string[] = []
      const values: any[] = []
      let paramIndex = 1

      for (const [key, value] of Object.entries(body)) {
        if (allowedFields.includes(key)) {
          updates.push(`${key} = $${paramIndex}`)
          values.push(value === '' ? null : value)
          paramIndex++
        }
      }

      if (updates.length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
      }

      // Always update updated_at
      updates.push(`updated_at = NOW()`)

      values.push(id)
      const updateQuery = `
        UPDATE flashnet_pools
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `

      const result = await client.query(updateQuery, values)

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      }

      return NextResponse.json({ success: true, record: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Collection PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check admin token
    if (ADMIN_TOKEN) {
      const headerToken = request.headers.get('x-admin-token')
      if (headerToken !== ADMIN_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { id } = params

    const pool = getPool()
    const client = await pool.connect()

    try {
      const deleteQuery = `DELETE FROM flashnet_pools WHERE id = $1 RETURNING id`
      const result = await client.query(deleteQuery, [id])

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      }

      return NextResponse.json({ success: true })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Collection DELETE error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

