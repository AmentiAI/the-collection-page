import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let client
  try {
    const { id } = await context.params
    
    const pool = getPool()
    client = await pool.connect()

    // Verify the record exists
    const recordResult = await client.query(
      'SELECT id FROM mega_monsters WHERE id = $1',
      [id]
    )

    if (recordResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Mega monster not found' },
        { status: 404 }
      )
    }

    // Get the uploaded file
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'File is required' },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'File is empty' },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to blob storage
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const blobName = `mega-monsters/fullbody/upload-${timestamp}-${sanitizedName}`

    const blob = await put(blobName, buffer, {
      contentType: file.type || 'image/png',
      access: 'public',
    })

    // Update the record with full body image blob URL
    const updateResult = await client.query(
      `
      UPDATE mega_monsters
      SET full_body_image_blob_url = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [blob.url, id]
    )

    return NextResponse.json({
      success: true,
      record: updateResult.rows[0],
      imageBlobUrl: blob.url,
    })
  } catch (error) {
    console.error('Mega monster full body upload error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload full body image',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

