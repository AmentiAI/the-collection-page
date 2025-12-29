import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  let client
  try {
    const { z: zStr, x: xStr, y: yStr } = await params
    const z = parseInt(zStr, 10)
    const x = parseInt(xStr, 10)
    const y = parseInt(yStr, 10)

    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return NextResponse.json({ error: 'Invalid tile coordinates' }, { status: 400 })
    }

    client = await getPool().connect()

    const result = await client.query(
      'DELETE FROM map_tiles WHERE zoom_level = $1 AND tile_x = $2 AND tile_y = $3 RETURNING id',
      [z, x, y]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Tile not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Tile deleted',
    })
  } catch (error) {
    console.error('Error deleting tile:', error)
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









