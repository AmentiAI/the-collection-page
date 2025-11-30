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

    // Check if army is dead and resurrection time has passed
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

    const resurrectionTime = checkResult.rows[0].resurrection_time
    if (!resurrectionTime) {
      return NextResponse.json(
        { error: 'Resurrection has not been started. Please start resurrection first.' },
        { status: 400 }
      )
    }

    const now = new Date()
    const resurrectionDate = new Date(resurrectionTime)
    if (now < resurrectionDate) {
      const msRemaining = resurrectionDate.getTime() - now.getTime()
      const minutesRemaining = Math.ceil(msRemaining / (1000 * 60))
      return NextResponse.json(
        { error: `Resurrection not complete. ${minutesRemaining} minute(s) remaining.` },
        { status: 400 }
      )
    }

    // Resurrect the army
    await client.query(
      `UPDATE battle_ordinals
       SET 
         is_dead = false,
         life_force = 100,
         status = 'ready',
         death_time = NULL,
         resurrection_time = NULL,
         updated_at = NOW()
       WHERE LOWER(wallet_address) = LOWER($1)
         AND inscription_id = $2`,
      [walletAddress, inscriptionId]
    )

    return NextResponse.json({
      success: true,
      message: 'Army resurrected successfully!',
    })
  } catch (error) {
    console.error('Error resurrecting army:', error)
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

