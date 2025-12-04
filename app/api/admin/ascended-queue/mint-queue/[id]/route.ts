import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing ID' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { image_blob_url, generation_prompt } = body

    const pool = getPool()

    const result = await pool.query(
      `
      UPDATE ascended_images_mint_queue
      SET 
        image_blob_url = COALESCE($1, image_blob_url),
        generation_prompt = COALESCE($2, generation_prompt)
      WHERE id = $3
      RETURNING id
      `,
      [image_blob_url || null, generation_prompt || null, id]
    )

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Record not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Record updated',
    })
  } catch (error) {
    console.error('[admin/ascended-queue/mint-queue/update][PATCH]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update record' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing ID' },
        { status: 400 }
      )
    }

    const pool = getPool()

    const result = await pool.query(
      `DELETE FROM ascended_images_mint_queue WHERE id = $1 RETURNING id`,
      [id]
    )

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Record not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Record deleted',
    })
  } catch (error) {
    console.error('[admin/ascended-queue/mint-queue/delete][DELETE]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete record' },
      { status: 500 }
    )
  }
}

