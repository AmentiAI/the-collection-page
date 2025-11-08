import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_SANDSHREW_URL = process.env.SANDSHREW_URL || 'https://mainnet.sandshrew.io/v2'
const SANDSHREW_DEVELOPER_KEY = process.env.SANDSHREW_DEVELOPER_KEY
const DEFAULT_MEMPOOL_URL = process.env.MEMPOOL_API_URL || 'https://mempool.space/api'

function buildSandshrewEndpoint() {
  if (!SANDSHREW_DEVELOPER_KEY || !SANDSHREW_DEVELOPER_KEY.trim()) {
    throw new Error('SANDSHREW_DEVELOPER_KEY is not set in the environment')
  }

  const base = DEFAULT_SANDSHREW_URL.replace(/\/+$/, '')
  return `${base}/${SANDSHREW_DEVELOPER_KEY.trim()}`
}

function extractTxid(result: unknown): string | null {
  if (!result) {
    return null
  }

  if (typeof result === 'string') {
    return result.trim() || null
  }

  if (Array.isArray(result)) {
    for (const entry of result) {
      const txid = extractTxid(entry)
      if (txid) return txid
    }
    return null
  }

  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>
    const possibleKeys = ['txid', 'txId', 'transactionId', 'result', 'data']
    for (const key of possibleKeys) {
      if (typeof obj[key] === 'string') {
        return (obj[key] as string).trim() || null
      }
      if (obj[key] && typeof obj[key] === 'object') {
        const nested = extractTxid(obj[key])
        if (nested) return nested
      }
    }
  }

  return null
}

async function broadcastViaSandshrew(txHex: string) {
  const endpoint = buildSandshrewEndpoint()

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
  const txid = extractTxid(payload?.result ?? payload)

  console.info('[broadcast-transaction] Sandshrew payload', {
    hasResult: Boolean(payload?.result),
    keys: payload ? Object.keys(payload) : null,
    preview: JSON.stringify(payload).slice(0, 400),
  })

  if (txid) {
    return txid
  }

  throw new Error('Sandshrew broadcast returned an empty result')
}

async function broadcastViaMempool(txHex: string) {
  const response = await fetch(`${DEFAULT_MEMPOOL_URL.replace(/\/+$/, '')}/tx`, {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const txHex = typeof body?.txHex === 'string' ? body.txHex.trim() : ''
    const method = typeof body?.method === 'string' ? body.method.toLowerCase() : 'mempool'

    if (!txHex) {
      return NextResponse.json(
        { success: false, error: 'txHex is required' },
        { status: 400 },
      )
    }

    let txId: string | null = null

    const preferSandshrew = method === 'sandshrew'
    const attempts: Array<{ name: string; handler: () => Promise<string> }> = preferSandshrew
      ? [
          { name: 'sandshrew', handler: () => broadcastViaSandshrew(txHex) },
          { name: 'mempool', handler: () => broadcastViaMempool(txHex) },
        ]
      : [
          { name: 'mempool', handler: () => broadcastViaMempool(txHex) },
          { name: 'sandshrew', handler: () => broadcastViaSandshrew(txHex) },
        ]

    const errors: Array<{ name: string; error: string }> = []

    for (const attempt of attempts) {
      try {
        txId = await attempt.handler()
        if (txId) {
          if (attempt.name !== method) {
            console.warn('[broadcast-transaction] Fallback broadcast succeeded', {
              preferred: method,
              used: attempt.name,
            })
          }
          break
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push({ name: attempt.name, error: message })
        console.error('[broadcast-transaction] Broadcast attempt failed', { name: attempt.name, message })
      }
    }

    if (!txId) {
      const errorSummary = errors.map((entry) => `${entry.name}: ${entry.error}`).join(' | ') || 'Unknown error'
      return NextResponse.json(
        { success: false, error: `Broadcast failed. Attempts: ${errorSummary}` },
        { status: 502 },
      )
    }

    return NextResponse.json({ success: true, txId })
  } catch (error) {
    console.error('[broadcast-transaction] Broadcast failed', error)

    const message = error instanceof Error ? error.message : 'Broadcast failed'
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}


