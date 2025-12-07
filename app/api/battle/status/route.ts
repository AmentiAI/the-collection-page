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

    // Check if trying to set status to 'ready' and ordinal is in crystallization
    if (status === 'ready') {
      const crystallizationCheck = await client.query(
        `SELECT id FROM crystallization_records
         WHERE LOWER(wallet_address) = LOWER($1)
           AND inscription_id = $2
           AND status = 'active'`,
        [walletAddress, inscriptionId]
      )

      if (crystallizationCheck.rows.length > 0) {
        return NextResponse.json(
          { error: 'Cannot ready for battle while in crystallization. Please exit crystallization first.' },
          { status: 409 }
        )
      }
    }

    // Get trait from request body, or try to fetch from database
    let validTrait: 'Angelic' | 'Demonic' | null = null
    
    const { trait } = body
    if (trait === 'Angelic' || trait === 'Demonic') {
      validTrait = trait
    } else {
      // Try to get trait from database if not provided
      const dbTraitResult = await client.query(
        `SELECT trait FROM battle_ordinals
         WHERE LOWER(wallet_address) = LOWER($1)
           AND inscription_id = $2
         LIMIT 1`,
        [walletAddress, inscriptionId]
      )
      
      if (dbTraitResult.rows.length > 0 && dbTraitResult.rows[0].trait) {
        const dbTrait = dbTraitResult.rows[0].trait
        if (dbTrait === 'Angelic' || dbTrait === 'Demonic') {
          validTrait = dbTrait
        }
      }
    }

    if (!validTrait) {
      return NextResponse.json(
        { error: 'Sorry, trait not found. Please ensure the ordinal has an Angelic or Demonic trait.' },
        { status: 400 }
      )
    }

    // Save status with trait
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

