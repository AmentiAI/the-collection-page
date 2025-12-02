import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// PATCH: Update mega monster record
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let client
  try {
    const { id } = await context.params
    const body = await request.json()
    const { 
      wallet_address, 
      inscription_id, 
      commit_txid, 
      broadcast_txid, 
      prompt,
      name,
      image_data,
      image_blob_url
    } = body

    const pool = getPool()
    client = await pool.connect()

    // Build dynamic update query based on provided fields
    const updates: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (wallet_address !== undefined) {
      updates.push(`wallet_address = $${paramCount}`)
      values.push(wallet_address || null)
      paramCount++
    }
    if (inscription_id !== undefined) {
      updates.push(`inscription_id = $${paramCount}`)
      values.push(inscription_id || null)
      paramCount++
    }
    if (commit_txid !== undefined) {
      updates.push(`commit_txid = $${paramCount}`)
      values.push(commit_txid || null)
      paramCount++
    }
    if (broadcast_txid !== undefined) {
      updates.push(`broadcast_txid = $${paramCount}`)
      values.push(broadcast_txid || null)
      paramCount++
    }
    if (prompt !== undefined) {
      updates.push(`prompt = $${paramCount}`)
      values.push(prompt)
      paramCount++
    }
    if (name !== undefined) {
      updates.push(`name = $${paramCount}`)
      values.push(name || null)
      paramCount++
    }
    if (image_data !== undefined) {
      updates.push(`image_data = $${paramCount}`)
      values.push(image_data || null)
      paramCount++
    }
    if (image_blob_url !== undefined) {
      updates.push(`image_blob_url = $${paramCount}`)
      values.push(image_blob_url || null)
      paramCount++
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    values.push(id)
    const result = await client.query(
      `
      UPDATE mega_monsters
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
      `,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Mega monster not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      record: result.rows[0],
    })
  } catch (error) {
    console.error('Failed to update mega monster:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update mega monster' },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

// DELETE: Delete mega monster record
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let client
  try {
    const { id } = await context.params

    const pool = getPool()
    client = await pool.connect()

    const result = await client.query(
      'DELETE FROM mega_monsters WHERE id = $1 RETURNING id',
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Mega monster not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Mega monster deleted',
    })
  } catch (error) {
    console.error('Failed to delete mega monster:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete mega monster' },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

