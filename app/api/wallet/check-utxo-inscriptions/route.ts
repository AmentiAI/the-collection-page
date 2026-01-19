import { NextRequest, NextResponse } from 'next/server'

async function fetchSubfrostRpc(
  method: string,
  params: any[],
  apiKey: string,
  apiUrl: string,
): Promise<any> {
  const request = {
    jsonrpc: '2.0',
    id: method,
    method,
    params,
  }

  // Try URL path authentication first
  const urlPath = `${apiUrl}/${apiKey}`
  let response = await fetch(urlPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    body: JSON.stringify(request),
    cache: 'no-store',
  })

  // Fallback to header authentication if URL path fails
  if (!response.ok && (response.status === 400 || response.status === 401 || response.status === 404)) {
    const headerPath = `${apiUrl}/jsonrpc`
    response = await fetch(headerPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-subfrost-api-key': apiKey,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
      body: JSON.stringify(request),
      cache: 'no-store',
    })
  }

  const responseText = await response.text()
  
  if (!response.ok) {
    throw new Error(`Subfrost ${method} failed (${response.status}): ${responseText.substring(0, 200)}`)
  }

  const data = JSON.parse(responseText)
  if (data.error) {
    // Error response means no ordinals data (clean UTXO)
    if (data.error.message && typeof data.error.message === 'string' && data.error.message.includes('disabled')) {
      return null // JSON API disabled - treat as clean
    }
    return null // Error means clean UTXO per Subfrost guide
  }

  return data.result
}

async function checkTxInMempool(txid: string): Promise<{ inMempool: boolean; confirmed: boolean; blockHeight: number | null }> {
  try {
    const MEMPOOL_API_BASE = process.env.MEMPOOL_API_URL || 'https://mempool.space/api'
    
    const response = await fetch(`${MEMPOOL_API_BASE}/tx/${txid}`, {
      method: 'GET',
      cache: 'no-store',
    })
    
    if (response.status === 404) {
      // Not found in mempool or blockchain
      return { inMempool: false, confirmed: false, blockHeight: null }
    }
    
    if (!response.ok) {
      return { inMempool: false, confirmed: false, blockHeight: null }
    }
    
    const payload = await response.json()
    const confirmed = Boolean(payload?.status?.confirmed)
    const blockHeight = payload?.status?.block_height || null
    
    return {
      inMempool: true,
      confirmed,
      blockHeight,
    }
  } catch (error) {
    console.error(`Failed to check tx ${txid} in mempool:`, error)
    return { inMempool: false, confirmed: false, blockHeight: null }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { outpoint } = body

    if (!outpoint || typeof outpoint !== 'string') {
      return NextResponse.json(
        { success: false, error: 'outpoint is required' },
        { status: 400 },
      )
    }

    // Parse outpoint to get txid
    const [txid, voutStr] = outpoint.split(':')
    if (!txid || !voutStr) {
      return NextResponse.json(
        { success: false, error: 'Invalid outpoint format (expected txid:vout)' },
        { status: 400 },
      )
    }

    const SUBFROST_API_URL = process.env.SUBFROST_URL || 'https://mainnet.subfrost.io/v4'
    const rawApiKey = process.env.SUBFROST_API_KEY || ''
    const SUBFROST_API_KEY = rawApiKey.endsWith('%') ? rawApiKey.slice(0, -1) : rawApiKey

    if (!SUBFROST_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'SUBFROST_API_KEY not configured' },
        { status: 500 },
      )
    }

    // First check if transaction is pending/unconfirmed
    const mempoolStatus = await checkTxInMempool(txid)
    const isPending = mempoolStatus.inMempool && !mempoolStatus.confirmed

    // For pending UTXOs, ord_output might not work, so we need to check the transaction itself
    let ordData = null
    let inscriptions: any[] = []
    let runes: any = {}
    let protorunes: any[] = []

    if (isPending) {
      // For pending transactions, ord_output won't work (only indexes confirmed transactions)
      // We can still try ord_output in case it's been indexed, but it will likely fail
      // Return pending status so UI can inform user
      console.log(`[check-utxo-inscriptions] UTXO ${outpoint} is pending in mempool - ord_output may not work`)
      
      // Still try ord_output in case the UTXO was just confirmed
      try {
        ordData = await fetchSubfrostRpc('ord_output', [outpoint], SUBFROST_API_KEY, SUBFROST_API_URL)
        if (ordData && ordData !== null && typeof ordData === 'object') {
          inscriptions = ordData.inscriptions || []
          runes = ordData.runes || {}
          protorunes = ordData.protorunes || []
        }
      } catch (ordError) {
        // Expected for pending UTXOs - ord_output only works on confirmed transactions
        console.log(`[check-utxo-inscriptions] ord_output failed for pending UTXO ${outpoint} (expected):`, ordError)
      }
    } else {
      // For confirmed UTXOs, use ord_output
      try {
        ordData = await fetchSubfrostRpc('ord_output', [outpoint], SUBFROST_API_KEY, SUBFROST_API_URL)
        
        if (ordData && ordData !== null && typeof ordData === 'object') {
          inscriptions = ordData.inscriptions || []
          runes = ordData.runes || {}
          protorunes = ordData.protorunes || []
        } else if (ordData === null) {
          // null means clean UTXO (no ordinals data)
          console.log(`[check-utxo-inscriptions] UTXO ${outpoint} is clean (no ordinals)`)
        }
      } catch (ordError) {
        console.warn(`[check-utxo-inscriptions] ord_output failed for ${outpoint}:`, ordError)
        // If ord_output fails with an error, it might mean:
        // 1. UTXO is clean (error response per Subfrost guide)
        // 2. API issue
        // We'll treat errors as "no inscriptions" for confirmed UTXOs
      }
    }

    const hasInscriptions = Array.isArray(inscriptions) && inscriptions.length > 0
    const hasRunes = (Array.isArray(runes) && runes.length > 0) || 
                    (typeof runes === 'object' && runes !== null && !Array.isArray(runes) && Object.keys(runes).length > 0)
    const hasProtorunes = Array.isArray(protorunes) && protorunes.length > 0

    // Normalize inscriptions to strings
    const normalizedInscriptions = hasInscriptions
      ? inscriptions.map((ins: any) => typeof ins === 'string' ? ins : ins.id || ins.inscription_id || String(ins))
      : []

    // Normalize runes
    const normalizedRunes = hasRunes
      ? (Array.isArray(runes) ? runes : Object.values(runes))
      : []

    return NextResponse.json({
      success: true,
      isPending,
      hasInscriptions,
      hasRunes: hasRunes || hasProtorunes,
      inscriptions: normalizedInscriptions,
      runes: normalizedRunes,
      blockHeight: mempoolStatus.blockHeight,
    })
  } catch (error) {
    console.error('[check-utxo-inscriptions] Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to check UTXO'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
