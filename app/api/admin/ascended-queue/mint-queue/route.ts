import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit

    const pool = getPool()

    // Get total count (only source_inscription_id starting with 'ascended_')
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM ascended_images_mint_queue
      WHERE source_inscription_id LIKE 'ascended_%'
    `)
    const total = parseInt(countResult.rows[0]?.total || '0')

    // Get paginated records (only source_inscription_id starting with 'ascended_')
    const result = await pool.query(
      `
      SELECT 
        id,
        limbo_id,
        wallet_address,
        image_url,
        image_blob_url,
        source_inscription_id,
        generation_prompt,
        created_at
      FROM ascended_images_mint_queue
      WHERE source_inscription_id LIKE 'ascended_%'
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    )

    return NextResponse.json({
      success: true,
      records: result.rows,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('[admin/ascended-queue/mint-queue][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load mint queue' },
      { status: 500 }
    )
  }
}

