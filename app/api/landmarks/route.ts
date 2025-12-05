import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  let client
  try {
    client = await getPool().connect()

    const result = await client.query(
      `SELECT id, name, type, sprite_x as "spriteX", sprite_y as "spriteY", 
              sprite_width as "spriteWidth", sprite_height as "spriteHeight",
              map_x as "mapX", map_y as "mapY", url, sprite_source as "spriteSource"
       FROM landmarks
       ORDER BY type, name`
    )

    return NextResponse.json({
      success: true,
      landmarks: result.rows,
    })
  } catch (error) {
    console.error('Error fetching landmarks:', error)
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

export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { name, type, spriteX, spriteY, spriteWidth, spriteHeight, mapX, mapY, url, spriteSource } = body

    if (!name || !type || spriteX === undefined || spriteY === undefined || 
        spriteWidth === undefined || spriteHeight === undefined || 
        mapX === undefined || mapY === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (type !== 'demonic' && type !== 'angelic') {
      return NextResponse.json(
        { error: 'Type must be demonic or angelic' },
        { status: 400 }
      )
    }

    // Convert all coordinate values to integers (round to nearest integer)
    const spriteXInt = Math.round(Number(spriteX))
    const spriteYInt = Math.round(Number(spriteY))
    const spriteWidthInt = Math.round(Number(spriteWidth))
    const spriteHeightInt = Math.round(Number(spriteHeight))
    const mapXInt = Math.round(Number(mapX))
    const mapYInt = Math.round(Number(mapY))

    client = await getPool().connect()

    const spriteSourceValue = spriteSource || 'landmarks.png'
    if (spriteSourceValue !== 'landmarks.png' && spriteSourceValue !== 'landmarks2.png' && spriteSourceValue !== 'marker3.png') {
      return NextResponse.json(
        { error: 'spriteSource must be landmarks.png, landmarks2.png, or marker3.png' },
        { status: 400 }
      )
    }

    const result = await client.query(
      `INSERT INTO landmarks (name, type, sprite_x, sprite_y, sprite_width, sprite_height, map_x, map_y, url, sprite_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, type, sprite_x as "spriteX", sprite_y as "spriteY", 
                 sprite_width as "spriteWidth", sprite_height as "spriteHeight",
                 map_x as "mapX", map_y as "mapY", url, sprite_source as "spriteSource"`,
      [name, type, spriteXInt, spriteYInt, spriteWidthInt, spriteHeightInt, mapXInt, mapYInt, url || null, spriteSourceValue]
    )

    return NextResponse.json({
      success: true,
      landmark: result.rows[0],
    })
  } catch (error) {
    console.error('Error creating landmark:', error)
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

