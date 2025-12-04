import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const MAP_SIZE = 2048
const TILE_SIZE = 256
const MAX_ZOOM = 4

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  // Dynamically import sharp to avoid build-time errors
  const sharp = (await import('sharp')).default
  
  let client
  try {
    const { z: zStr, x: xStr, y: yStr } = await params
    const z = parseInt(zStr, 10)
    const x = parseInt(xStr, 10)
    const y = parseInt(yStr, 10)

    console.log(`🗺️ TILE REQUEST: z=${z}, x=${x}, y=${y}`)

    if (isNaN(z) || isNaN(x) || isNaN(y) || z < 0 || z > MAX_ZOOM) {
      console.error(`❌ Invalid tile coordinates: z=${z}, x=${x}, y=${y}`)
      return NextResponse.json({ error: 'Invalid tile coordinates' }, { status: 400 })
    }

    // Calculate valid tile range for this zoom level
    const tilesPerSide = Math.pow(2, z)
    
    // Clamp coordinates to valid range (0 to tilesPerSide - 1)
    // For negative coordinates or out-of-bounds, return a black tile
    if (x < 0 || y < 0 || x >= tilesPerSide || y >= tilesPerSide) {
      // Return a black tile for out-of-bounds coordinates
      const blackTile = await sharp({
        create: {
          width: TILE_SIZE,
          height: TILE_SIZE,
          channels: 3,
          background: { r: 0, g: 0, b: 0 }
        }
      })
        .webp({ quality: 85 })
        .toBuffer()
      
      return new NextResponse(new Uint8Array(blackTile), {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    client = await getPool().connect()

    // Check if this tile was AI-generated
    const generated = await client.query(
      'SELECT image_blob_url FROM map_tiles WHERE zoom_level = $1 AND tile_x = $2 AND tile_y = $3',
      [z, x, y]
    )

    if (generated.rows.length > 0 && generated.rows[0].image_blob_url) {
      // Return the generated tile
      const imageResponse = await fetch(generated.rows[0].image_blob_url)
      if (imageResponse.ok) {
        const imageBuffer = await imageResponse.arrayBuffer()
        return new NextResponse(Buffer.from(imageBuffer), {
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }
    }

    // Fallback to base map extraction
    const tileMapSize = MAP_SIZE / tilesPerSide
    const sourceX = x * tileMapSize
    const sourceY = y * tileMapSize

    // Ensure we don't go out of bounds
    const left = Math.max(0, Math.floor(sourceX))
    const top = Math.max(0, Math.floor(sourceY))
    const right = Math.min(MAP_SIZE, Math.ceil(sourceX + tileMapSize))
    const bottom = Math.min(MAP_SIZE, Math.ceil(sourceY + tileMapSize))
    const width = right - left
    const height = bottom - top

    if (width <= 0 || height <= 0) {
      // Return a black tile if extraction area is invalid
      const blackTile = await sharp({
        create: {
          width: TILE_SIZE,
          height: TILE_SIZE,
          channels: 3,
          background: { r: 0, g: 0, b: 0 }
        }
      })
        .webp({ quality: 85 })
        .toBuffer()
      
      return new NextResponse(new Uint8Array(blackTile), {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    const mapPath = path.join(process.cwd(), 'public', 'map.webp')
    console.log(`🗺️ Map file path: ${mapPath}`)
    console.log(`🗺️ Map file exists: ${fs.existsSync(mapPath)}`)
    console.log(`🗺️ Tile extraction: left=${left}, top=${top}, width=${width}, height=${height}`)
    
    if (!fs.existsSync(mapPath)) {
      console.error(`❌ Map image not found at: ${mapPath}`)
      console.error(`❌ Current working directory: ${process.cwd()}`)
      console.error(`❌ Public directory exists: ${fs.existsSync(path.join(process.cwd(), 'public'))}`)
      return NextResponse.json({ 
        error: 'Map image not found',
        path: mapPath,
        cwd: process.cwd()
      }, { status: 404 })
    }

    try {
      const mapStats = fs.statSync(mapPath)
      console.log(`🗺️ Map file size: ${mapStats.size} bytes`)
      
      const tile = await sharp(mapPath)
        .extract({
          left: left,
          top: top,
          width: width,
          height: height,
        })
        .resize(TILE_SIZE, TILE_SIZE, {
          fit: 'fill',
        })
        .webp({ quality: 85 })
        .toBuffer()

      console.log(`✅ Tile generated successfully: ${tile.length} bytes for z=${z}, x=${x}, y=${y}`)
      
      return new NextResponse(new Uint8Array(tile), {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch (sharpError) {
      console.error(`❌ Sharp error generating tile:`, sharpError)
      throw sharpError
    }
  } catch (error) {
    console.error('❌ Error generating tile:', error)
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}
