import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const offset = (page - 1) * limit
    const walletAddress = searchParams.get('wallet')?.trim() || null

    const pool = getPool()

    // Build WHERE clause for wallet search
    const whereClause = walletAddress 
      ? `WHERE LOWER(mi.wallet_address) = LOWER($1)`
      : ''
    
    const countParams = walletAddress ? [walletAddress] : []
    const queryParams = walletAddress ? [walletAddress, limit, offset] : [limit, offset]

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM mint_inscriptions mi ${whereClause}`,
      countParams
    )
    const total = Number(countResult.rows[0]?.total ?? 0)

    // Get paginated records
    const result = await pool.query(
      `
        SELECT 
          mi.id,
          mi.mint_queue_id,
          mi.wallet_address,
          mi.payment_address,
          mi.receiving_address,
          mi.commit_tx_id,
          mi.reveal_tx_id,
          mi.inscription_id,
          mi.fee_rate,
          mi.commit_fee_sats,
          mi.reveal_fee_sats,
          mi.total_cost_sats,
          mi.mint_status,
          mi.error_message,
          mi.created_at,
          mi.updated_at,
          mi.commit_signed_at,
          mi.commit_broadcast_at,
          mi.commit_confirmed_at,
          mi.reveal_broadcast_at,
          mi.reveal_confirmed_at,
          mi.completed_at,
          mi.last_checked_at,
          mq.source_inscription_id,
          mq.image_blob_url,
          mq.compressed_image_url
        FROM mint_inscriptions mi
        LEFT JOIN ascended_images_mint_queue mq ON mq.id = mi.mint_queue_id
        ${whereClause}
        ORDER BY mi.created_at DESC
        LIMIT ${walletAddress ? '$2' : '$1'} OFFSET ${walletAddress ? '$3' : '$2'}
      `,
      queryParams
    )

    return NextResponse.json({
      success: true,
      records: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('[admin/mint-inscriptions][GET] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch mint inscriptions'
      },
      { status: 500 }
    )
  }
}

