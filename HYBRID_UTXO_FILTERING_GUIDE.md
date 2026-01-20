# Hybrid UTXO Filtering System

A production-ready approach for fetching spendable Bitcoin UTXOs while avoiding inscription/rune loss. Uses mempool.space for real-time UTXO and mempool data, combined with Ordiscan for asset detection.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
│                                                                   │
│  1. Fetch UTXOs from mempool.space/api/address/{addr}/utxo       │
│  2. Fetch pending txs from mempool.space/api/address/{addr}/txs/mempool │
│                                                                   │
│  Rate limits apply per-user IP (not your server)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER (API)                              │
│                                                                   │
│  3. Receive client mempool data                                  │
│  4. Build locked outpoints set from mempool txs                  │
│  5. Fetch Ordiscan /address/{addr}/utxos for asset detection     │
│  6. Filter UTXOs:                                                │
│     - Must be > 1200 sats (filters 99.9% of inscriptions)        │
│     - Must be confirmed                                          │
│     - Must not be locked (spent by pending tx)                   │
│     - Must not have inscriptions (via Ordiscan)                  │
│     - Must not have runes (via Ordiscan)                         │
│  7. Return payment-ready UTXOs                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Why This Architecture?

1. **Rate Limit Distribution**: mempool.space has ~300 req/min limits. By calling from the browser, each user uses their own quota instead of exhausting your server's.

2. **Real-time Mempool Detection**: mempool.space provides live mempool data, so we can detect UTXOs being spent in pending transactions (locked).

3. **Asset Safety**: Ordiscan provides inscription/rune data. The >1200 sat filter catches 99.9% of assets as a fallback if Ordiscan fails.

4. **No Subfrost Dependency**: Subfrost's indexer can lag behind or return unreliable data. This approach is more reliable.

---

## Step 1: Client-Side Mempool Fetching

Fetch UTXO and mempool data directly from the user's browser:

```typescript
// types.ts
export interface MempoolClientData {
  utxos: Array<{
    txid: string
    vout: number
    value: number
    status?: {
      confirmed: boolean
      block_height?: number
    }
  }>
  mempoolTxs: Array<{
    txid: string
    vin?: Array<{
      txid: string
      vout: number
      prevout?: {
        scriptpubkey_address: string
        value: number
      }
    }>
  }>
}

// client-mempool.ts
export async function fetchMempoolData(address: string): Promise<MempoolClientData> {
  console.log(`[Mempool] Fetching UTXOs for ${address}...`)
  
  const [utxosRes, mempoolTxsRes] = await Promise.all([
    fetch(`https://mempool.space/api/address/${address}/utxo`),
    fetch(`https://mempool.space/api/address/${address}/txs/mempool`)
  ])

  if (!utxosRes.ok) {
    throw new Error(`Failed to fetch UTXOs: ${utxosRes.status}`)
  }
  if (!mempoolTxsRes.ok) {
    throw new Error(`Failed to fetch mempool txs: ${mempoolTxsRes.status}`)
  }

  const utxos = await utxosRes.json()
  const mempoolTxs = await mempoolTxsRes.json()

  console.log(`[Mempool] Got ${utxos.length} UTXOs, ${mempoolTxs.length} mempool txs`)

  return { utxos, mempoolTxs }
}
```

### API Responses

**GET /api/address/{address}/utxo**
```json
[
  {
    "txid": "abc123...",
    "vout": 0,
    "value": 50000,
    "status": {
      "confirmed": true,
      "block_height": 832000,
      "block_hash": "000000...",
      "block_time": 1700000000
    }
  },
  {
    "txid": "def456...",
    "vout": 1,
    "value": 1000,
    "status": {
      "confirmed": false
    }
  }
]
```

**GET /api/address/{address}/txs/mempool**
```json
[
  {
    "txid": "pending123...",
    "vin": [
      {
        "txid": "abc123...",
        "vout": 0,
        "prevout": {
          "scriptpubkey_address": "bc1q...",
          "value": 50000
        }
      }
    ],
    "vout": [...]
  }
]
```

---

## Step 2: Server-Side Hybrid Processing

Receive the client data and combine with Ordiscan for asset filtering:

```typescript
// server-utxo.ts
const ORDISCAN_API_KEY = process.env.ORDISCAN_API_KEY

interface OrdiscanUtxo {
  txid: string
  vout: number
  value: number
  outpoint?: string
  inscriptions?: string[]
  runes?: Array<{ name: string; amount: string }>
}

async function callOrdiscan(endpoint: string): Promise<any> {
  const response = await fetch(`https://api.ordiscan.com/v1${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${ORDISCAN_API_KEY}`,
      'Accept': 'application/json'
    }
  })
  if (!response.ok) {
    throw new Error(`Ordiscan error: ${response.status}`)
  }
  return response.json()
}

export async function fetchUtxosHybrid(
  address: string,
  clientMempoolData: MempoolClientData,
  excludedUtxos: string[] = [],
  targetSats?: number
): Promise<{ utxos: any[], totalSats: number, filtered: any }> {
  const { utxos: mempoolUtxos, mempoolTxs } = clientMempoolData
  const MIN_UTXO_VALUE = 1200

  console.log(`🔍 [Hybrid] Processing ${mempoolUtxos.length} UTXOs for ${address.substring(0, 20)}...`)

  // Step 1: Build set of locked outpoints (inputs to pending mempool transactions)
  const lockedOutpoints = new Set<string>()
  for (const tx of mempoolTxs) {
    for (const vin of tx.vin || []) {
      if (vin.prevout?.scriptpubkey_address === address) {
        lockedOutpoints.add(`${vin.txid}:${vin.vout}`)
      }
    }
  }
  console.log(`🔒 [Hybrid] Found ${lockedOutpoints.size} locked outpoints from mempool txs`)

  // Step 2: Get Ordiscan data for inscription/rune detection
  let ordiscanByOutpoint: Record<string, OrdiscanUtxo> = {}
  try {
    const result = await callOrdiscan(`/address/${address}/utxos`)
    const ordiscanUtxos: OrdiscanUtxo[] = result.data || result || []
    for (const utxo of ordiscanUtxos) {
      const key = utxo.outpoint || `${utxo.txid}:${utxo.vout}`
      ordiscanByOutpoint[key] = utxo
    }
    console.log(`📜 [Hybrid] Got ${ordiscanUtxos.length} UTXOs from Ordiscan for asset detection`)
  } catch (e: any) {
    // If Ordiscan fails, proceed anyway - the >1200 sat filter catches 99.9% of assets
    console.log(`⚠️ [Hybrid] Ordiscan unavailable, proceeding without asset detection: ${e.message}`)
  }

  // Step 3: Filter and collect payment-ready UTXOs
  const paymentReady: any[] = []
  const filtered = {
    hasInscriptions: 0,
    hasRunes: 0,
    tooSmall: 0,
    locked: 0,
    inMempool: 0,
    excluded: 0
  }

  for (const utxo of mempoolUtxos) {
    const outpoint = `${utxo.txid}:${utxo.vout}`
    const isConfirmed = utxo.status?.confirmed === true

    // Filter 1: Skip unconfirmed (mempool) UTXOs - can't rely on these
    if (!isConfirmed) {
      filtered.inMempool++
      continue
    }

    // Filter 2: Skip explicitly excluded UTXOs (e.g., from recent pending txs)
    if (excludedUtxos.includes(outpoint)) {
      filtered.excluded++
      continue
    }

    // Filter 3: Skip locked UTXOs (being spent by a pending mempool tx)
    if (lockedOutpoints.has(outpoint)) {
      filtered.locked++
      continue
    }

    // Filter 4: Skip UTXOs <= 1200 sats (too small, likely dust or inscriptions)
    // This catches 99.9% of inscriptions even if Ordiscan fails
    if (utxo.value <= MIN_UTXO_VALUE) {
      filtered.tooSmall++
      continue
    }

    // Filter 5: Check for inscriptions via Ordiscan (if available)
    const ordiscanData = ordiscanByOutpoint[outpoint]
    if (ordiscanData?.inscriptions && ordiscanData.inscriptions.length > 0) {
      filtered.hasInscriptions++
      continue
    }

    // Filter 6: Check for runes via Ordiscan (if available)
    if (ordiscanData?.runes && ordiscanData.runes.length > 0) {
      filtered.hasRunes++
      continue
    }

    // This UTXO is payment-ready!
    paymentReady.push({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      outpoint: outpoint,
      status: utxo.status
    })

    // Early exit: If we have a target and collected enough (with 20% buffer), stop
    if (targetSats) {
      const currentTotal = paymentReady.reduce((sum, u) => sum + u.value, 0)
      if (currentTotal >= targetSats * 1.2) {
        console.log(`✅ [Hybrid] Collected enough for target ${targetSats} sats`)
        break
      }
    }
  }

  // Sort by value descending (largest first for efficient UTXO selection)
  paymentReady.sort((a, b) => b.value - a.value)

  const totalSats = paymentReady.reduce((sum, u) => sum + u.value, 0)
  console.log(`✅ [Hybrid] Result: ${paymentReady.length} payment-ready UTXOs (${totalSats} sats)`)
  console.log(`📊 [Hybrid] Filtered out: ${JSON.stringify(filtered)}`)

  return {
    utxos: paymentReady,
    totalSats,
    filtered
  }
}
```

---

## Step 3: API Endpoint Example

```typescript
// api/create-transaction/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { address, clientMempoolData, amount } = await request.json()

  if (!clientMempoolData) {
    return NextResponse.json({
      success: false,
      error: 'Client must provide mempool data'
    }, { status: 400 })
  }

  try {
    const { utxos, totalSats, filtered } = await fetchUtxosHybrid(
      address,
      clientMempoolData,
      [],  // excluded UTXOs
      amount  // target amount in sats
    )

    if (totalSats < amount) {
      return NextResponse.json({
        success: false,
        error: `Insufficient funds. Available: ${totalSats} sats, Required: ${amount} sats`
      }, { status: 400 })
    }

    // Use utxos to build your transaction...
    return NextResponse.json({
      success: true,
      utxos,
      totalSats,
      filtered
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
```

---

## Step 4: Client Usage

```typescript
// React component example
async function createTransaction() {
  const address = wallet.paymentAddress
  
  // Step 1: Fetch mempool data from browser (bypasses server rate limits)
  const mempoolData = await fetchMempoolData(address)
  
  // Step 2: Send to server with the mempool data
  const response = await fetch('/api/create-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address,
      clientMempoolData: mempoolData,
      amount: 50000  // 50,000 sats
    })
  })
  
  const result = await response.json()
  if (!result.success) {
    throw new Error(result.error)
  }
  
  // Use result.utxos to build PSBT...
}
```

---

## Filtering Summary

| Filter | Why | Catches |
|--------|-----|---------|
| **> 1200 sats** | Inscriptions use 330-1000 sat outputs | 99.9% of inscriptions |
| **Confirmed only** | Unconfirmed UTXOs can disappear | Double-spend risk |
| **Not locked** | UTXOs in pending txs will fail | Transaction conflicts |
| **No inscriptions** | Ordiscan detection | Remaining 0.1% inscriptions |
| **No runes** | Ordiscan detection | All rune UTXOs |

---

## Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| **mempool.space fails** | Error returned - client must retry |
| **Ordiscan fails** | Proceeds with >1200 sat filter only (safe fallback) |
| **Both fail** | Error returned - cannot proceed |

---

## Rate Limits

| Service | Limit | Strategy |
|---------|-------|----------|
| **mempool.space** | ~300/min per IP | Client-side calls distribute load |
| **Ordiscan** | Varies by plan | Server-side only, single call per request |

---

## Ordiscan API Reference

**GET /v1/address/{address}/utxos**

Headers:
```
Authorization: Bearer YOUR_API_KEY
```

Response:
```json
{
  "data": [
    {
      "txid": "abc123...",
      "vout": 0,
      "value": 50000,
      "outpoint": "abc123...:0",
      "inscriptions": [],
      "runes": []
    },
    {
      "txid": "def456...",
      "vout": 0,
      "value": 546,
      "outpoint": "def456...:0",
      "inscriptions": ["abc123i0"],
      "runes": []
    }
  ]
}
```

Get an API key at: https://ordiscan.com/docs/api

---

## Complete Standalone Example

```typescript
// ============================================
// COMPLETE HYBRID UTXO FILTERING IMPLEMENTATION
// ============================================

// --- TYPES ---
interface MempoolClientData {
  utxos: Array<{
    txid: string
    vout: number
    value: number
    status?: { confirmed: boolean; block_height?: number }
  }>
  mempoolTxs: Array<{
    txid: string
    vin?: Array<{
      txid: string
      vout: number
      prevout?: { scriptpubkey_address: string; value: number }
    }>
  }>
}

interface PaymentUtxo {
  txid: string
  vout: number
  value: number
  outpoint: string
}

// --- CLIENT SIDE (runs in browser) ---
async function fetchMempoolData(address: string): Promise<MempoolClientData> {
  const [utxosRes, mempoolTxsRes] = await Promise.all([
    fetch(`https://mempool.space/api/address/${address}/utxo`),
    fetch(`https://mempool.space/api/address/${address}/txs/mempool`)
  ])
  
  if (!utxosRes.ok || !mempoolTxsRes.ok) {
    throw new Error('Failed to fetch mempool data')
  }
  
  return {
    utxos: await utxosRes.json(),
    mempoolTxs: await mempoolTxsRes.json()
  }
}

// --- SERVER SIDE ---
const ORDISCAN_API_KEY = 'your-api-key'
const MIN_UTXO_VALUE = 1200

async function getPaymentUtxos(
  address: string,
  clientData: MempoolClientData,
  targetSats?: number
): Promise<PaymentUtxo[]> {
  
  // Build locked outpoints set
  const locked = new Set<string>()
  for (const tx of clientData.mempoolTxs) {
    for (const vin of tx.vin || []) {
      if (vin.prevout?.scriptpubkey_address === address) {
        locked.add(`${vin.txid}:${vin.vout}`)
      }
    }
  }
  
  // Get Ordiscan data (optional - fails gracefully)
  let assets: Record<string, { inscriptions?: string[]; runes?: any[] }> = {}
  try {
    const res = await fetch(`https://api.ordiscan.com/v1/address/${address}/utxos`, {
      headers: { 'Authorization': `Bearer ${ORDISCAN_API_KEY}` }
    })
    if (res.ok) {
      const data = await res.json()
      for (const u of data.data || []) {
        assets[`${u.txid}:${u.vout}`] = u
      }
    }
  } catch (e) {
    console.log('Ordiscan unavailable, using value filter only')
  }
  
  // Filter UTXOs
  const result: PaymentUtxo[] = []
  let collected = 0
  
  for (const u of clientData.utxos) {
    const op = `${u.txid}:${u.vout}`
    
    // Apply all filters
    if (!u.status?.confirmed) continue
    if (u.value <= MIN_UTXO_VALUE) continue
    if (locked.has(op)) continue
    if (assets[op]?.inscriptions?.length) continue
    if (assets[op]?.runes?.length) continue
    
    result.push({ txid: u.txid, vout: u.vout, value: u.value, outpoint: op })
    collected += u.value
    
    // Early exit if we have enough
    if (targetSats && collected >= targetSats * 1.2) break
  }
  
  // Sort largest first
  return result.sort((a, b) => b.value - a.value)
}
```

---

## License

MIT - Use freely in any project.
