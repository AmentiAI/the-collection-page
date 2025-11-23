import { NextRequest, NextResponse } from 'next/server'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'
import type { Pool } from 'pg'

export const dynamic = 'force-dynamic'

const ASCENSION_TARGET_FIRST = 500
const ASCENSION_TARGET_SECOND = 1000
const MAX_POWDER_PER_USE = 20

async function ensureTables(pool: Pool) {
  if (isTableInitialized('abyss_burns_ascend')) {
    return
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      wallet_address TEXT PRIMARY KEY,
      ascension_powder INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)

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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ
    )
  `)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)

  markTableInitialized('abyss_burns_ascend')
}

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
    const requestedAmount = Math.max(1, Math.min(MAX_POWDER_PER_USE, Number(body?.amount ?? MAX_POWDER_PER_USE) || MAX_POWDER_PER_USE))

    if (!inscriptionParam) {
      return NextResponse.json({ success: false, error: 'Missing inscriptionId' }, { status: 400 })
    }

    if (!walletAddressRaw) {
      return NextResponse.json({ success: false, error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()
    await ensureTables(pool)

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
        `,
        [walletAddressRaw],
      )
      const currentPowder = Number(profileRes.rows[0]?.ascension_powder ?? 0)

      if (currentPowder <= 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: false,
          error: 'No ascension powder available in your reserve.',
          ordinalPowder: 0,
          profilePowder: currentPowder,
        }, { status: 400 })
      }

      const candidates = buildInscriptionCandidates(inscriptionParam)
      if (candidates.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Invalid inscription ID format.' }, { status: 400 })
      }

      const burnRes = await client.query(
        `
          SELECT id, inscription_id, tx_id, ordinal_wallet, ascension_powder, source
          FROM abyss_burns
          WHERE LOWER(inscription_id) = ANY($1)
          FOR UPDATE
        `,
        [candidates],
      )

      if (burnRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Inscription not found in abyss burns.' }, { status: 404 })
      }

      const burnRow = burnRes.rows[0]
      const ordinalPowderCurrent = Number(burnRow?.ascension_powder ?? 0)
      const isSecondAscension = burnRow?.source === 'ascension'
      const ascensionTarget = isSecondAscension ? ASCENSION_TARGET_SECOND : ASCENSION_TARGET_FIRST

      if (ordinalPowderCurrent >= ascensionTarget) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: false,
          error: 'This inscription has already reached full ascension.',
          ordinalPowder: ordinalPowderCurrent,
          profilePowder: currentPowder,
          target: ascensionTarget,
        }, { status: 400 })
      }

      // Calculate how much powder is needed to reach the target (500 for first, 1000 for second)
      const powderNeeded = ascensionTarget - ordinalPowderCurrent
      
      // Use the minimum of: requested amount, available powder, and what's needed to reach the target
      const amountToUse = Math.min(requestedAmount, currentPowder, powderNeeded)

      if (amountToUse <= 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: false,
          error: 'Cannot use powder. Either none available or already at max.',
          ordinalPowder: ordinalPowderCurrent,
          profilePowder: currentPowder,
        }, { status: 400 })
      }

      const ordinalPowderUpdated = ordinalPowderCurrent + amountToUse
      const remainingProfilePowder = currentPowder - amountToUse

      await client.query(
        `
          UPDATE profiles
          SET ascension_powder = $1
          WHERE LOWER(wallet_address) = LOWER($2)
        `,
        [remainingProfilePowder, walletAddressRaw],
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
        spent: amountToUse,
        ordinalPowder: finalOrdinalPowder,
        profilePowder: remainingProfilePowder,
        completed: finalOrdinalPowder >= ascensionTarget,
        target: ascensionTarget,
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
