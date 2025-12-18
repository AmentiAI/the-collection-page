import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { tiles } = body // Array of {z, x, y}

    if (!Array.isArray(tiles)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    client = await getPool().connect()

    const tileKeys = tiles.map(t => `${t.z}/${t.x}/${t.y}`)
    const placeholders = tiles.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ')
    const values = tiles.flatMap(t => [t.z, t.x, t.y])

    const result = await client.query(
      `SELECT zoom_level, tile_x, tile_y 
       FROM map_tiles 
       WHERE (zoom_level, tile_x, tile_y) IN (${placeholders})`,
      values
    )

    const generated = new Set(
      result.rows.map(r => `${r.zoom_level}/${r.tile_x}/${r.tile_y}`)
    )

    return NextResponse.json({
      success: true,
      generated: Array.from(generated),
    })
  } catch (error) {
    console.error('Error checking tiles:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}





