import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { put } from '@vercel/blob'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const TILE_SIZE = 256

async function generateTileImage(
  prompt: string,
  neighborTiles: Array<{ image: string; position: 'top' | 'right' | 'bottom' | 'left' }>
): Promise<{ imageUrl: string; imageBlobUrl: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable')
  }

  // Build prompt with neighbor context (similar to nano-banana-infinimap)
  let augmentedPrompt = prompt
  if (neighborTiles.length > 0) {
    const neighborContext = neighborTiles
      .map(n => `There is a ${n.position} neighbor tile that should blend seamlessly`)
      .join('. ')
    augmentedPrompt = `${prompt}. ${neighborContext}. Ensure seamless blending with existing tiles.`
  }

  // Build parts array with prompt and neighbor images
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: augmentedPrompt }
  ]

  // Add neighbor tile images as context (if available)
  for (const neighbor of neighborTiles) {
    if (neighbor.image && neighbor.image.startsWith('data:')) {
      const [mimeType, base64] = neighbor.image.split(',')
      const mime = mimeType.split(':')[1].split(';')[0]
      parts.push({
        inlineData: {
          mimeType: mime,
          data: base64
        }
      })
    }
  }

  // Use Gemini 2.0 Flash Image model (Nano Banana equivalent)
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: parts
        }],
        generationConfig: {
          temperature: 0.7,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null)
    const errorMessage =
      typeof errorPayload?.error?.message === 'string'
        ? errorPayload.error.message
        : `Gemini image generation failed (${response.status})`
    throw new Error(errorMessage)
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            data?: string
            mimeType?: string
          }
          text?: string
        }>
      }
    }>
  }

  // Look for image data in the response
  const candidate = data.candidates?.[0]
  const imagePart = candidate?.content?.parts?.find(p => p.inlineData?.data)
  
  let imageBase64: string
  let mimeType: string = 'image/png'
  
  if (imagePart?.inlineData?.data) {
    imageBase64 = imagePart.inlineData.data
    mimeType = imagePart.inlineData.mimeType || 'image/png'
  } else {
    // If no image, check if there's text that might contain base64
    const textPart = candidate?.content?.parts?.find(p => p.text)
    if (textPart?.text) {
      // Try to extract base64 from text response
      const base64Match = textPart.text.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/)
      if (base64Match) {
        imageBase64 = base64Match[1]
        const mimeMatch = textPart.text.match(/data:(image\/[^;]+);base64/)
        if (mimeMatch) {
          mimeType = mimeMatch[1]
        }
      } else {
        throw new Error('Gemini response did not include image data. Response: ' + textPart.text.substring(0, 200))
      }
    } else {
      throw new Error('Gemini response did not include image data.')
    }
  }

  const imageUrl = `data:${mimeType};base64,${imageBase64}`

  // Resize to tile size and upload to blob storage
  let imageBlobUrl = imageUrl
  try {
    const buffer = Buffer.from(imageBase64, 'base64')
    const sharp = (await import('sharp')).default
    
    // Resize to tile size
    const resizedBuffer = await sharp(buffer)
      .resize(TILE_SIZE, TILE_SIZE, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer()

    const timestamp = Date.now()
    const blobName = `map-tiles/tile-${timestamp}.webp`
    
    const blob = await put(blobName, resizedBuffer, {
      contentType: 'image/webp',
      access: 'public',
    })
    
    imageBlobUrl = blob.url
  } catch (blobError) {
    console.error('[map-tiles][blob upload]', blobError)
    // Continue with base64 fallback
  }

  return { imageUrl, imageBlobUrl }
}

export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { zoomLevel, tileX, tileY, prompt, neighborTiles = [] } = body

    if (!zoomLevel || tileX === undefined || tileY === undefined || !prompt) {
      return NextResponse.json(
        { error: 'Missing required fields: zoomLevel, tileX, tileY, prompt' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Check if tile already exists
    const existing = await client.query(
      'SELECT id FROM map_tiles WHERE zoom_level = $1 AND tile_x = $2 AND tile_y = $3',
      [zoomLevel, tileX, tileY]
    )

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'Tile already exists. Use regenerate endpoint to update it.' },
        { status: 400 }
      )
    }

    // Generate the tile image
    const { imageUrl, imageBlobUrl } = await generateTileImage(prompt, neighborTiles)

    // Save to database
    const result = await client.query(
      `INSERT INTO map_tiles (zoom_level, tile_x, tile_y, prompt, image_blob_url, image_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, zoom_level, tile_x, tile_y, prompt, image_blob_url, created_at`,
      [zoomLevel, tileX, tileY, prompt, imageBlobUrl, imageUrl]
    )

    return NextResponse.json({
      success: true,
      tile: result.rows[0],
    })
  } catch (error) {
    console.error('Error generating tile:', error)
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

