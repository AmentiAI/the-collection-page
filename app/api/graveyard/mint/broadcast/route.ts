import { NextRequest, NextResponse } from 'next/server'
import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'
import type { Pool } from 'pg'

async function ensureMintInfrastructure(pool: Pool) {
  if (isTableInitialized('mint_inscriptions')) {
    return
  }

  console.log('🔧 Initializing mint infrastructure (broadcast endpoint)...')

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

interface BroadcastRequest {
  mintInscriptionId: string
  txHex: string
  txType: 'commit' | 'reveal'
  feeRate: number
}

async function broadcastViaSandshrew(txHex: string) {
  const SANDSHREW_API_URL = process.env.SANDSHREW_URL || 'https://mainnet.sandshrew.io/v2'
  const SANDSHREW_DEVELOPER_KEY = process.env.SANDSHREW_DEVELOPER_KEY

  if (!SANDSHREW_DEVELOPER_KEY) {
    throw new Error('SANDSHREW_DEVELOPER_KEY not configured')
  }

  const endpoint = `${SANDSHREW_API_URL.replace(/\/+$/, '')}/${SANDSHREW_DEVELOPER_KEY.trim()}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `broadcast-${Date.now()}`,
      method: 'broadcast_transaction',
      params: [txHex],
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Sandshrew broadcast failed (${response.status})`)
  }

  const payload = await response.json().catch(() => ({}))
  
  // Extract txid from result
  let txid: string | null = null
  if (typeof payload?.result === 'string') {
    txid = payload.result.trim()
  } else if (payload?.result?.txid) {
    txid = payload.result.txid
  }

  if (txid) {
    return txid
  }

  throw new Error('Sandshrew broadcast returned empty result')
}

async function broadcastViaMempool(txHex: string) {
  const MEMPOOL_URL = process.env.MEMPOOL_API_URL || 'https://mempool.space/api'

  const response = await fetch(`${MEMPOOL_URL.replace(/\/+$/, '')}/tx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: txHex,
    cache: 'no-store',
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(text || 'Mempool broadcast failed')
  }

  return text.trim()
}

async function smartBroadcast(txHex: string, feeRate: number, txType: 'commit' | 'reveal') {
  // EXACT PATTERN FROM WORKING CODE:
  // Use Sandshrew for ALL transactions <1 sat/vB (including reveals!)
  // Use mempool.space for transactions >=1 sat/vB
  const preferSandshrew = feeRate < 1
  
  const attempts = preferSandshrew
    ? [
        { name: 'sandshrew', handler: () => broadcastViaSandshrew(txHex) },
        { name: 'mempool', handler: () => broadcastViaMempool(txHex) },
      ]
    : [
        { name: 'mempool', handler: () => broadcastViaMempool(txHex) },
        { name: 'sandshrew', handler: () => broadcastViaSandshrew(txHex) },
      ]

  const errors: Array<{ name: string; error: string }> = []
  let txId: string | null = null

  for (const attempt of attempts) {
    try {
      txId = await attempt.handler()
      if (txId) {
        console.log(`✅ Broadcast successful via ${attempt.name}: ${txId}`)
        break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ name: attempt.name, error: message })
      console.error(`❌ ${attempt.name} broadcast failed:`, message)
    }
  }

  if (!txId) {
    const errorSummary = errors.map((e) => `${e.name}: ${e.error}`).join(' | ')
    throw new Error(`Broadcast failed: ${errorSummary}`)
  }

  return txId
}

export async function POST(request: NextRequest) {
  // Read body ONCE at the top level (available in both try and catch blocks)
  const { mintInscriptionId, txHex, txType, feeRate }: BroadcastRequest = await request.json()
  
  try {
    console.log(`📡 Broadcasting ${txType} transaction for mint ${mintInscriptionId}`)
    console.log(`   Fee rate: ${feeRate} sat/vB`)
    console.log(`   TX hex length: ${txHex.length}`)

    // Ensure tables exist
    const pool = getPool()
    await ensureMintInfrastructure(pool)

    // Broadcast the transaction (reveal MUST go to mempool.space)
    const txId = await smartBroadcast(txHex, feeRate, txType)
    
    console.log(`✅ ${txType} transaction broadcast: ${txId}`)

    // Update mint inscription record (pool already initialized above)
    if (txType === 'commit') {
      await pool.query(
        `UPDATE mint_inscriptions
         SET commit_tx_id = $1,
             signed_commit_tx_hex = $2,
             mint_status = 'commit_broadcast',
             commit_broadcast_at = NOW(),
             last_checked_at = NOW()
         WHERE id = $3`,
        [txId, txHex, mintInscriptionId]
      )
      
      console.log(`✅ Updated mint record with commit tx: ${txId}`)
      
    } else if (txType === 'reveal') {
      await pool.query(
        `UPDATE mint_inscriptions
         SET reveal_tx_id = $1,
             inscription_id = $2,
             signed_reveal_tx_hex = $3,
             mint_status = 'reveal_broadcast',
             reveal_broadcast_at = NOW(),
             last_checked_at = NOW()
         WHERE id = $4`,
        [txId, `${txId}i0`, txHex, mintInscriptionId]
      )
      
      console.log(`✅ Updated mint record with reveal tx: ${txId}`)
      console.log(`🎯 Predicted inscription ID: ${txId}i0`)
    }

    return NextResponse.json({
      success: true,
      txId,
      inscriptionId: txType === 'reveal' ? `${txId}i0` : undefined,
      message: `${txType} transaction broadcast successfully`
    })

  } catch (error) {
    console.error('❌ Broadcast failed:', error)
    
    // DON'T update status to 'failed' - let user retry without resetting DB
    console.log(`⚠️ Not updating DB status - allowing retry`)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Broadcast failed'
    }, { status: 500 })
  }
}

