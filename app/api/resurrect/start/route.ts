import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

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

    // Check if army is dead
    const checkResult = await client.query(
      `SELECT is_dead, resurrection_time
       FROM battle_ordinals
       WHERE LOWER(wallet_address) = LOWER($1)
         AND inscription_id = $2
         AND is_dead = true`,
      [walletAddress, inscriptionId]
    )

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Army not found or not dead' },
        { status: 404 }
      )
    }

    // Check if resurrection already started
    if (checkResult.rows[0].resurrection_time) {
      return NextResponse.json(
        { error: 'Resurrection already in progress' },
        { status: 400 }
      )
    }

    // Start resurrection (1 hour from now)
    const resurrectionTime = new Date()
    resurrectionTime.setHours(resurrectionTime.getHours() + 1)

    await client.query(
      `UPDATE battle_ordinals
       SET 
         resurrection_time = $1,
         updated_at = NOW()
       WHERE LOWER(wallet_address) = LOWER($2)
         AND inscription_id = $3`,
      [resurrectionTime, walletAddress, inscriptionId]
    )

    return NextResponse.json({
      success: true,
      resurrectionTime: resurrectionTime.toISOString(),
      message: 'Resurrection started. Your army will be ready in 1 hour.',
    })
  } catch (error) {
    console.error('Error starting resurrection:', error)
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

