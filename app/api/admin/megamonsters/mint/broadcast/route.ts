import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

interface BroadcastRequest {
  megaMonsterId: string
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
  const { megaMonsterId, txHex, txType, feeRate }: BroadcastRequest = await request.json()
  
  try {
    console.log(`📡 Broadcasting ${txType} transaction for mega monster ${megaMonsterId}`)
    console.log(`   Fee rate: ${feeRate} sat/vB`)
    console.log(`   TX hex length: ${txHex.length}`)

    const pool = getPool()

    // Broadcast the transaction
    const txId = await smartBroadcast(txHex, feeRate, txType)
    
    console.log(`✅ ${txType} transaction broadcast: ${txId}`)

    // Update mega_monsters table
    if (txType === 'commit') {
      await pool.query(
        `UPDATE mega_monsters
         SET commit_txid = $1
         WHERE id = $2`,
        [txId, megaMonsterId]
      )
      
      console.log(`✅ Updated mega monster with commit tx: ${txId}`)
      
    } else if (txType === 'reveal') {
      const inscriptionId = `${txId}i0`
      await pool.query(
        `UPDATE mega_monsters
         SET broadcast_txid = $1,
             inscription_id = $2
         WHERE id = $3`,
        [txId, inscriptionId, megaMonsterId]
      )
      
      console.log(`✅ Updated mega monster with reveal tx: ${txId}`)
      console.log(`🎯 Predicted inscription ID: ${inscriptionId}`)
    }

    return NextResponse.json({
      success: true,
      txId,
      inscriptionId: txType === 'reveal' ? `${txId}i0` : undefined,
      message: `${txType} transaction broadcast successfully`
    })

  } catch (error) {
    console.error('❌ Broadcast failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Broadcast failed'
    }, { status: 500 })
  }
}

