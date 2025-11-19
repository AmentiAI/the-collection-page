import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAX_AFK_PARTICIPANTS = 100

async function ensureAfkCircleInfrastructure(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS afk_circle_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet TEXT NOT NULL,
      inscription_id TEXT NOT NULL,
      inscription_image TEXT,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      last_reward_at TIMESTAMPTZ,
      UNIQUE(wallet, inscription_id)
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_afk_circle_wallet ON afk_circle_participants((LOWER(wallet)))`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_afk_circle_inscription ON afk_circle_participants(inscription_id)`)
}

// GET: Fetch AFK circle status and user's participants
export async function GET(request: NextRequest) {
  try {
    const pool = getPool()
    await ensureAfkCircleInfrastructure(pool)

    const searchParams = request.nextUrl.searchParams
    const walletParam = searchParams.get('wallet')?.trim()

    // Get total count
    const totalRes = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM afk_circle_participants
    `)
    const totalCount = Number(totalRes.rows[0]?.total ?? 0)

    // Get user's participants if wallet provided
    let userParticipants: any[] = []
    if (walletParam) {
      const userRes = await pool.query(
        `
          SELECT 
            id,
            wallet,
            inscription_id,
            inscription_image,
            joined_at,
            last_reward_at
          FROM afk_circle_participants
          WHERE LOWER(wallet) = LOWER($1)
          ORDER BY joined_at DESC
        `,
        [walletParam],
      )
      userParticipants = userRes.rows.map((row) => ({
        id: row.id,
        wallet: row.wallet,
        inscriptionId: row.inscription_id,
        inscriptionImage: row.inscription_image,
        joinedAt: row.joined_at,
        lastRewardAt: row.last_reward_at,
      }))
    }

    return NextResponse.json(
      {
        success: true,
        totalCount,
        maxParticipants: MAX_AFK_PARTICIPANTS,
        userParticipants,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      },
    )
  } catch (error) {
    console.error('[afk-circle][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch AFK circle status.' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      },
    )
  }
}

// POST: Join AFK circle with an ordinal
export async function POST(request: NextRequest) {
  try {
    const pool = getPool()
    await ensureAfkCircleInfrastructure(pool)

    const body = await request.json().catch(() => ({}))
    const wallet = (body?.wallet ?? '').toString().trim()
    const inscriptionId = (body?.inscriptionId ?? '').toString().trim()
    const inscriptionImage =
      typeof body?.inscriptionImage === 'string' && body.inscriptionImage.trim().length > 0
        ? body.inscriptionImage.trim()
        : null

    if (!wallet || !inscriptionId) {
      return NextResponse.json(
        { success: false, error: 'wallet and inscriptionId are required.' },
        { status: 400 },
      )
    }

    await pool.query('BEGIN')

    try {
      // Check if AFK circle is full
      const countRes = await pool.query(`
        SELECT COUNT(*)::int AS total
        FROM afk_circle_participants
      `)
      const currentCount = Number(countRes.rows[0]?.total ?? 0)
      
      if (currentCount >= MAX_AFK_PARTICIPANTS) {
        await pool.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: `AFK circle is full (${MAX_AFK_PARTICIPANTS} participants).` },
          { status: 409 },
        )
      }

      // Check if this inscription is already in the AFK circle
      const existingRes = await pool.query(
        `
          SELECT id FROM afk_circle_participants
          WHERE inscription_id = $1
        `,
        [inscriptionId],
      )

      if (existingRes.rows.length > 0) {
        await pool.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'This ordinal is already in the AFK circle.' },
          { status: 409 },
        )
      }

      // Check if this inscription is in any active circle (powder, damned_pool, dead_demons)
      const activeCircleRes = await pool.query(
        `
          SELECT 'powder' as type FROM summoning_powder_participants
          WHERE inscription_id = $1
            AND circle_id IN (
              SELECT id FROM summoning_powder_circles
              WHERE status IN ('open', 'filling', 'ready')
            )
          UNION ALL
          SELECT 'damned_pool' as type FROM damned_pool_participants
          WHERE inscription_id = $1
            AND circle_id IN (
              SELECT id FROM damned_pool_circles
              WHERE status IN ('open', 'filling', 'ready')
            )
          UNION ALL
          SELECT 'dead_demons' as type FROM dead_demons_participants
          WHERE inscription_id = $1
            AND circle_id IN (
              SELECT id FROM dead_demons_circles
              WHERE status IN ('open', 'filling', 'ready')
            )
          LIMIT 1
        `,
        [inscriptionId],
      )

      if (activeCircleRes.rows.length > 0) {
        await pool.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'This ordinal is already pledged to an active summoning circle.' },
          { status: 409 },
        )
      }

      // Add to AFK circle
      await pool.query(
        `
          INSERT INTO afk_circle_participants (wallet, inscription_id, inscription_image)
          VALUES ($1, $2, $3)
        `,
        [wallet, inscriptionId, inscriptionImage],
      )

      await pool.query('COMMIT')

      return NextResponse.json({
        success: true,
        message: 'Ordinal added to AFK circle.',
      })
    } catch (error) {
      await pool.query('ROLLBACK')
      throw error
    }
  } catch (error) {
    console.error('[afk-circle][POST]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to join AFK circle.' },
      { status: 500 },
    )
  }
}

// DELETE: Remove ordinal from AFK circle
export async function DELETE(request: NextRequest) {
  try {
    const pool = getPool()
    await ensureAfkCircleInfrastructure(pool)

    const searchParams = request.nextUrl.searchParams
    const wallet = searchParams.get('wallet')?.trim()
    const inscriptionId = searchParams.get('inscriptionId')?.trim()

    if (!wallet || !inscriptionId) {
      return NextResponse.json(
        { success: false, error: 'wallet and inscriptionId are required.' },
        { status: 400 },
      )
    }

    const result = await pool.query(
      `
        DELETE FROM afk_circle_participants
        WHERE LOWER(wallet) = LOWER($1) AND inscription_id = $2
        RETURNING id
      `,
      [wallet, inscriptionId],
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Ordinal not found in AFK circle.' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Ordinal removed from AFK circle.',
    })
  } catch (error) {
    console.error('[afk-circle][DELETE]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to leave AFK circle.' },
      { status: 500 },
    )
  }
}

