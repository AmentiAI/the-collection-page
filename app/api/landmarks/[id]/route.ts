import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let client
  try {
    const { id } = await params
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid landmark ID format. Must be a UUID.' },
        { status: 400 }
      )
    }
    
    const body = await request.json()
    const { name, type, spriteX, spriteY, spriteWidth, spriteHeight, mapX, mapY, url, spriteSource } = body

    client = await getPool().connect()

    const updates: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`)
      values.push(name)
    }
    if (type !== undefined) {
      updates.push(`type = $${paramCount++}`)
      values.push(type)
    }
    if (spriteX !== undefined) {
      updates.push(`sprite_x = $${paramCount++}`)
      values.push(Math.round(Number(spriteX)))
    }
    if (spriteY !== undefined) {
      updates.push(`sprite_y = $${paramCount++}`)
      values.push(Math.round(Number(spriteY)))
    }
    if (spriteWidth !== undefined) {
      updates.push(`sprite_width = $${paramCount++}`)
      values.push(Math.round(Number(spriteWidth)))
    }
    if (spriteHeight !== undefined) {
      updates.push(`sprite_height = $${paramCount++}`)
      values.push(Math.round(Number(spriteHeight)))
    }
    if (mapX !== undefined) {
      updates.push(`map_x = $${paramCount++}`)
      values.push(Math.round(Number(mapX)))
    }
    if (mapY !== undefined) {
      updates.push(`map_y = $${paramCount++}`)
      values.push(Math.round(Number(mapY)))
    }
    if (url !== undefined) {
      updates.push(`url = $${paramCount++}`)
      values.push(url || null)
    }
    if (spriteSource !== undefined) {
      if (spriteSource !== 'landmarks.png' && spriteSource !== 'landmarks2.png') {
        return NextResponse.json(
          { error: 'spriteSource must be landmarks.png or landmarks2.png' },
          { status: 400 }
        )
      }
      updates.push(`sprite_source = $${paramCount++}`)
      values.push(spriteSource)
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    values.push(id)

    const result = await client.query(
      `UPDATE landmarks 
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount}
       RETURNING id, name, type, sprite_x as "spriteX", sprite_y as "spriteY", 
                 sprite_width as "spriteWidth", sprite_height as "spriteHeight",
                 map_x as "mapX", map_y as "mapY", url, sprite_source as "spriteSource"`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Landmark not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      landmark: result.rows[0],
    })
  } catch (error) {
    console.error('Error updating landmark:', error)
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let client
  try {
    const { id } = await params
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid landmark ID format. Must be a UUID.' },
        { status: 400 }
      )
    }
    
    client = await getPool().connect()

    const result = await client.query(
      'DELETE FROM landmarks WHERE id = $1 RETURNING id',
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Landmark not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Landmark deleted',
    })
  } catch (error) {
    console.error('Error deleting landmark:', error)
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

