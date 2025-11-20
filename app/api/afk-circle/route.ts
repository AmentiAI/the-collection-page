import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAX_AFK_PARTICIPANTS = 120
const AFK_CIRCLE_ID = '00000000-0000-0000-0000-000000000000' // Fixed UUID for the single AFK circle

async function ensureAfkCircleInfrastructure(pool: Pool) {
  // Skip if already initialized to avoid redundant DDL operations
  if (isTableInitialized('afk_circles')) {
    return
  }

  // Create the single AFK circle table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS afk_circles (
      id UUID PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'open',
      required_participants INTEGER NOT NULL DEFAULT ${MAX_AFK_PARTICIPANTS},
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  
  // Create the default AFK circle if it doesn't exist
  await pool.query(`
    INSERT INTO afk_circles (id, status, required_participants, created_at, updated_at)
    VALUES ($1, 'open', $2, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `, [AFK_CIRCLE_ID, MAX_AFK_PARTICIPANTS])
  
  // Create participants table that references the circle
  await pool.query(`
    CREATE TABLE IF NOT EXISTS afk_circle_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      circle_id UUID NOT NULL REFERENCES afk_circles(id) ON DELETE CASCADE,
      wallet TEXT NOT NULL,
      inscription_id TEXT NOT NULL,
      inscription_image TEXT,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      last_reward_at TIMESTAMPTZ,
      UNIQUE(circle_id, wallet, inscription_id)
    )
  `)
  
  // Check if circle_id column exists, if not add it (migration for existing tables)
  const columnCheck = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'afk_circle_participants' AND column_name = 'circle_id'
  `)
  
  if (columnCheck.rows.length === 0) {
    // Column doesn't exist, add it
    // First add as nullable, update existing rows, then make it NOT NULL
    await pool.query(`
      ALTER TABLE afk_circle_participants 
      ADD COLUMN circle_id UUID REFERENCES afk_circles(id) ON DELETE CASCADE
    `)
    
    // Update all existing rows to use the AFK circle ID
    await pool.query(`
      UPDATE afk_circle_participants 
      SET circle_id = $1 
      WHERE circle_id IS NULL
    `, [AFK_CIRCLE_ID])
    
    // Now make it NOT NULL
    await pool.query(`
      ALTER TABLE afk_circle_participants 
      ALTER COLUMN circle_id SET NOT NULL
    `)
    
    // Recreate unique constraint if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'afk_circle_participants_circle_id_wallet_inscription_id_key'
        ) THEN
          ALTER TABLE afk_circle_participants 
          ADD CONSTRAINT afk_circle_participants_circle_id_wallet_inscription_id_key 
          UNIQUE(circle_id, wallet, inscription_id);
        END IF;
      END $$;
    `)
  }
  
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_afk_circle_wallet ON afk_circle_participants((LOWER(wallet)))`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_afk_circle_inscription ON afk_circle_participants(inscription_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_afk_circle_circle_id ON afk_circle_participants(circle_id)`)

  // Mark as initialized to skip these slow DDL operations on subsequent requests
  markTableInitialized('afk_circles')
}

// GET: Fetch AFK circle status and user's participants
export async function GET(request: NextRequest) {
  try {
    const pool = getPool()
    await ensureAfkCircleInfrastructure(pool)

    const searchParams = request.nextUrl.searchParams
    const walletParam = searchParams.get('wallet')?.trim()

    // Get total count for the AFK circle
    const totalRes = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM afk_circle_participants
      WHERE circle_id = $1
    `, [AFK_CIRCLE_ID])
    const totalCount = Number(totalRes.rows[0]?.total ?? 0)

    // Get user's participants if wallet provided
    let userParticipants: any[] = []
    if (walletParam) {
      // Fetch linked wallets to include ordinals from all linked wallets
      let walletsToQuery = [walletParam]
      
      try {
        // Ensure linked_wallets table exists
        await pool.query(`
          CREATE TABLE IF NOT EXISTS linked_wallets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            primary_wallet TEXT NOT NULL,
            linked_wallet TEXT NOT NULL UNIQUE,
            signature TEXT NOT NULL,
            message TEXT NOT NULL,
            linked_at TIMESTAMPTZ DEFAULT NOW(),
            is_active BOOLEAN DEFAULT TRUE,
            UNIQUE(primary_wallet, linked_wallet)
          )
        `)
        
        // Check if this wallet is a primary wallet
        const primaryLinks = await pool.query(
          `SELECT linked_wallet FROM linked_wallets WHERE LOWER(primary_wallet) = LOWER($1) AND is_active = TRUE`,
          [walletParam]
        )
        
        // Check if this wallet is a linked wallet (get the primary)
        const linkedTo = await pool.query(
          `SELECT primary_wallet FROM linked_wallets WHERE LOWER(linked_wallet) = LOWER($1) AND is_active = TRUE LIMIT 1`,
          [walletParam]
        )
        
        if (linkedTo.rows.length > 0) {
          // This is a linked wallet, get the primary and all its links
          const primaryWallet = linkedTo.rows[0].primary_wallet
          walletsToQuery = [primaryWallet]
          
          const allLinks = await pool.query(
            `SELECT linked_wallet FROM linked_wallets WHERE LOWER(primary_wallet) = LOWER($1) AND is_active = TRUE`,
            [primaryWallet]
          )
          
          walletsToQuery.push(...allLinks.rows.map(r => r.linked_wallet))
        } else if (primaryLinks.rows.length > 0) {
          // This is a primary wallet, add all linked wallets
          walletsToQuery.push(...primaryLinks.rows.map(r => r.linked_wallet))
        }
        
        console.log(`🔗 [AFK Circle GET] Querying ${walletsToQuery.length} wallet(s) for ${walletParam}`)
      } catch (error) {
        console.error('Failed to fetch linked wallets for AFK circle:', error)
        // Continue with just the primary wallet if linked fetch fails
      }
      
      // Query for participants from all wallets (primary + linked)
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
          WHERE circle_id = $1 AND LOWER(wallet) = ANY($2::text[])
          ORDER BY joined_at DESC
        `,
        [AFK_CIRCLE_ID, walletsToQuery.map(w => w.toLowerCase())],
      )
      userParticipants = userRes.rows.map((row) => ({
        id: row.id,
        wallet: row.wallet,
        inscriptionId: row.inscription_id,
        inscriptionImage: row.inscription_image,
        joinedAt: row.joined_at,
        lastRewardAt: row.last_reward_at,
      }))
      
      console.log(`🔍 [AFK Circle GET] Found ${userParticipants.length} participants for wallet ${walletParam}`)
      
      // Also check if there are any participants with inscription IDs but different wallets
      const allInscriptionsRes = await pool.query(
        `SELECT wallet, inscription_id FROM afk_circle_participants WHERE circle_id = $1`,
        [AFK_CIRCLE_ID]
      )
      console.log(`🔍 [AFK Circle GET] Total ${allInscriptionsRes.rows.length} participants in AFK circle globally`)
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
      // Lock the AFK circle row to prevent race conditions
      await pool.query(
        `SELECT * FROM afk_circles WHERE id = $1 FOR UPDATE`,
        [AFK_CIRCLE_ID]
      )

      // Check if AFK circle is full (now protected by row lock)
      const countRes = await pool.query(`
        SELECT COUNT(*)::int AS total
        FROM afk_circle_participants
        WHERE circle_id = $1
      `, [AFK_CIRCLE_ID])
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
          WHERE circle_id = $1 AND inscription_id = $2
        `,
        [AFK_CIRCLE_ID, inscriptionId],
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

      // Add to AFK circle (the single default circle)
      await pool.query(
        `
          INSERT INTO afk_circle_participants (circle_id, wallet, inscription_id, inscription_image)
          VALUES ($1, $2, $3, $4)
        `,
        [AFK_CIRCLE_ID, wallet, inscriptionId, inscriptionImage],
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
        WHERE circle_id = $1 AND LOWER(wallet) = LOWER($2) AND inscription_id = $3
        RETURNING id
      `,
      [AFK_CIRCLE_ID, wallet, inscriptionId],
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

