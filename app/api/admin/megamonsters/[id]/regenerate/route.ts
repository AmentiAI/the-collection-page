import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

async function generateMegaMonsterImage(prompt: string): Promise<{ imageUrl: string; imageBlobUrl: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Missing OpenAI API key')
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: prompt,
      size: '1024x1024',
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

  // Upload to blob storage
  let imageBlobUrl = imageUrl // Fallback to base64 if upload fails
  try {
    const buffer = Buffer.from(imageBase64, 'base64')
    const timestamp = Date.now()
    const blobName = `mega-monsters/regen-${timestamp}.png`
    
    const blob = await put(blobName, buffer, {
      contentType: 'image/png',
      access: 'public',
    })
    
    imageBlobUrl = blob.url
  } catch (blobError) {
    console.error('[mega-monsters][blob upload]', blobError)
    // Continue with base64 fallback
  }

  return { imageUrl, imageBlobUrl }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const { prompt } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Generation prompt is required' },
        { status: 400 }
      )
    }

    // Generate new image using OpenAI
    const { imageUrl, imageBlobUrl } = await generateMegaMonsterImage(prompt)

    return NextResponse.json({
      success: true,
      regeneratedImageUrl: imageUrl, // Base64 data URL for immediate display
      regeneratedImageBlobUrl: imageBlobUrl, // Permanent Vercel Blob URL
    })
  } catch (error) {
    console.error('Mega monster regenerate error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to regenerate image',
      },
      { status: 500 }
    )
  }
}

