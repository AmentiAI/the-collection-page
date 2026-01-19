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

    const SUBFROST_API_URL = process.env.SUBFROST_URL || 'https://mainnet.subfrost.io/v4'
    const rawApiKey = process.env.SUBFROST_API_KEY || ''
    const SUBFROST_API_KEY = rawApiKey.endsWith('%') ? rawApiKey.slice(0, -1) : rawApiKey

    if (!SUBFROST_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'SUBFROST_API_KEY not configured' },
        { status: 500 },
      )
    }

    // Check for inscriptions using ord_output
    const ordData = await fetchSubfrostRpc('ord_output', [outpoint], SUBFROST_API_KEY, SUBFROST_API_URL)

    if (!ordData || ordData === null) {
      return NextResponse.json({
        success: true,
        hasInscriptions: false,
        hasRunes: false,
        inscriptions: [],
        runes: [],
      })
    }

    const inscriptions = ordData.inscriptions || []
    const runes = ordData.runes || {}
    const protorunes = ordData.protorunes || []

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
      hasInscriptions,
      hasRunes: hasRunes || hasProtorunes,
      inscriptions: normalizedInscriptions,
      runes: normalizedRunes,
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
