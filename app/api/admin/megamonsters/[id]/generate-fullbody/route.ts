import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

async function generateFullBodyMegaMonsterImage(prompt: string): Promise<{ imageUrl: string; imageBlobUrl: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Missing OpenAI API key')
  }

  // Append full body prompt to the original prompt
  const fullBodyPrompt = `${prompt}, now make it a full body image showing the entire character with transparent background`

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: fullBodyPrompt,
      size: '1024x1024',
      quality: "high",
      n: 1,   
    }),
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null)
    const errorMessage =
      typeof errorPayload?.error?.message === 'string'
        ? errorPayload.error.message
        : `Image generation failed (${response.status})`
    throw new Error(errorMessage)
  }

  const data = (await response.json()) as {
    data?: Array<{
      b64_json?: string
      revised_prompt?: string
    }>
  }

  const imagePayload = data.data?.[0]
  if (!imagePayload?.b64_json) {
    throw new Error('OpenAI response did not include image data.')
  }

  const imageBase64 = imagePayload.b64_json
  const imageUrl = `data:image/png;base64,${imageBase64}`

  // Upload to blob storage in a new area
  let imageBlobUrl = imageUrl // Fallback to base64 if upload fails
  try {
    const buffer = Buffer.from(imageBase64, 'base64')
    const timestamp = Date.now()
    const blobName = `mega-monsters/fullbody/fullbody-${timestamp}.png`
    
    const blob = await put(blobName, buffer, {
      contentType: 'image/png',
      access: 'public',
    })
    
    imageBlobUrl = blob.url
  } catch (blobError) {
    console.error('[mega-monsters][fullbody blob upload]', blobError)
    // Continue with base64 fallback
  }

  return { imageUrl, imageBlobUrl }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let client
  try {
    const { id } = await context.params
    
    const pool = getPool()
    client = await pool.connect()

    // Get the record to retrieve the prompt
    const recordResult = await client.query(
      'SELECT prompt FROM mega_monsters WHERE id = $1',
      [id]
    )

    if (recordResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Mega monster not found' },
        { status: 404 }
      )
    }

    const prompt = recordResult.rows[0].prompt
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'No prompt found for this mega monster' },
        { status: 400 }
      )
    }

    // Generate full body image
    const { imageUrl, imageBlobUrl } = await generateFullBodyMegaMonsterImage(prompt)

    // Update the record with full body image blob URL
    const updateResult = await client.query(
      `
      UPDATE mega_monsters
      SET full_body_image_blob_url = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [imageBlobUrl, id]
    )

    return NextResponse.json({
      success: true,
      record: updateResult.rows[0],
      imageUrl,
      imageBlobUrl,
    })
  } catch (error) {
    console.error('Mega monster full body generation error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate full body image',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

