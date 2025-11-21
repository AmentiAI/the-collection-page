import { NextRequest, NextResponse } from 'next/server'
import type { Pool, PoolClient } from 'pg'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const GRAVE_ROB_COST = 200
const GRAVE_ROB_CHANCE = 0.1 // 10%
const STALE_THRESHOLD_DAYS = 7 // 1 week

async function ensureAbyssBurnsTable(pool: Pool | PoolClient) {
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
      last_checked_at TIMESTAMPTZ,
      hidden BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE`)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`)
}

async function ensureProfilesTable(pool: Pool | PoolClient) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      wallet_address TEXT PRIMARY KEY,
      ascension_powder INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)
}

// GET: Count eligible records for grave robbing
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')?.trim()
    const isDebugMode = searchParams.get('debug') === 'true'

    if (!walletAddress) {
      return NextResponse.json({ success: false, error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()
    await ensureAbyssBurnsTable(pool)

    // Count eligible records:
    // - inscription_id does NOT start with "ascended_"
    // - updated_at is more than 7 days ago (or NULL)
    // - hidden = FALSE
    const staleThreshold = new Date()
    staleThreshold.setDate(staleThreshold.getDate() - STALE_THRESHOLD_DAYS)

    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM abyss_burns
      WHERE inscription_id NOT LIKE 'ascended_%'
        AND hidden = FALSE
        AND (updated_at IS NULL OR updated_at < $1)
      `,
      [staleThreshold.toISOString()],
    )

    const eligibleCount = countResult.rows[0]?.count ?? 0

    const response: any = {
      success: true,
      eligibleCount,
      cost: GRAVE_ROB_COST,
      chance: GRAVE_ROB_CHANCE,
    }

    // In debug mode, return a sample eligible record
    if (isDebugMode && eligibleCount > 0) {
      const sampleResult = await pool.query(
        `
        SELECT 
          id,
          inscription_id,
          ordinal_wallet,
          created_at,
          updated_at,
          ascension_powder,
          image_blob_url
        FROM abyss_burns
        WHERE inscription_id NOT LIKE 'ascended_%'
          AND hidden = FALSE
          AND (updated_at IS NULL OR updated_at < $1)
        ORDER BY RANDOM()
        LIMIT 1
        `,
        [staleThreshold.toISOString()],
      )

      if (sampleResult.rows.length > 0) {
        response.sampleRecord = sampleResult.rows[0]
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[grave-rob][GET] error:', error)
    return NextResponse.json({ success: false, error: 'Failed to count eligible records' }, { status: 500 })
  }
}

// POST: Attempt grave robbing
export async function POST(request: NextRequest) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    await ensureAbyssBurnsTable(client)
    await ensureProfilesTable(client)

    const body = await request.json().catch(() => ({}))
    const walletAddress = (body?.walletAddress ?? '').toString().trim()
    const isDebugMode = body?.debug === true

    if (!walletAddress) {
      await client.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'walletAddress is required' }, { status: 400 })
    }

    // Check user has enough powder
    const profileRes = await client.query(
      `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1) LIMIT 1`,
      [walletAddress],
    )

    const currentPowder = Number(profileRes.rows[0]?.ascension_powder ?? 0)

    if (currentPowder < GRAVE_ROB_COST) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: `Insufficient powder. Required: ${GRAVE_ROB_COST}, Available: ${currentPowder}` },
        { status: 400 },
      )
    }

    // Count eligible records
    const staleThreshold = new Date()
    staleThreshold.setDate(staleThreshold.getDate() - STALE_THRESHOLD_DAYS)

    const countResult = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM abyss_burns
      WHERE inscription_id NOT LIKE 'ascended_%'
        AND hidden = FALSE
        AND (updated_at IS NULL OR updated_at < $1)
      `,
      [staleThreshold.toISOString()],
    )

    const eligibleCount = countResult.rows[0]?.count ?? 0

    if (eligibleCount === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'No eligible records to rob' }, { status: 400 })
    }

    // Deduct powder (always, even if roll fails) - SKIP IN DEBUG MODE
    if (!isDebugMode) {
      await client.query(
        `UPDATE profiles SET ascension_powder = GREATEST(0, ascension_powder - $1), updated_at = NOW() WHERE LOWER(wallet_address) = LOWER($2)`,
        [GRAVE_ROB_COST, walletAddress],
      )
    }

    // Roll for success (10% chance) - ALWAYS SUCCESS IN DEBUG MODE
    const roll = Math.random()
    const success = isDebugMode || roll < GRAVE_ROB_CHANCE

    if (!success) {
      await client.query('COMMIT')
      return NextResponse.json({
        success: true,
        robbed: false,
        message: 'Grave robbing attempt failed. Better luck next time!',
        remainingPowder: currentPowder - GRAVE_ROB_COST,
      })
    }

    // Success! Select a random eligible record
    const selectResult = await client.query(
      `
      SELECT id, inscription_id, ordinal_wallet
      FROM abyss_burns
      WHERE inscription_id NOT LIKE 'ascended_%'
        AND hidden = FALSE
        AND (updated_at IS NULL OR updated_at < $1)
      ORDER BY RANDOM()
      LIMIT 1
      FOR UPDATE
      `,
      [staleThreshold.toISOString()],
    )

    if (selectResult.rowCount === 0) {
      // Race condition - someone else got it
      await client.query('COMMIT')
      return NextResponse.json({
        success: true,
        robbed: false,
        message: 'Grave robbing attempt failed. The grave was already empty!',
        remainingPowder: currentPowder - GRAVE_ROB_COST,
      })
    }

    const targetRecord = selectResult.rows[0]
    const oldWallet = targetRecord.ordinal_wallet

    // Transfer ownership - SKIP IN DEBUG MODE
    if (!isDebugMode) {
      await client.query(
        `UPDATE abyss_burns SET ordinal_wallet = $1, updated_at = NOW() WHERE id = $2`,
        [walletAddress, targetRecord.id],
      )
    }

    await client.query('COMMIT')

    const response: any = {
      success: true,
      robbed: true,
      inscriptionId: targetRecord.inscription_id,
      previousOwner: oldWallet,
      message: isDebugMode 
        ? `[DEBUG MODE] Would rob grave: ${targetRecord.inscription_id}` 
        : `Successfully robbed grave! You now own inscription ${targetRecord.inscription_id}`,
      remainingPowder: isDebugMode ? currentPowder : (currentPowder - GRAVE_ROB_COST),
    }

    // Add debug info if in debug mode
    if (isDebugMode) {
      response.debugInfo = {
        inscription_id: targetRecord.inscription_id,
        record_id: targetRecord.id,
        old_owner: oldWallet,
        new_owner: walletAddress,
        powder_spent: GRAVE_ROB_COST,
        would_update_fields: {
          ordinal_wallet: `${oldWallet} → ${walletAddress}`,
          updated_at: 'NOW()',
        },
        powder_before: currentPowder,
        powder_after_would_be: currentPowder - GRAVE_ROB_COST,
        note: 'NO DATABASE CHANGES WERE MADE (Debug Mode)',
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[grave-rob][POST] error:', error)
    return NextResponse.json({ success: false, error: 'Failed to attempt grave robbing' }, { status: 500 })
  } finally {
    client.release()
  }
}

