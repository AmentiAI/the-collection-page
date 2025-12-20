import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

interface CheckStatusRequest {
  megaMonsterId: string
  commitTxId?: string
  revealTxId?: string
  pollForConfirmation?: boolean
}

async function checkTxInMempool(txId: string): Promise<{ inMempool: boolean; confirmed: boolean; confirmations: number }> {
  try {
    const MEMPOOL_URL = process.env.MEMPOOL_API_URL || 'https://mempool.space/api'
    
    const statusResponse = await fetch(`${MEMPOOL_URL}/tx/${txId}/status`, {
      cache: 'no-store'
    })
    
    if (!statusResponse.ok) {
      return { inMempool: false, confirmed: false, confirmations: 0 }
    }
    
    const statusData = await statusResponse.json()
    const isConfirmed = statusData.confirmed === true
    
    let confirmations = 0
    if (isConfirmed && statusData.block_height) {
      try {
        const blocksResponse = await fetch(`${MEMPOOL_URL}/blocks/tip/height`, {
          cache: 'no-store'
        })
        if (blocksResponse.ok) {
          const currentHeight = await blocksResponse.json()
          confirmations = Math.max(0, currentHeight - statusData.block_height + 1)
        }
      } catch (e) {
        console.warn(`Failed to get current block height:`, e)
        confirmations = 1
      }
    }
    
    return {
      inMempool: true,
      confirmed: isConfirmed,
      confirmations
    }
  } catch (error) {
    console.error(`Failed to check tx for ${txId}:`, error)
    return { inMempool: false, confirmed: false, confirmations: 0 }
  }
}

export async function POST(request: NextRequest) {
  try {
    const pool = getPool()
    
    const { megaMonsterId, commitTxId, revealTxId, pollForConfirmation = false }: CheckStatusRequest = await request.json()
    
    const megaMonsterRecord = await pool.query(
      `SELECT id, wallet_address, inscription_id, commit_txid, broadcast_txid
       FROM mega_monsters
       WHERE id = $1`,
      [megaMonsterId]
    )
    
    if (megaMonsterRecord.rowCount === 0) {
      return NextResponse.json({
        success: false,
        error: 'Mega monster record not found'
      }, { status: 404 })
    }
    
    const megaMonster = megaMonsterRecord.rows[0]
    
    // Use provided tx IDs or get from database
    const actualCommitTxId = commitTxId || megaMonster.commit_txid
    const actualRevealTxId = revealTxId || megaMonster.broadcast_txid
    
    let status = 'pending'
    let statusChanged = false
    
    // If polling is enabled, check transaction confirmations
    if (pollForConfirmation) {
      // Check commit transaction
      if (actualCommitTxId) {
        const commitStatus = await checkTxInMempool(actualCommitTxId)
        
        if (commitStatus.inMempool && !commitStatus.confirmed) {
          status = 'commit_in_mempool'
          statusChanged = true
        } else if (commitStatus.confirmed) {
          status = 'commit_confirmed'
          statusChanged = true
        }
      }
      
      // Check reveal transaction
      if (actualRevealTxId && status !== 'pending') {
        const revealStatus = await checkTxInMempool(actualRevealTxId)
        
        if (revealStatus.confirmed) {
          status = 'completed'
          statusChanged = true
          
          // Update inscription_id if not already set
          if (!megaMonster.inscription_id) {
            const inscriptionId = `${actualRevealTxId}i0`
            await pool.query(
              `UPDATE mega_monsters
               SET inscription_id = $1
               WHERE id = $2`,
              [inscriptionId, megaMonsterId]
            )
          }
        } else if (revealStatus.inMempool) {
          status = 'reveal_broadcast'
          statusChanged = true
        }
      }
    } else {
      // Just return current status based on what's in DB
      if (megaMonster.inscription_id) {
        status = 'completed'
      } else if (actualRevealTxId) {
        status = 'reveal_broadcast'
      } else if (actualCommitTxId) {
        status = 'commit_broadcast'
      }
    }

    return NextResponse.json({
      success: true,
      mint: {
        id: megaMonster.id,
        megaMonsterId: megaMonster.id,
        walletAddress: megaMonster.wallet_address,
        status: status,
        commitTxId: actualCommitTxId,
        revealTxId: actualRevealTxId,
        inscriptionId: megaMonster.inscription_id
      },
      statusChanged
    })

  } catch (error) {
    console.error('❌ Error checking mint status:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

