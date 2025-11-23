import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureAscensionInfrastructure(pool: Pool) {
  // Skip if already initialized to avoid redundant DDL operations
  if (isTableInitialized('ascended_images')) {
    return
  }

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
      source_inscription_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Mark as initialized to skip these slow DDL operations on subsequent requests
  markTableInitialized('ascended_images')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')?.trim()

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'wallet parameter is required' }, { status: 400 })
    }

    const pool = getPool()
    await ensureAscensionInfrastructure(pool)

    // Get pending limbo images
    const limboRes = await pool.query(
      `
        SELECT id, generated_image_blob_url, generated_image_url, source_inscription_id
        FROM ascended_images_limbo
        WHERE LOWER(wallet_address) = LOWER($1) AND status = 'pending_choice'
        ORDER BY created_at DESC
      `,
      [wallet],
    )

    // Get mint queue images with generation prompts
    const mintRes = await pool.query(
      `
        SELECT m.id, m.image_blob_url, m.image_url, m.source_inscription_id, m.generation_prompt
        FROM ascended_images_mint_queue m
        WHERE LOWER(m.wallet_address) = LOWER($1)
        ORDER BY m.created_at DESC
      `,
      [wallet],
    )

    // Get available regeneration allowance
    const allowanceRes = await pool.query(
      `SELECT available FROM abyss_bonus_allowances WHERE LOWER(wallet) = LOWER($1)`,
      [wallet],
    )
    const regenerationAllowance = Number(allowanceRes.rows[0]?.available ?? 0)

    return NextResponse.json({
      success: true,
      limbo: limboRes.rows.map((row) => ({
        id: row.id,
        imageUrl: row.generated_image_blob_url || row.generated_image_url,
        sourceInscriptionId: row.source_inscription_id,
      })),
      mintQueue: mintRes.rows.map((row) => {
        const prompt = (row.generation_prompt || '').toLowerCase()
        return {
          id: row.id,
          imageUrl: row.image_blob_url || row.image_url,
          sourceInscriptionId: row.source_inscription_id,
          hasSilver: prompt.includes('silver plated'),
          hasGlow: prompt.includes('glowing with holy light'),
        }
      }),
      regenerationAllowance,
    })
  } catch (error) {
    console.error('[abyss/ascended/limbo][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to load limbo and mint queue.' }, { status: 500 })
  }
}

