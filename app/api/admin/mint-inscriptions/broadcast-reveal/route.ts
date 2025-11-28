import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { mintInscriptionId } = await request.json()
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin

    if (!mintInscriptionId) {
      return NextResponse.json(
        { success: false, error: 'mintInscriptionId is required' },
        { status: 400 }
      )
    }

    const pool = getPool()

    // Fetch mint inscription record
    const mintRecord = await pool.query(
      `SELECT id, commit_tx_id, reveal_tx_id, fee_rate, mint_status, reveal_data
       FROM mint_inscriptions
       WHERE id = $1`,
      [mintInscriptionId]
    )

    if (mintRecord.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Mint inscription not found' },
        { status: 404 }
      )
    }

    const mint = mintRecord.rows[0]

    // Verify status allows reveal broadcast
    if (mint.mint_status !== 'commit_in_mempool' && mint.mint_status !== 'commit_broadcast') {
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot broadcast reveal for status: ${mint.mint_status}. Status must be 'commit_in_mempool' or 'commit_broadcast'.` 
        },
        { status: 400 }
      )
    }

    // Check if reveal already exists
    if (mint.reveal_tx_id) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Reveal transaction already exists: ${mint.reveal_tx_id}` 
        },
        { status: 400 }
      )
    }

    if (!mint.commit_tx_id) {
      return NextResponse.json(
        { success: false, error: 'Commit transaction ID not found' },
        { status: 400 }
      )
    }

    if (!mint.reveal_data) {
      return NextResponse.json(
        { success: false, error: 'Reveal data not found in mint record' },
        { status: 400 }
      )
    }

    const feeRate = parseFloat(mint.fee_rate)

    // Create reveal transaction
    const createRevealResponse = await fetch(
      `${baseUrl}/api/graveyard/mint/create-reveal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintInscriptionId: mint.id,
          commitTxId: mint.commit_tx_id,
          feeRate: feeRate
        })
      }
    )

    if (!createRevealResponse.ok) {
      const errorData = await createRevealResponse.json().catch(() => ({ error: 'Unknown error' }))
      return NextResponse.json(
        { success: false, error: errorData.error || 'Failed to create reveal transaction' },
        { status: 500 }
      )
    }

    const revealData = await createRevealResponse.json()

    if (!revealData.success || !revealData.signedTxHex) {
      return NextResponse.json(
        { success: false, error: revealData.error || 'Failed to create reveal transaction' },
        { status: 500 }
      )
    }

    // Broadcast reveal transaction
    const broadcastResponse = await fetch(
      `${baseUrl}/api/graveyard/mint/broadcast`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintInscriptionId: mint.id,
          txHex: revealData.signedTxHex,
          txType: 'reveal',
          feeRate: feeRate
        })
      }
    )

    if (!broadcastResponse.ok) {
      const errorData = await broadcastResponse.json().catch(() => ({ error: 'Unknown error' }))
      return NextResponse.json(
        { success: false, error: errorData.error || 'Failed to broadcast reveal transaction' },
        { status: 500 }
      )
    }

    const broadcastData = await broadcastResponse.json()

    if (!broadcastData.success) {
      return NextResponse.json(
        { success: false, error: broadcastData.error || 'Failed to broadcast reveal transaction' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      revealTxId: broadcastData.txId,
      inscriptionId: broadcastData.inscriptionId,
      message: 'Reveal transaction broadcast successfully'
    })

  } catch (error) {
    console.error('[admin/mint-inscriptions/broadcast-reveal][POST] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to broadcast reveal transaction'
      },
      { status: 500 }
    )
  }
}

