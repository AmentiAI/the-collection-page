import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { walletAddress, inscriptionId, status } = body

    if (!walletAddress || !inscriptionId || !status) {
      return NextResponse.json(
        { error: 'walletAddress, inscriptionId, and status are required' },
        { status: 400 }
      )
    }

    if (status !== 'ready' && status !== 'sanctuary') {
      return NextResponse.json(
        { error: 'status must be either "ready" or "sanctuary"' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Get trait from request body (should be passed from frontend)
    const { trait } = body
    const validTrait = trait === 'Angelic' || trait === 'Demonic' ? trait : null

    // Upsert battle status (set life_force to 100 if new record, store trait if provided)
    if (validTrait) {
      await client.query(
        `INSERT INTO battle_ordinals (wallet_address, inscription_id, status, life_force, trait)
         VALUES ($1, $2, $3, 100, $4)
         ON CONFLICT (wallet_address, inscription_id)
         DO UPDATE SET 
           status = $3, 
           trait = COALESCE(EXCLUDED.trait, battle_ordinals.trait),
           updated_at = NOW()`,
        [walletAddress, inscriptionId, status, validTrait]
      )
    } else {
      await client.query(
        `INSERT INTO battle_ordinals (wallet_address, inscription_id, status, life_force)
         VALUES ($1, $2, $3, 100)
         ON CONFLICT (wallet_address, inscription_id)
         DO UPDATE SET status = $3, updated_at = NOW()`,
        [walletAddress, inscriptionId, status]
      )
    }

    return NextResponse.json({
      success: true,
      message: `Status updated to ${status}`,
    })
  } catch (error) {
    console.error('Error updating battle status:', error)
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

