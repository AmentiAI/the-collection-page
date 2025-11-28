import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const pool = getPool()

    // Get all remaining burns (hidden = false) with ascension_powder and image
    const result = await pool.query(
      `
        SELECT 
          ab.id,
          ab.inscription_id,
          ab.tx_id,
          ab.ordinal_wallet,
          ab.payment_wallet,
          ab.status,
          ab.source,
          ab.summon_id,
          ab.created_at,
          ab.updated_at,
          ab.confirmed_at,
          ab.last_checked_at,
          ab.ascension_powder,
          ab.image_blob_url,
          p.ascension_powder as profile_ascension_powder
        FROM abyss_burns ab
        LEFT JOIN profiles p ON LOWER(p.wallet_address) = LOWER(ab.ordinal_wallet)
        WHERE ab.hidden = FALSE
        ORDER BY ab.created_at DESC
      `
    )

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM abyss_burns WHERE hidden = FALSE`
    )
    const total = Number(countResult.rows[0]?.total ?? 0)

    return NextResponse.json({
      success: true,
      total,
      records: result.rows.map((row) => ({
        id: row.id,
        inscriptionId: row.inscription_id,
        txId: row.tx_id,
        ordinalWallet: row.ordinal_wallet,
        paymentWallet: row.payment_wallet,
        status: row.status,
        source: row.source,
        summonId: row.summon_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        confirmedAt: row.confirmed_at,
        lastCheckedAt: row.last_checked_at,
        ascensionPowder: Number(row.ascension_powder ?? 0),
        profileAscensionPowder: Number(row.profile_ascension_powder ?? 0),
        imageBlobUrl: row.image_blob_url ?? null,
      })),
    })
  } catch (error) {
    console.error('[abyss/burns/admin/remaining][GET] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch remaining burns'
      },
      { status: 500 }
    )
  }
}

