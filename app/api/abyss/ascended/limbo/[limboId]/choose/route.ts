import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureAscensionInfrastructure(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ascended_images_limbo (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_inscription_id TEXT NOT NULL,
      source_tx_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      generated_image_url TEXT NOT NULL,
      generated_image_base64 TEXT,
      status TEXT NOT NULL DEFAULT 'pending_choice',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      chosen_at TIMESTAMPTZ,
      choice TEXT
    )
  `)

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_burns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inscription_id TEXT UNIQUE NOT NULL,
      tx_id TEXT UNIQUE NOT NULL,
      ordinal_wallet TEXT NOT NULL,
      payment_wallet TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'abyss',
      summon_id UUID,
      ascension_powder INTEGER NOT NULL DEFAULT 0,
      image_blob_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ
    )
  `)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS image_blob_url TEXT`)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { limboId: string } },
) {
  try {
    const { limboId } = params
    if (!limboId) {
      return NextResponse.json({ success: false, error: 'Missing limboId' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const choice = (body?.choice ?? '').toString().trim()
    const walletAddressRaw = (body?.walletAddress ?? '').toString().trim()

    if (!choice || (choice !== 'mint' && choice !== 'abyss')) {
      return NextResponse.json({ success: false, error: 'choice must be "mint" or "abyss"' }, { status: 400 })
    }

    if (!walletAddressRaw) {
      return NextResponse.json({ success: false, error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()
    await ensureAscensionInfrastructure(pool)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Get limbo entry
      const limboRes = await client.query(
        `
          SELECT id, source_inscription_id, source_tx_id, wallet_address, generated_image_url, generated_image_base64, generated_image_blob_url, generation_prompt, status
          FROM ascended_images_limbo
          WHERE id = $1
          FOR UPDATE
        `,
        [limboId],
      )

      if (limboRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Limbo entry not found.' }, { status: 404 })
      }

      const limbo = limboRes.rows[0]

      if (limbo.wallet_address.toLowerCase() !== walletAddressRaw.toLowerCase()) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 403 })
      }

      if (limbo.status !== 'pending_choice') {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'This limbo entry has already been processed.' }, { status: 409 })
      }

      // Use blob URL if available, otherwise fallback to base64 URL
      const imageUrlToUse = limbo.generated_image_blob_url || limbo.generated_image_url

      if (choice === 'mint') {
        // Add to mint queue
        await client.query(
          `
            INSERT INTO ascended_images_mint_queue (limbo_id, wallet_address, image_url, image_blob_url, source_inscription_id)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [limboId, walletAddressRaw, limbo.generated_image_url, limbo.generated_image_blob_url, limbo.source_inscription_id],
        )
      } else {
        // Add to abyss (as a new burn entry with 0 powder)
        await client.query(
          `
            INSERT INTO ascended_images_abyss (limbo_id, wallet_address, image_url, image_blob_url, source_inscription_id, ascension_powder)
            VALUES ($1, $2, $3, $4, $5, 0)
          `,
          [limboId, walletAddressRaw, limbo.generated_image_url, limbo.generated_image_blob_url, limbo.source_inscription_id],
        )

        // Also create an abyss_burns entry so it shows in graveyard
        // Store the generation_prompt so it can be used if this image is ascended again
        const fakeInscriptionId = `ascended_${limbo.source_inscription_id}_${Date.now()}`
        const fakeTxId = `ascended_tx_${limbo.source_tx_id}_${Date.now()}`
        await client.query(
          `
            INSERT INTO abyss_burns (inscription_id, tx_id, ordinal_wallet, payment_wallet, status, source, ascension_powder, image_blob_url, generation_prompt, created_at, updated_at, confirmed_at)
            VALUES ($1, $2, $3, $4, 'confirmed', 'ascension', 0, $5, $6, NOW(), NOW(), NOW())
            ON CONFLICT (inscription_id) DO NOTHING
          `,
          [
            fakeInscriptionId,
            fakeTxId,
            walletAddressRaw,
            walletAddressRaw,
            limbo.generated_image_blob_url || limbo.generated_image_url,
            limbo.generation_prompt || null,
          ],
        )
      }

      // Update limbo status
      await client.query(
        `
          UPDATE ascended_images_limbo
          SET status = 'chosen', choice = $1, chosen_at = NOW()
          WHERE id = $2
        `,
        [choice, limboId],
      )

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        choice,
        message: choice === 'mint' ? 'Image saved to mint queue.' : 'Image thrown into the abyss.',
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[abyss/ascended/limbo/choose][POST]', error)
    return NextResponse.json({ success: false, error: 'Failed to process choice.' }, { status: 500 })
  }
}

