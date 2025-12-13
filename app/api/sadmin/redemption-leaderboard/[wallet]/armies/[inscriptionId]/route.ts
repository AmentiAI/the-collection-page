import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { wallet: string; inscriptionId: string } }
) {
  let client
  try {
    const walletAddress = decodeURIComponent(params.wallet)
    const inscriptionId = decodeURIComponent(params.inscriptionId)
    const body = await request.json().catch(() => ({}))
    
    const { lifeForce, lifeForceCap, status, trait } = body

    if (!walletAddress || !inscriptionId) {
      return NextResponse.json(
        { success: false, error: 'Wallet address and inscription ID are required' },
        { status: 400 }
      )
    }

    client = await getPool().connect()
    await client.query('BEGIN')

    // Build update query dynamically based on provided fields
    const updates: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (lifeForce !== undefined) {
      updates.push(`life_force = $${paramCount++}`)
      values.push(Number(lifeForce))
    }
    
    if (lifeForceCap !== undefined) {
      updates.push(`life_force_cap = $${paramCount++}`)
      values.push(Number(lifeForceCap))
    }
    
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`)
      values.push(status === '' ? null : status)
    }
    
    if (trait !== undefined) {
      updates.push(`trait = $${paramCount++}`)
      values.push(trait === '' ? null : trait)
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    updates.push(`updated_at = NOW()`)
    values.push(walletAddress, inscriptionId)

    const result = await client.query(
      `
        UPDATE battle_ordinals
        SET ${updates.join(', ')}
        WHERE LOWER(wallet_address) = LOWER($${paramCount++})
          AND inscription_id = $${paramCount}
        RETURNING id, inscription_id, life_force, life_force_cap, status, trait
      `,
      values
    )

    if (result.rowCount === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Army not found' },
        { status: 404 }
      )
    }

    await client.query('COMMIT')

    return NextResponse.json({
      success: true,
      army: {
        inscriptionId: result.rows[0].inscription_id,
        lifeForce: Number(result.rows[0].life_force),
        lifeForceCap: Number(result.rows[0].life_force_cap),
        status: result.rows[0].status,
        trait: result.rows[0].trait,
      },
    })
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {})
    }
    console.error('Error updating army:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

