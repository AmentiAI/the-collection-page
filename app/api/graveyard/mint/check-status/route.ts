import { NextRequest, NextResponse } from 'next/server'
import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'
import type { Pool } from 'pg'

async function ensureMintInfrastructure(pool: Pool) {
  if (isTableInitialized('mint_inscriptions')) {
    return
  }

  console.log('🔧 Initializing mint infrastructure (check-status endpoint)...')

  // Create mint_inscriptions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mint_inscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mint_queue_id UUID REFERENCES ascended_images_mint_queue(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      payment_address TEXT,
      receiving_address TEXT,
      
      commit_tx_id TEXT,
      reveal_tx_id TEXT,
      inscription_id TEXT,
      
      commit_psbt_base64 TEXT,
      reveal_psbt_base64 TEXT,
      signed_commit_tx_hex TEXT,
      signed_reveal_tx_hex TEXT,
      
      fee_rate DECIMAL(10, 2) NOT NULL,
      commit_fee_sats INTEGER,
      reveal_fee_sats INTEGER,
      total_cost_sats INTEGER,
      
      original_image_url TEXT NOT NULL,
      compressed_image_url TEXT,
      compressed_base64 TEXT,
      is_compressed BOOLEAN DEFAULT FALSE,
      
      mint_status TEXT NOT NULL DEFAULT 'pending_compression',
      error_message TEXT,
      
      reveal_data JSONB,
      
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      commit_signed_at TIMESTAMPTZ,
      commit_broadcast_at TIMESTAMPTZ,
      commit_confirmed_at TIMESTAMPTZ,
      reveal_broadcast_at TIMESTAMPTZ,
      reveal_confirmed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      
      UNIQUE(mint_queue_id)
    )
  `)

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_wallet ON mint_inscriptions(LOWER(wallet_address))
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_status ON mint_inscriptions(mint_status)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_commit_tx ON mint_inscriptions(commit_tx_id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_reveal_tx ON mint_inscriptions(reveal_tx_id)
  `)

  // Add fields to ascended_images_mint_queue if they don't exist
  await pool.query(`
    ALTER TABLE ascended_images_mint_queue 
    ADD COLUMN IF NOT EXISTS mint_status TEXT DEFAULT 'awaiting_mint',
    ADD COLUMN IF NOT EXISTS compressed_image_url TEXT,
    ADD COLUMN IF NOT EXISTS compressed_size_bytes INTEGER,
    ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT FALSE
  `)

  console.log('✅ Mint infrastructure initialized')
  markTableInitialized('mint_inscriptions')
}

interface CheckStatusRequest {
  mintInscriptionId: string
  pollForConfirmation?: boolean
}

async function checkTxInMempool(txId: string): Promise<{ inMempool: boolean; confirmed: boolean; confirmations: number }> {
  try {
    const MEMPOOL_URL = process.env.MEMPOOL_API_URL || 'https://mempool.space/api'
    const response = await fetch(`${MEMPOOL_URL}/tx/${txId}/status`, {
      cache: 'no-store'
    })
    
    if (!response.ok) {
      // If 404, tx not found yet
      return { inMempool: false, confirmed: false, confirmations: 0 }
    }
    
    const data = await response.json()
    return {
      inMempool: true, // If we got a response, it's in mempool
      confirmed: data.confirmed === true,
      confirmations: data.confirmed ? (data.block_height ? 1 : 0) : 0
    }
  } catch (error) {
    console.error(`Failed to check tx for ${txId}:`, error)
    return { inMempool: false, confirmed: false, confirmations: 0 }
  }
}

export async function POST(request: NextRequest) {
  try {
    const pool = getPool()
    await ensureMintInfrastructure(pool)
    
    const { mintInscriptionId, pollForConfirmation = false }: CheckStatusRequest = await request.json()
    const mintRecord = await pool.query(
      `SELECT id, mint_status, commit_tx_id, reveal_tx_id, inscription_id,
              wallet_address, fee_rate, total_cost_sats, error_message,
              created_at, commit_broadcast_at, commit_confirmed_at,
              reveal_broadcast_at, completed_at, last_checked_at
       FROM mint_inscriptions
       WHERE id = $1`,
      [mintInscriptionId]
    )
    
    if (mintRecord.rowCount === 0) {
      return NextResponse.json({
        success: false,
        error: 'Mint inscription record not found'
      }, { status: 404 })
    }
    
    const mint = mintRecord.rows[0]
    let updatedStatus = mint.mint_status
    let shouldUpdate = false

    // If polling is enabled, check transaction confirmations
    if (pollForConfirmation) {
      console.log(`🔍 Checking confirmation status for mint ${mintInscriptionId}`)
      
      // Check commit transaction in mempool (don't wait for confirmation!)
      if (mint.commit_tx_id && mint.mint_status === 'commit_broadcast') {
        const commitStatus = await checkTxInMempool(mint.commit_tx_id)
        
        if (commitStatus.inMempool) {
          console.log(`✅ Commit transaction found in mempool: ${mint.commit_tx_id}`)
          console.log(`   Confirmed: ${commitStatus.confirmed}, triggering reveal broadcast`)
          updatedStatus = 'commit_in_mempool'
          shouldUpdate = true
          
          await pool.query(
            `UPDATE mint_inscriptions
             SET mint_status = 'commit_in_mempool',
                 last_checked_at = NOW()
             WHERE id = $1`,
            [mintInscriptionId]
          )
        } else {
          // Update last checked time even if not found yet
          await pool.query(
            `UPDATE mint_inscriptions
             SET last_checked_at = NOW()
             WHERE id = $1`,
            [mintInscriptionId]
          )
        }
      }
      
      // Track when commit gets confirmed (for display purposes only)
      if (mint.commit_tx_id && mint.mint_status === 'commit_in_mempool') {
        const commitStatus = await checkTxInMempool(mint.commit_tx_id)
        
        if (commitStatus.confirmed && !mint.commit_confirmed_at) {
          console.log(`✅ Commit transaction confirmed in block: ${mint.commit_tx_id}`)
          
          await pool.query(
            `UPDATE mint_inscriptions
             SET commit_confirmed_at = NOW(),
                 last_checked_at = NOW()
             WHERE id = $1`,
            [mintInscriptionId]
          )
        }
      }
      
      // Check reveal transaction confirmation
      if (mint.reveal_tx_id && mint.mint_status === 'reveal_broadcast') {
        const revealStatus = await checkTxInMempool(mint.reveal_tx_id)
        
        if (revealStatus.confirmed) {
          console.log(`✅ Reveal transaction confirmed: ${mint.reveal_tx_id}`)
          console.log(`🎉 Inscription completed: ${mint.inscription_id}`)
          updatedStatus = 'completed'
          shouldUpdate = true
          
          await pool.query(
            `UPDATE mint_inscriptions
             SET mint_status = 'completed',
                 completed_at = NOW(),
                 last_checked_at = NOW()
             WHERE id = $1`,
            [mintInscriptionId]
          )
          
          // Update mint queue status
          await pool.query(
            `UPDATE ascended_images_mint_queue
             SET mint_status = 'minted'
             WHERE id = (SELECT mint_queue_id FROM mint_inscriptions WHERE id = $1)`,
            [mintInscriptionId]
          )
        } else {
          // Update last checked time
          await pool.query(
            `UPDATE mint_inscriptions
             SET last_checked_at = NOW()
             WHERE id = $1`,
            [mintInscriptionId]
          )
        }
      }
    }

    // Fetch updated record if status changed
    let finalMint = mint
    if (shouldUpdate) {
      const updatedRecord = await pool.query(
        `SELECT * FROM mint_inscriptions WHERE id = $1`,
        [mintInscriptionId]
      )
      finalMint = updatedRecord.rows[0]
    }

    return NextResponse.json({
      success: true,
      mint: {
        id: finalMint.id,
        mintQueueId: finalMint.mint_queue_id,
        walletAddress: finalMint.wallet_address,
        status: updatedStatus || finalMint.mint_status,
        commitTxId: finalMint.commit_tx_id,
        revealTxId: finalMint.reveal_tx_id,
        inscriptionId: finalMint.inscription_id,
        feeRate: parseFloat(finalMint.fee_rate),
        totalCostSats: finalMint.total_cost_sats,
        errorMessage: finalMint.error_message,
        createdAt: finalMint.created_at,
        commitBroadcastAt: finalMint.commit_broadcast_at,
        commitConfirmedAt: finalMint.commit_confirmed_at,
        revealBroadcastAt: finalMint.reveal_broadcast_at,
        completedAt: finalMint.completed_at,
        lastCheckedAt: finalMint.last_checked_at
      },
      statusChanged: shouldUpdate
    })

  } catch (error) {
    console.error('❌ Error checking mint status:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

