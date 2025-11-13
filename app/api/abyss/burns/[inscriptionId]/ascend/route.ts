import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ASCENSION_TARGET = 500

function buildInscriptionCandidates(inscriptionId: string) {
  const trimmed = inscriptionId.trim()
  if (!trimmed) {
    return []
  }
  const base = trimmed.endsWith('i0') ? trimmed.slice(0, -2) : trimmed
  const variants = new Set<string>([
    trimmed.toLowerCase(),
    base.toLowerCase(),
    `${base.toLowerCase()}i0`,
  ])
  return Array.from(variants)
}

export async function POST(request: NextRequest, { params }: { params: { inscriptionId: string } }) {
  try {
    const inscriptionParam = (params?.inscriptionId ?? '').toString().trim()
    const body = await request.json().catch(() => ({}))
    const walletAddressRaw = (body?.walletAddress ?? '').toString().trim()

    if (!inscriptionParam) {
      return NextResponse.json({ success: false, error: 'inscriptionId is required.' }, { status: 400 })
    }

    if (!walletAddressRaw) {
      return NextResponse.json({ success: false, error: 'walletAddress is required.' }, { status: 400 })
    }

    const pool = getPool()
    await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      await client.query(
        `
          INSERT INTO profiles (wallet_address, ascension_powder)
          VALUES ($1, 0)
          ON CONFLICT (wallet_address) DO NOTHING
        `,
        [walletAddressRaw],
      )

      const profileRes = await client.query(
        `
          SELECT ascension_powder
          FROM profiles
          WHERE LOWER(wallet_address) = LOWER($1)
          FOR UPDATE
        `,
        [walletAddressRaw],
      )

      const currentPowder = Number(profileRes.rows[0]?.ascension_powder ?? 0)

      if (!profileRes.rowCount) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Profile not found for wallet.' }, { status: 404 })
      }

      if (currentPowder <= 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'No ascension powder available to channel.' }, { status: 400 })
      }

      const inscriptionCandidates = buildInscriptionCandidates(inscriptionParam)
      if (inscriptionCandidates.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Invalid inscription identifier.' }, { status: 400 })
      }

      const burnRes = await client.query(
        `
          SELECT id, ascension_powder
          FROM abyss_burns
          WHERE LOWER(inscription_id) = ANY($1)
            AND LOWER(ordinal_wallet) = LOWER($2)
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1
          FOR UPDATE
        `,
        [inscriptionCandidates, walletAddressRaw],
      )

      if (burnRes.rowCount === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'No matching graveyard inscription found for this wallet.' }, { status: 404 })
      }

      const burnRow = burnRes.rows[0]
      const ordinalPowderCurrent = Number(burnRow?.ascension_powder ?? 0)

      if (ordinalPowderCurrent >= ASCENSION_TARGET) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: false,
          error: 'This inscription has already reached full ascension.',
          ordinalPowder: ordinalPowderCurrent,
          profilePowder: currentPowder,
        }, { status: 400 })
      }

      const ordinalPowderUpdated = ordinalPowderCurrent + currentPowder

      await client.query(
        `
          UPDATE profiles
          SET ascension_powder = 0
          WHERE LOWER(wallet_address) = LOWER($1)
        `,
        [walletAddressRaw],
      )

      const updateBurn = await client.query(
        `
          UPDATE abyss_burns
          SET ascension_powder = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING ascension_powder
        `,
        [ordinalPowderUpdated, burnRow.id],
      )

      const finalOrdinalPowder = Number(updateBurn.rows[0]?.ascension_powder ?? ordinalPowderUpdated)

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        spent: currentPowder,
        ordinalPowder: finalOrdinalPowder,
        profilePowder: 0,
        completed: finalOrdinalPowder >= ASCENSION_TARGET,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[abyss/burns/ascend][POST]', error)
    return NextResponse.json({ success: false, error: 'Failed to channel ascension powder.' }, { status: 500 })
  }
}
