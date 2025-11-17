import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'
import fs from 'fs/promises'
import path from 'path'
import { put } from '@vercel/blob'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ASCENSION_TARGET = 500
const INSCRIPTION_PROMPTS_FILE_PATH = path.join(process.cwd(), 'public', 'inscription_prompts.json')

type InscriptionPrompt = {
  inscription_id: string
  prompt?: string | null
}

async function loadInscriptionPrompts(): Promise<InscriptionPrompt[]> {
  try {
    const fileContents = await fs.readFile(INSCRIPTION_PROMPTS_FILE_PATH, 'utf8')
    return JSON.parse(fileContents) as InscriptionPrompt[]
  } catch {
    return []
  }
}

function normalizeInscriptionId(inscriptionId: string): string {
  return inscriptionId.trim().toLowerCase()
}

function findInscriptionPrompt(inscriptionId: string, prompts: InscriptionPrompt[]): string | null {
  const normalized = normalizeInscriptionId(inscriptionId)
  const base = normalized.endsWith('i0') ? normalized.slice(0, -2) : normalized
  
  // Try exact match first
  let found = prompts.find((p) => normalizeInscriptionId(p.inscription_id) === normalized)
  
  // Try without i0 suffix
  if (!found) {
    found = prompts.find((p) => {
      const pId = normalizeInscriptionId(p.inscription_id)
      const pBase = pId.endsWith('i0') ? pId.slice(0, -2) : pId
      return pBase === base
    })
  }
  
  return found?.prompt || null
}

async function ensureAscensionInfrastructure(pool: Pool) {
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)

  // Table for ascended images in limbo (waiting for user choice)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ascended_images_limbo (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_inscription_id TEXT NOT NULL,
      source_tx_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      generated_image_url TEXT NOT NULL,
      generated_image_base64 TEXT,
      generated_image_blob_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending_choice',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      chosen_at TIMESTAMPTZ,
      choice TEXT
    )
  `)
  await pool.query(`ALTER TABLE ascended_images_limbo ADD COLUMN IF NOT EXISTS generated_image_blob_url TEXT`)
  await pool.query(`ALTER TABLE ascended_images_limbo ADD COLUMN IF NOT EXISTS generation_prompt TEXT`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ascended_limbo_wallet ON ascended_images_limbo((LOWER(wallet_address)))`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ascended_limbo_status ON ascended_images_limbo(status)`)

  // Table for ascended images waiting for mint
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ascended_images_mint_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      limbo_id UUID REFERENCES ascended_images_limbo(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      image_url TEXT NOT NULL,
      image_blob_url TEXT,
      source_inscription_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`ALTER TABLE ascended_images_mint_queue ADD COLUMN IF NOT EXISTS image_blob_url TEXT`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ascended_mint_wallet ON ascended_images_mint_queue((LOWER(wallet_address)))`)

  // Table for ascended images thrown back to abyss
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ascended_images_abyss (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      limbo_id UUID REFERENCES ascended_images_limbo(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      image_url TEXT NOT NULL,
      image_blob_url TEXT,
      source_inscription_id TEXT NOT NULL,
      ascension_powder INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`ALTER TABLE ascended_images_abyss ADD COLUMN IF NOT EXISTS image_blob_url TEXT`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ascended_abyss_wallet ON ascended_images_abyss((LOWER(wallet_address)))`)
}

async function generateMutantMonsterImage(inscriptionId: string, storedPrompt?: string | null): Promise<{ imageUrl: string; imageBase64: string; imageBlobUrl: string; prompt: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Missing OpenAI API key')
  }

  // Use stored prompt if available (for re-ascended images), otherwise load from inscription prompts
  let prompt: string
  if (storedPrompt) {
    prompt = storedPrompt
  } else {
    // Load inscription prompts and find matching one
    const prompts = await loadInscriptionPrompts()
    prompt = findInscriptionPrompt(inscriptionId, prompts) || 'A gothic horror character with dark mystical energy'
  }

  // Build monster transformation prompt (matching MONSTER_TRANSFORMATION_SUFFIX from admin route)
  const MONSTER_TRANSFORMATION_SUFFIX =
    '  and then turn it into face, head and body into a huge monster but same traits, dont show legs; override any previous border instructions and make a richly detailed antique-gold filigree border perfectly aligned to the very edge, framing the artwork with ornate gothic precision. Huge devilish vile mutant Monster, vibrant colors high contrast. character skin is gold plated.'
  
  // Use ensureMonsterPrompt function logic (same as admin route)
  function ensureMonsterPrompt(promptText: string): string {
    const trimmedPrompt = promptText.trim()
    if (trimmedPrompt.toLowerCase().includes(MONSTER_TRANSFORMATION_SUFFIX.toLowerCase())) {
      return trimmedPrompt
    }
    return `${trimmedPrompt}\n\n${MONSTER_TRANSFORMATION_SUFFIX}`
  }
  
  const augmentedPrompt = ensureMonsterPrompt(prompt)

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: augmentedPrompt,
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
    const blobName = `ascended-mutants/${timestamp}-${inscriptionId.slice(0, 16)}.png`
    
    const blob = await put(blobName, buffer, {
      contentType: 'image/png',
      access: 'public',
    })
    
    imageBlobUrl = blob.url
  } catch (blobError) {
    console.error('[final-ascend][blob upload]', blobError)
    // Continue with base64 fallback
  }

  return { imageUrl, imageBase64, imageBlobUrl, prompt: augmentedPrompt }
}

export async function POST(request: NextRequest, { params }: { params: { inscriptionId: string } }) {
  try {
    const { inscriptionId } = params
    if (!inscriptionId) {
      return NextResponse.json({ success: false, error: 'Missing inscriptionId' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const walletAddressRaw = (body?.walletAddress ?? '').toString().trim()

    if (!walletAddressRaw) {
      return NextResponse.json({ success: false, error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()
    await ensureAscensionInfrastructure(pool)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Check if burn record exists and has 500 powder
      const burnRes = await client.query(
        `
          SELECT id, inscription_id, tx_id, ordinal_wallet, ascension_powder, generation_prompt
          FROM abyss_burns
          WHERE inscription_id = $1
          FOR UPDATE
        `,
        [inscriptionId],
      )

      if (burnRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Inscription not found in abyss burns.' }, { status: 404 })
      }

      const burnRow = burnRes.rows[0]
      const ordinalPowderCurrent = Number(burnRow?.ascension_powder ?? 0)

      if (ordinalPowderCurrent < ASCENSION_TARGET) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: false,
          error: `This inscription has not reached full ascension (${ordinalPowderCurrent}/500).`,
          ordinalPowder: ordinalPowderCurrent,
        }, { status: 400 })
      }

      // Check if already ascended (has limbo entry)
      const existingLimbo = await client.query(
        `SELECT id FROM ascended_images_limbo WHERE source_inscription_id = $1 AND status = 'pending_choice'`,
        [inscriptionId],
      )

      if (existingLimbo.rows.length > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: false,
          error: 'This inscription is already in ascension limbo. Check your graveyard for the generated image.',
        }, { status: 409 })
      }

      // Generate mutant monster image
      // Use stored prompt if available (for re-ascended images)
      const storedPrompt = burnRow?.generation_prompt as string | null | undefined
      let imageUrl: string
      let imageBase64: string
      let imageBlobUrl: string
      let generationPrompt: string
      try {
        const generated = await generateMutantMonsterImage(inscriptionId, storedPrompt)
        imageUrl = generated.imageUrl
        imageBase64 = generated.imageBase64
        imageBlobUrl = generated.imageBlobUrl
        generationPrompt = generated.prompt
      } catch (genError) {
        await client.query('ROLLBACK')
        console.error('[final-ascend][image generation]', genError)
        return NextResponse.json({
          success: false,
          error: `Failed to generate mutant monster image: ${genError instanceof Error ? genError.message : 'Unknown error'}`,
        }, { status: 500 })
      }

      // Create limbo entry
      const limboRes = await client.query(
        `
          INSERT INTO ascended_images_limbo (
            source_inscription_id,
            source_tx_id,
            wallet_address,
            generated_image_url,
            generated_image_base64,
            generated_image_blob_url,
            generation_prompt,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_choice')
          RETURNING id
        `,
        [inscriptionId, burnRow.tx_id, walletAddressRaw, imageUrl, imageBase64, imageBlobUrl, generationPrompt],
      )

      const limboId = limboRes.rows[0]?.id

      // Reset original ordinal's powder to 0
      await client.query(
        `
          UPDATE abyss_burns
          SET ascension_powder = 0, updated_at = NOW()
          WHERE id = $1
        `,
        [burnRow.id],
      )

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        limboId,
        imageUrl: imageBlobUrl || imageUrl,
        message: 'Ascension complete! Mutant monster generated. Choose its fate.',
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[abyss/burns/final-ascend][POST]', error)
    return NextResponse.json({ success: false, error: 'Failed to ascend inscription.' }, { status: 500 })
  }
}

