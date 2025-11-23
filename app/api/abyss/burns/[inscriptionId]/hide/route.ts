import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureAbyssBurnsTable(pool: Pool) {
  if (isTableInitialized('hide_abyss_burns')) {
    return
  }
  
  // DDL operations commented out for performance - tables must exist in production
  // await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE`)
  
  markTableInitialized('hide_abyss_burns')
}

export async function POST(
  request: NextRequest,
  { params }: { params: { inscriptionId: string } },
) {
  try {
    const { inscriptionId } = params
    if (!inscriptionId) {
      return NextResponse.json({ success: false, error: 'Missing inscriptionId' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const walletAddress = (body?.walletAddress ?? '').toString().trim()

    if (!walletAddress) {
      return NextResponse.json({ success: false, error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()
    await ensureAbyssBurnsTable(pool)

    // Verify the entry belongs to the wallet and mark it as hidden
    const result = await pool.query(
      `
        UPDATE abyss_burns
        SET hidden = TRUE, updated_at = NOW()
        WHERE inscription_id = $1
          AND LOWER(ordinal_wallet) = LOWER($2)
          AND hidden = FALSE
        RETURNING id, inscription_id
      `,
      [inscriptionId, walletAddress],
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Entry not found or already hidden, or does not belong to this wallet.' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Entry marked as burned (hidden).',
    })
  } catch (error) {
    console.error('[abyss/burns/hide][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to hide entry.' },
      { status: 500 },
    )
  }
}

