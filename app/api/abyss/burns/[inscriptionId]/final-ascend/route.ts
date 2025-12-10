import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'
import fs from 'fs/promises'
import path from 'path'
import { put } from '@vercel/blob'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const ASCENSION_TARGET_FIRST = 500
const ASCENSION_TARGET_SECOND = 1000
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

// Template parts for rebuilding prompts
const PROMPT_TEMPLATE_TOP = `FRONT-FACING POSE: Character facing DIRECTLY at viewer, 0° rotation, symmetrical composition.

HYPER-DETAILED professional digital illustration, 1024x1024 square format.

ART STYLE: professional vector like quality chibi-horror abomination; massive head, gigantic eyes  40-50% head size bold black outlines portrait composition head chest only spooky but adorable day of dead influence, extreme vibrant saturated colors magical.

COLLECTION: The Damned


ASSIGNED TRAITS:
`

const PROMPT_TEMPLATE_BOTTOM = `

TRAIT RENDERING: Each trait must be rendered EXACTLY as specified in the descriptions. NO artistic interpretation, NO variation.

CUSTOM RULES: BACKGROUND ELEMENTS: 5-10 dark, or spooky, or evil objects arranged symmetrically around character, varied sizes for depth, clear focal point on character's face.
must always start the head 200px below the top and have 150 pixel on left and right edge without head.
1 hand trait per image

DETAIL: Multiple layers, texture, highlights, shadows, material quality rendering.

LIGHTING: Multiple sources, dramatic setup, warm key light, cool fill light, rim lighting, atmospheric effects.

COLORS: Deep saturated colors, metallic accents, bright glows, rich colored shadows, smooth gradients, high contrast.

BORDER: spooky frame with detailed spider webs stretching across corners, small spiders with visible legs, and gothic arch details - Thin decorative frame (30-50px), intricate corner ornaments (10-20 elements each), material quality rendering, vibrant color accents. PLACEMENT: Outer edge EXACTLY at canvas edge (y=0, y=1024, x=0, x=1024), NO gaps, FULL BLEED. everything is behind the border. - PLACEMENT: Outer edge EXACTLY at canvas edge, NO gaps, FULL BLEED.

QUALITY: Professional gallery-quality, clean linework, rich color rendering, intricate details, cohesive composition.

FINAL: Professional quality, dramatic lighting, maximum color vibrancy, intricate detail, cinematic lighting effects, visually stunning. gothic horror character with dark mystical energy`

// Fetch traits from Magic Eden for a specific inscription
async function fetchTraitsFromMagicEden(inscriptionId: string): Promise<Array<{ trait_type: string; value: string }> | null> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    
    // Try to fetch the token directly by inscription ID
    const tokenUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens/${encodeURIComponent(inscriptionId)}`
    
    const response = await fetch(tokenUrl, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'TheDamned/1.0',
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    })

    if (!response.ok) {
      console.warn(`Magic Eden API returned ${response.status} for inscription ${inscriptionId}`)
      return null
    }

    const token = await response.json()
    
    // Extract attributes from various possible locations
    let attributes: Array<{ trait_type?: string; traitType?: string; value?: string }> = []
    
    if (token.meta?.attributes) {
      attributes = token.meta.attributes
    } else if (token.metadata?.attributes) {
      attributes = token.metadata.attributes
    } else if (token.attributes) {
      attributes = token.attributes
    } else if (token.meta?.traits) {
      attributes = token.meta.traits
    } else if (token.metadata?.traits) {
      attributes = token.metadata.traits
    }

    // Normalize attributes to { trait_type, value } format
    const normalizedAttributes = attributes
      .filter(attr => attr.trait_type || attr.traitType)
      .map(attr => ({
        trait_type: attr.trait_type || attr.traitType || '',
        value: attr.value || '',
      }))
      .filter(attr => attr.trait_type && attr.value && attr.trait_type !== 'Ascended') // Exclude Ascended trait

    return normalizedAttributes.length > 0 ? normalizedAttributes : null
  } catch (error) {
    console.error(`Error fetching traits from Magic Eden for ${inscriptionId}:`, error)
    return null
  }
}

// Format traits into the ASSIGNED TRAITS section
function formatTraitsForPrompt(attributes: Array<{ trait_type: string; value: string }>): string {
  // Map trait types to the format used in prompts
  const traitTypeMap: Record<string, string> = {
    'Head': 'Head',
    'Body Skin': 'Body Skin',
    'Eyes': 'Eyes',
    'Mouth': 'Mouth',
    'Hands': 'RIght Hand', // Note: typo in original template
    'Right Hand': 'RIght Hand',
    'Background': 'Background',
  }

  const traitLines = attributes
    .map(attr => {
      const traitType = traitTypeMap[attr.trait_type] || attr.trait_type
      return `${traitType}: ${attr.value}`
    })
    .join('\n')

  return traitLines
}

// Rebuild prompt from Magic Eden traits
async function rebuildPromptFromMagicEden(inscriptionId: string): Promise<string | null> {
  const attributes = await fetchTraitsFromMagicEden(inscriptionId)
  
  if (!attributes || attributes.length === 0) {
    return null
  }

  const traitsSection = formatTraitsForPrompt(attributes)
  const rebuiltPrompt = `${PROMPT_TEMPLATE_TOP}${traitsSection}${PROMPT_TEMPLATE_BOTTOM}`
  
  return rebuiltPrompt
}

async function ensureAscensionInfrastructure(pool: Pool) {
  // Skip if already initialized to avoid redundant DDL operations
  if (isTableInitialized('ascended_images')) {
    return
  }

  // DDL operations commented out for performance - tables must exist in production
  // await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)

  // // Table for ascended images in limbo (waiting for user choice)
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS ascended_images_limbo (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     source_inscription_id TEXT NOT NULL,
  //     source_tx_id TEXT NOT NULL,
  //     wallet_address TEXT NOT NULL,
  //     generated_image_url TEXT NOT NULL,
  //     generated_image_base64 TEXT,
  //     generated_image_blob_url TEXT,
  //     status TEXT NOT NULL DEFAULT 'pending_choice',
  //     created_at TIMESTAMPTZ DEFAULT NOW(),
  //     chosen_at TIMESTAMPTZ,
  //     choice TEXT
  //   )
  // `)
  // await pool.query(`ALTER TABLE ascended_images_limbo ADD COLUMN IF NOT EXISTS generated_image_blob_url TEXT`)
  // await pool.query(`ALTER TABLE ascended_images_limbo ADD COLUMN IF NOT EXISTS generation_prompt TEXT`)
  // await pool.query(`CREATE INDEX IF NOT EXISTS idx_ascended_limbo_wallet ON ascended_images_limbo((LOWER(wallet_address)))`)
  // await pool.query(`CREATE INDEX IF NOT EXISTS idx_ascended_limbo_status ON ascended_images_limbo(status)`)

  // // Table for ascended images waiting for mint
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS ascended_images_mint_queue (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     limbo_id UUID REFERENCES ascended_images_limbo(id) ON DELETE CASCADE,
  //     wallet_address TEXT NOT NULL,
  //     image_url TEXT NOT NULL,
  //     image_blob_url TEXT,
  //     source_inscription_id TEXT NOT NULL,
  //     generation_prompt TEXT,
  //     created_at TIMESTAMPTZ DEFAULT NOW()
  //   )
  // `)
  // await pool.query(`ALTER TABLE ascended_images_mint_queue ADD COLUMN IF NOT EXISTS image_blob_url TEXT`)
  // await pool.query(`ALTER TABLE ascended_images_mint_queue ADD COLUMN IF NOT EXISTS generation_prompt TEXT`)
  // await pool.query(`CREATE INDEX IF NOT EXISTS idx_ascended_mint_wallet ON ascended_images_mint_queue((LOWER(wallet_address)))`)

  // // Table for ascended images thrown back to abyss
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS ascended_images_abyss (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     limbo_id UUID REFERENCES ascended_images_limbo(id) ON DELETE CASCADE,
  //     wallet_address TEXT NOT NULL,
  //     image_url TEXT NOT NULL,
  //     image_blob_url TEXT,
  //     source_inscription_id TEXT NOT NULL,
  //     ascension_powder INTEGER NOT NULL DEFAULT 0,
  //     created_at TIMESTAMPTZ DEFAULT NOW()
  //   )
  // `)
  // await pool.query(`ALTER TABLE ascended_images_abyss ADD COLUMN IF NOT EXISTS image_blob_url TEXT`)
  // await pool.query(`CREATE INDEX IF NOT EXISTS idx_ascended_abyss_wallet ON ascended_images_abyss((LOWER(wallet_address)))`)

  // Mark as initialized to skip these slow DDL operations on subsequent requests
  markTableInitialized('ascended_images')
}

async function generateMutantMonsterImage(inscriptionId: string, storedPrompt?: string | null, isSecondAscension: boolean = false): Promise<{ imageUrl: string; imageBase64: string; imageBlobUrl: string; prompt: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Missing OpenAI API key')
  }

  // Use stored prompt if available (for re-ascended images), otherwise load from inscription prompts
  let prompt: string
  if (storedPrompt && storedPrompt.trim()) {
    prompt = storedPrompt
  } else {
    // Load inscription prompts and find matching one
    const prompts = await loadInscriptionPrompts()
    
    // If inscriptionId starts with "ascended_", extract the original inscription ID
    let lookupId = inscriptionId
    if (inscriptionId.toLowerCase().startsWith('ascended_')) {
      // Pattern: ascended_<original_id>_<timestamp>
      // Extract original_id by removing "ascended_" prefix and timestamp suffix
      const lastUnderscoreIndex = inscriptionId.lastIndexOf('_')
      if (lastUnderscoreIndex > 8) { // 'ascended_' is 8 chars
        lookupId = inscriptionId.slice(8, lastUnderscoreIndex) // Remove 'ascended_' prefix and timestamp
      }
    }
    
    let foundPrompt = findInscriptionPrompt(lookupId, prompts)
    
    // If prompt not found in JSON, try to rebuild from Magic Eden traits
    if (!foundPrompt) {
      console.log(`Prompt not found for ${lookupId}, attempting to rebuild from Magic Eden traits...`)
      foundPrompt = await rebuildPromptFromMagicEden(lookupId)
    }
    
    // Fallback to default if still not found
    prompt = foundPrompt || 'A gothic horror character with dark mystical energy'
    
    // Modify prompt: replace "Chibi" and "chibi" with "chibi-horror abomination"
    prompt = prompt.replace(/\bChibi\b/g, 'chibi-horror abomination')
    prompt = prompt.replace(/\bchibi\b/g, 'chibi-horror abomination')
    
    // Add gothic horror character with dark mystical energy to the prompt (only if not already present)
    if (!prompt.toLowerCase().includes('gothic horror character with dark mystical energy')) {
      prompt = `${prompt} gothic horror character with dark mystical energy`
    }
  }

  // Build transformation prompts (matching from admin route)
  const MONSTER_TRANSFORMATION_SUFFIX =
    '  and then turn it into face, head and body into a huge monster but same traits, dont show legs; override any previous border instructions and make a richly detailed antique-gold filigree border perfectly aligned to the very edge, framing the artwork with ornate gothic precision. Huge devilish vile mutant Monster, vibrant colors high contrast. character skin is gold plated.'
  
  const MONSTER_TRANSFORMATION_SUFFIX_SILVER =
    '  and then turn it into face, head and body into a huge monster but same traits, dont show legs; override any previous border instructions and make a richly detailed antique-gold filigree border perfectly aligned to the very edge, framing the artwork with ornate gothic precision. Huge devilish vile mutant Monster, vibrant colors high contrast. character skin is silver plated.'
  
  // Angelic transformation variants: 90% standard, 10% with holy light
  const ANGELIC_TRANSFORMATION_SUFFIX_STANDARD =
    'and then transform the figure into an angelic cute face monster, with luminous wings, restore all traits and trait colors, head item and background, except keep plated skin, has angelic hair; but making them more beautiful angelic monster; eliminate legs from view; keep head trait but halo added; border starts at first pixel; no glow; high quality; stay inside the frame;'
  
  const ANGELIC_TRANSFORMATION_SUFFIX_HOLY_LIGHT =
    'and then transform the figure into an angelic cute face monster, with luminous wings, restore all traits and trait colors, head item and background, except keep plated skin, has angelic hair; but making them more beautiful angelic monster; eliminate legs from view; glowing with holy light with lines; keep head trait but halo added; border starts at first pixel; high quality; stay inside the frame;'
  
  // Choose transformation suffix based on ascension level
  // For second ascension, 90% standard, 10% holy light variant
  let transformationSuffix: string
  const random = Math.random()
  if (isSecondAscension) {
    transformationSuffix = random < 0.1 ? ANGELIC_TRANSFORMATION_SUFFIX_HOLY_LIGHT : ANGELIC_TRANSFORMATION_SUFFIX_STANDARD
  } else {
    transformationSuffix = random < 0.1 ? MONSTER_TRANSFORMATION_SUFFIX_SILVER : MONSTER_TRANSFORMATION_SUFFIX
  }
  
  // Use ensureTransformationPrompt function logic
  function ensureTransformationPrompt(promptText: string, suffix: string, isSecondAscension: boolean): string {
    const trimmedPrompt = promptText.trim()
    const lowerPrompt = trimmedPrompt.toLowerCase()
    const lowerSuffix = suffix.toLowerCase()
    
    // For second ascension, we want to keep MONSTER and add ANGELIC
    // For first ascension, we want to replace any existing transformation with MONSTER
    if (isSecondAscension) {
      // Second ascension: Check if ANGELIC is already present
      return `${trimmedPrompt}\n\n${suffix}` // Add ANGELIC to existing prompt (which should have MONSTER)
    } else {
      // First ascension: Just add the MONSTER suffix
      // (No cleanup needed - there would never be an existing monster transformation on first ascension)
      return `${trimmedPrompt}\n\n${suffix}`
    }
  }
  
  const augmentedPrompt = ensureTransformationPrompt(prompt, transformationSuffix, isSecondAscension)

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

    // Pre-check without locking (before image generation to avoid blocking)
    const preCheckRes = await pool.query(
      `
        SELECT id, inscription_id, tx_id, ordinal_wallet, ascension_powder, generation_prompt, source
        FROM abyss_burns
        WHERE inscription_id = $1
      `,
      [inscriptionId],
    )

    if (preCheckRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Inscription not found in abyss burns.' }, { status: 404 })
    }

    const burnRow = preCheckRes.rows[0]
    const isSecondAscension = burnRow?.source === 'ascension'
    const ascensionTarget = isSecondAscension ? ASCENSION_TARGET_SECOND : ASCENSION_TARGET_FIRST
    const ordinalPowderCurrent = Number(burnRow?.ascension_powder ?? 0)

    if (ordinalPowderCurrent < ascensionTarget) {
      return NextResponse.json({
        success: false,
        error: `This inscription has not reached full ascension (${ordinalPowderCurrent}/${ascensionTarget}).`,
        ordinalPowder: ordinalPowderCurrent,
        target: ascensionTarget,
      }, { status: 400 })
    }

    // Check if already ascended (has limbo entry)
    const existingLimbo = await pool.query(
      `SELECT id FROM ascended_images_limbo WHERE source_inscription_id = $1 AND status = 'pending_choice'`,
      [inscriptionId],
    )

    if (existingLimbo.rows.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'This inscription is already in ascension limbo. Check your graveyard for the generated image.',
      }, { status: 409 })
    }

    // Generate mutant monster image OUTSIDE of transaction to avoid blocking the table
    // Use stored prompt if available (for re-ascended images)
    // isSecondAscension is already determined above
    let storedPrompt = burnRow?.generation_prompt as string | null | undefined
    
    // For second ascension, if prompt is missing from abyss_burns, look it up from the original limbo entry
    if (isSecondAscension && !storedPrompt && inscriptionId.startsWith('ascended_')) {
      // Extract the original source_inscription_id from the pattern: ascended_<original_id>_<timestamp>
      const lastUnderscoreIndex = inscriptionId.lastIndexOf('_')
      if (lastUnderscoreIndex > 8) { // 'ascended_' is 8 chars
        const originalSourceId = inscriptionId.slice(8, lastUnderscoreIndex) // Remove 'ascended_' prefix and timestamp
        
        // Look up the limbo entry that created this abyss_burns entry
        // The limbo entry's source_inscription_id should match the original inscription
        // Match by both source_inscription_id and wallet to ensure we get the right one
        const limboRes = await pool.query(
          `
            SELECT generation_prompt
            FROM ascended_images_limbo
            WHERE source_inscription_id = $1
              AND LOWER(wallet_address) = LOWER($2)
              AND status != 'pending_choice'
              AND generation_prompt IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [originalSourceId, walletAddressRaw],
        )
        
        if (limboRes.rows.length > 0) {
          storedPrompt = limboRes.rows[0].generation_prompt as string | null
        }
      }
    }
    
    let imageUrl: string
    let imageBase64: string
    let imageBlobUrl: string
    let generationPrompt: string
    try {
      const generated = await generateMutantMonsterImage(inscriptionId, storedPrompt, isSecondAscension)
      imageUrl = generated.imageUrl
      imageBase64 = generated.imageBase64
      imageBlobUrl = generated.imageBlobUrl
      generationPrompt = generated.prompt
    } catch (genError) {
      console.error('[final-ascend][image generation]', genError)
      return NextResponse.json({
        success: false,
        error: `Failed to generate mutant monster image: ${genError instanceof Error ? genError.message : 'Unknown error'}`,
      }, { status: 500 })
    }

    // Now start transaction for database updates (after image generation is complete)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Re-check and lock the row to ensure it still has 500 powder (prevent race conditions)
      const burnRes = await client.query(
        `
          SELECT id, inscription_id, tx_id, ordinal_wallet, ascension_powder, generation_prompt, source
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

      const lockedBurnRow = burnRes.rows[0]
      const lockedIsSecondAscension = lockedBurnRow?.source === 'ascension'
      const lockedAscensionTarget = lockedIsSecondAscension ? ASCENSION_TARGET_SECOND : ASCENSION_TARGET_FIRST
      const lockedPowderCurrent = Number(lockedBurnRow?.ascension_powder ?? 0)

      if (lockedPowderCurrent < lockedAscensionTarget) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: false,
          error: `This inscription no longer has full ascension (${lockedPowderCurrent}/${lockedAscensionTarget}).`,
          ordinalPowder: lockedPowderCurrent,
          target: lockedAscensionTarget,
        }, { status: 400 })
      }

      // Double-check limbo status
      const doubleCheckLimbo = await client.query(
        `SELECT id FROM ascended_images_limbo WHERE source_inscription_id = $1 AND status = 'pending_choice'`,
        [inscriptionId],
      )

      if (doubleCheckLimbo.rows.length > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: false,
          error: 'This inscription is already in ascension limbo. Check your graveyard for the generated image.',
        }, { status: 409 })
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
        [inscriptionId, lockedBurnRow.tx_id, walletAddressRaw, imageUrl, imageBase64, imageBlobUrl, generationPrompt],
      )

      const limboId = limboRes.rows[0]?.id

      // Hide the current entry (it's being ascended)
      // For second ascension, keep the original prompt in abyss_burns (don't overwrite it)
      // The new prompt (with angelic transformation) is stored in the limbo entry
      if (lockedIsSecondAscension) {
        // Keep the original generation_prompt (from first ascension) in abyss_burns
        await client.query(
          `
            UPDATE abyss_burns
            SET hidden = TRUE, ascension_powder = 0, updated_at = NOW()
            WHERE id = $1
          `,
          [lockedBurnRow.id],
        )
      } else {
        // First ascension: store the generation prompt in abyss_burns
        await client.query(
          `
            UPDATE abyss_burns
            SET hidden = TRUE, ascension_powder = 0, generation_prompt = $1, updated_at = NOW()
            WHERE id = $2
          `,
          [generationPrompt, lockedBurnRow.id],
        )
      }

      // If this is an ascended image (source = 'ascension'), also hide previous ascended entries
      // The inscription_id pattern is: ascended_<original_inscription_id>_<timestamp>
      if (lockedBurnRow.source === 'ascension' && lockedBurnRow.inscription_id.startsWith('ascended_')) {
        // Extract the original source_inscription_id by removing 'ascended_' prefix and timestamp suffix
        // Pattern: ascended_<original_inscription_id>_<timestamp>
        // We'll find the last underscore and assume everything after it is the timestamp
        const lastUnderscoreIndex = lockedBurnRow.inscription_id.lastIndexOf('_')
        if (lastUnderscoreIndex > 8) { // 'ascended_' is 8 chars, so we need at least one more char
          const originalSourceId = lockedBurnRow.inscription_id.slice(8, lastUnderscoreIndex) // Remove 'ascended_' prefix
          
          // Find and hide all previous ascended entries with the same original source_inscription_id
          // This will hide the entire chain of ascended images
          await client.query(
            `
              UPDATE abyss_burns
              SET hidden = TRUE, updated_at = NOW()
              WHERE LOWER(ordinal_wallet) = LOWER($1)
                AND source = 'ascension'
                AND inscription_id LIKE $2
                AND id != $3
                AND hidden = FALSE
            `,
            [lockedBurnRow.ordinal_wallet, `ascended_${originalSourceId}_%`, lockedBurnRow.id],
          )
        }
      }

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

