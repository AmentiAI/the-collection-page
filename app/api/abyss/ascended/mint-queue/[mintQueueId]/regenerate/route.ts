import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'
import type { Pool } from 'pg'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

async function ensureBonusAllowancesTable(pool: Pool) {
  if (isTableInitialized('regenerate_bonus_allowances')) {
    return
  }

  // DDL operations commented out for performance - tables must exist in production
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS abyss_bonus_allowances (
  //     wallet TEXT PRIMARY KEY,
  //     available INTEGER NOT NULL DEFAULT 0,
  //     updated_at TIMESTAMPTZ DEFAULT NOW()
  //   )
  // `)

  markTableInitialized('regenerate_bonus_allowances')
}

async function generateMutantMonsterImage(prompt: string): Promise<{ imageUrl: string; imageBase64: string; imageBlobUrl: string }> {
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
    const blobName = `ascended-mutants/regen-${timestamp}.png`
    
    const blob = await put(blobName, buffer, {
      contentType: 'image/png',
      access: 'public',
    })
    
    imageBlobUrl = blob.url
  } catch (blobError) {
    console.error('[regenerate][blob upload]', blobError)
    // Continue with base64 fallback
  }

  return { imageUrl, imageBase64, imageBlobUrl }
}

// GET - Generate a regenerated version for preview (no DB changes)
export async function GET(request: NextRequest, { params }: { params: { mintQueueId: string } }) {
  try {
    const { mintQueueId } = params
    if (!mintQueueId) {
      return NextResponse.json({ success: false, error: 'Missing mintQueueId' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const walletAddressRaw = searchParams.get('walletAddress')?.trim()

    if (!walletAddressRaw) {
      return NextResponse.json({ success: false, error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()
    await ensureBonusAllowancesTable(pool)

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      // Check and deduct regeneration allowance (with row lock)
      const allowanceRes = await client.query(
        `SELECT available FROM abyss_bonus_allowances WHERE LOWER(wallet) = LOWER($1) FOR UPDATE`,
        [walletAddressRaw],
      )
      const available = Number(allowanceRes.rows[0]?.available ?? 0)

      if (available <= 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ 
          success: false, 
          error: 'No regeneration allowances available. Complete summons to earn more.' 
        }, { status: 403 })
      }

      // Deduct 1 from allowance immediately (credit is burned on generation)
      await client.query(
        `
          UPDATE abyss_bonus_allowances
          SET available = available - 1,
              updated_at = NOW()
          WHERE LOWER(wallet) = LOWER($1)
        `,
        [walletAddressRaw],
      )

      // Get the mint queue entry and verify ownership
      const mintQueueRes = await client.query(
        `
          SELECT 
            mq.id,
            mq.wallet_address,
            mq.image_url,
            mq.image_blob_url,
            mq.generation_prompt,
            mq.source_inscription_id
          FROM ascended_images_mint_queue mq
          WHERE mq.id = $1
            AND LOWER(mq.wallet_address) = LOWER($2)
          FOR UPDATE
        `,
        [mintQueueId, walletAddressRaw],
      )

      if (mintQueueRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Mint queue entry not found or not owned by you.' }, { status: 404 })
      }

      const mintQueue = mintQueueRes.rows[0]
      
      if (!mintQueue.generation_prompt) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'No generation prompt found for this image.' }, { status: 400 })
      }

      // Generate new image using the same prompt
      const { imageUrl, imageBase64, imageBlobUrl } = await generateMutantMonsterImage(mintQueue.generation_prompt)

      // Get remaining allowance
      const updatedAllowanceRes = await client.query(
        `SELECT available FROM abyss_bonus_allowances WHERE LOWER(wallet) = LOWER($1)`,
        [walletAddressRaw],
      )
      const remainingAllowance = Number(updatedAllowanceRes.rows[0]?.available ?? 0)

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        originalImageUrl: mintQueue.image_blob_url || mintQueue.image_url,
        regeneratedImageUrl: imageBlobUrl || imageUrl,
        regeneratedImageBase64: imageBase64,
        regeneratedImageBlobUrl: imageBlobUrl,
        remainingAllowance, // Return updated allowance
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[mint-queue/regenerate][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to regenerate image.' }, { status: 500 })
  }
}

// POST - Apply the regenerated image (update DB)
export async function POST(request: NextRequest, { params }: { params: { mintQueueId: string } }) {
  try {
    const { mintQueueId } = params
    if (!mintQueueId) {
      return NextResponse.json({ success: false, error: 'Missing mintQueueId' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const walletAddressRaw = (body?.walletAddress ?? '').toString().trim()
    const regeneratedImageUrl = (body?.regeneratedImageUrl ?? '').toString().trim()
    const regeneratedImageBlobUrl = (body?.regeneratedImageBlobUrl ?? '').toString().trim()

    if (!walletAddressRaw) {
      return NextResponse.json({ success: false, error: 'walletAddress is required' }, { status: 400 })
    }

    if (!regeneratedImageUrl) {
      return NextResponse.json({ success: false, error: 'regeneratedImageUrl is required' }, { status: 400 })
    }

    const pool = getPool()
    await ensureBonusAllowancesTable(pool)
    
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      // Verify ownership and get current state
      const mintQueueRes = await client.query(
        `
          SELECT 
            id,
            wallet_address,
            image_url,
            image_blob_url
          FROM ascended_images_mint_queue
          WHERE id = $1
            AND LOWER(wallet_address) = LOWER($2)
          FOR UPDATE
        `,
        [mintQueueId, walletAddressRaw],
      )

      if (mintQueueRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Mint queue entry not found or not owned by you.' }, { status: 404 })
      }

      // Credit was already deducted in GET request, just apply the regenerated image
      // Update the mint queue entry with new image URLs
      // Reset compression status since this is a fresh regenerated image
      await client.query(
        `
          UPDATE ascended_images_mint_queue
          SET 
            image_url = $1,
            image_blob_url = $2,
            is_compressed = FALSE,
            compressed_image_url = NULL,
            compressed_size_bytes = NULL
          WHERE id = $3
        `,
        [regeneratedImageUrl, regeneratedImageBlobUrl || regeneratedImageUrl, mintQueueId],
      )

      // Clear any pending mint inscriptions for this queue entry
      // since the image has changed and old commit data is now invalid
      await client.query(
        `
          DELETE FROM mint_inscriptions
          WHERE mint_queue_id = $1
            AND mint_status NOT IN ('completed', 'reveal_confirmed')
        `,
        [mintQueueId],
      )

      // Get remaining allowance
      const updatedAllowanceRes = await client.query(
        `SELECT available FROM abyss_bonus_allowances WHERE LOWER(wallet) = LOWER($1)`,
        [walletAddressRaw],
      )
      const remainingAllowance = Number(updatedAllowanceRes.rows[0]?.available ?? 0)

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        message: 'Image successfully regenerated and updated.',
        remainingAllowance,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[mint-queue/regenerate][POST]', error)
    return NextResponse.json({ success: false, error: 'Failed to apply regenerated image.' }, { status: 500 })
  }
}


