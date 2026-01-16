import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { invalidateCache } from '@/lib/db-cache'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { walletAddress, inscriptionId } = body

    if (!walletAddress || !inscriptionId) {
      return NextResponse.json(
        { error: 'walletAddress and inscriptionId are required' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Check if ordinal exists and belongs to wallet
    const ordinalCheck = await client.query(
      `SELECT id, life_force, status, is_dead
       FROM battle_ordinals
       WHERE LOWER(wallet_address) = LOWER($1)
         AND inscription_id = $2`,
      [walletAddress, inscriptionId]
    )

    if (ordinalCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Ordinal not found or does not belong to this wallet' },
        { status: 404 }
      )
    }

    const ordinal = ordinalCheck.rows[0]

    // Validate ordinal can be crystallized
    if (ordinal.is_dead || ordinal.life_force === 0) {
      return NextResponse.json(
        { error: 'Cannot crystallize dead ordinals. Please resurrect them first.' },
        { status: 400 }
      )
    }

    if (ordinal.status === 'ready') {
      return NextResponse.json(
        { error: 'Cannot crystallize ordinals that are in battle. Remove them from battle first.' },
        { status: 400 }
      )
    }

    // Check if already in active crystallization
    const existingCheck = await client.query(
      `SELECT id FROM crystallization_records
       WHERE LOWER(wallet_address) = LOWER($1)
         AND inscription_id = $2
         AND status = 'active'`,
      [walletAddress, inscriptionId]
    )

    if (existingCheck.rows.length > 0) {
      return NextResponse.json(
        { error: 'This ordinal is already in crystallization' },
        { status: 409 }
      )
    }

    // Insert crystallization record
    const result = await client.query(
      `INSERT INTO crystallization_records (wallet_address, inscription_id, entered_at, status)
       VALUES ($1, $2, NOW(), 'active')
       RETURNING id, entered_at, status`,
      [walletAddress, inscriptionId]
    )

    // Invalidate cache when crystallization status changes
    invalidateCache(`crystallization-status:${walletAddress.toLowerCase()}`)

    return NextResponse.json({
      success: true,
      message: 'Ordinal entered crystallization',
      record: {
        id: result.rows[0].id,
        enteredAt: result.rows[0].entered_at,
        status: result.rows[0].status,
      },
    })
  } catch (error) {
    console.error('Error entering crystallization:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

