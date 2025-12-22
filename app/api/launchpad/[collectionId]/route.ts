import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { collectionId: string } }
) {
  try {
    const { collectionId } = params

    if (!collectionId) {
      return NextResponse.json({ error: 'Collection ID is required' }, { status: 400 })
    }

    const pool = getPool()
    const client = await pool.connect()

    try {
      // Ensure collectionId is a string and handle UUID or lp_public_key
      const collectionIdStr = String(collectionId).trim()
      
      const query = `
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
        WHERE id = $1 OR lp_public_key = $1
        LIMIT 1
      `
      
      const result = await client.query(query, [collectionIdStr])

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      }

      return NextResponse.json({ collection: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Collection GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

