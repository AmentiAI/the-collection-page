import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET: List mega monsters with pagination
export async function GET(request: NextRequest) {
  let client
  try {
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10', 10)))
    const offset = (page - 1) * limit

    client = await pool.connect()

    // Get total count
    const countResult = await client.query('SELECT COUNT(*) FROM mega_monsters')
    const total = parseInt(countResult.rows[0].count, 10)

    // Get records
    const result = await client.query(
      `
      SELECT 
        id,
        wallet_address,
        inscription_id,
        commit_txid,
        broadcast_txid,
        prompt,
        image_data,
        image_blob_url,
        created_at,
        updated_at
      FROM mega_monsters
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
    console.error('Failed to fetch mega monsters:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch mega monsters' },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

// POST: Create new mega monster record
export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { 
      wallet_address, 
      inscription_id, 
      commit_txid, 
      broadcast_txid, 
      prompt 
    } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Prompt is required' },
        { status: 400 }
      )
    }

    client = await pool.connect()

    const result = await client.query(
      `
      INSERT INTO mega_monsters (
        wallet_address,
        inscription_id,
        commit_txid,
        broadcast_txid,
        prompt
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [wallet_address || null, inscription_id || null, commit_txid || null, broadcast_txid || null, prompt]
    )

    return NextResponse.json({
      success: true,
      record: result.rows[0],
    })
  } catch (error) {
    console.error('Failed to create mega monster:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create mega monster' },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

