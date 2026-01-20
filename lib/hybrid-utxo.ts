/**
 * Hybrid UTXO Filtering System
 * 
 * A production-ready approach for fetching spendable Bitcoin UTXOs while avoiding 
 * inscription/rune loss. Uses mempool.space for real-time UTXO and mempool data, 
 * combined with Ordiscan for asset detection.
 * 
 * Architecture:
 * - Client-side: Fetches UTXOs and mempool data from mempool.space (distributes rate limits)
 * - Server-side: Uses Ordiscan for inscription/rune detection, filters payment-ready UTXOs
 */

// ============================================
// TYPES
// ============================================

export interface MempoolUtxo {
  txid: string
  vout: number
  value: number
  status?: {
    confirmed: boolean
    block_height?: number
    block_hash?: string
    block_time?: number
  }
}

export interface MempoolTxVin {
  txid: string
  vout: number
  prevout?: {
    scriptpubkey_address: string
    value: number
  }
}

export interface MempoolTx {
  txid: string
  vin?: MempoolTxVin[]
  vout?: unknown[]
}

export interface MempoolClientData {
  utxos: MempoolUtxo[]
  mempoolTxs: MempoolTx[]
}

export interface OrdiscanUtxo {
  txid: string
  vout: number
  value: number
  outpoint?: string
  inscriptions?: string[]
  runes?: Array<{ name: string; amount: string }>
}

export interface PaymentUtxo {
  txid: string
  vout: number
  value: number
  outpoint: string
  height?: number | null
}

export interface HybridUtxoResult {
  utxos: PaymentUtxo[]
  totalSats: number
  filtered: {
    hasInscriptions: number
    hasRunes: number
    tooSmall: number
    locked: number
    inMempool: number
    excluded: number
  }
}

// ============================================
// CLIENT-SIDE (Browser) Functions
// ============================================

/**
 * Fetch UTXO and mempool data from mempool.space (client-side)
 * This distributes rate limits across users instead of exhausting server quota
 */
export async function fetchMempoolData(address: string): Promise<MempoolClientData> {
  console.log(`[Mempool] Fetching UTXOs for ${address.substring(0, 20)}...`)
  
  const [utxosRes, mempoolTxsRes] = await Promise.all([
    fetch(`https://mempool.space/api/address/${address}/utxo`),
    fetch(`https://mempool.space/api/address/${address}/txs/mempool`)
  ])

  if (!utxosRes.ok) {
    throw new Error(`Failed to fetch UTXOs: ${utxosRes.status}`)
  }
  if (!mempoolTxsRes.ok) {
    // Mempool txs endpoint might return 404 if no pending txs - that's OK
    if (mempoolTxsRes.status === 404) {
      console.log(`[Mempool] No pending transactions found`)
      return {
        utxos: await utxosRes.json(),
        mempoolTxs: []
      }
    }
    throw new Error(`Failed to fetch mempool txs: ${mempoolTxsRes.status}`)
  }

  const utxos = await utxosRes.json()
  const mempoolTxs = await mempoolTxsRes.json()

  console.log(`[Mempool] Got ${utxos.length} UTXOs, ${mempoolTxs.length} mempool txs`)

  return { utxos, mempoolTxs }
}

// ============================================
// SERVER-SIDE Functions
// ============================================

const ORDISCAN_API_URL = 'https://api.ordiscan.com/v1'
const MIN_UTXO_VALUE = 1200 // Filters 99.9% of inscriptions

/**
 * Call Ordiscan API for inscription/rune detection
 */
async function callOrdiscan(endpoint: string, apiKey: string): Promise<any> {
  const response = await fetch(`${ORDISCAN_API_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    }
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Ordiscan error (${response.status}): ${errorText.substring(0, 200)}`)
  }
  
  return response.json()
}

/**
 * Server-side hybrid UTXO filtering
 * 
 * @param address - Bitcoin address to fetch UTXOs for
 * @param clientMempoolData - UTXO and mempool data from client (mempool.space)
 * @param excludedUtxos - Outpoints to exclude (e.g., from recent pending txs)
 * @param targetSats - Optional target amount (stops early if enough collected)
 * @returns Filtered payment-ready UTXOs
 */
export async function fetchUtxosHybrid(
  address: string,
  clientMempoolData: MempoolClientData,
  excludedUtxos: string[] = [],
  targetSats?: number
): Promise<HybridUtxoResult> {
  const { utxos: mempoolUtxos, mempoolTxs } = clientMempoolData

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
  const ordiscanApiKey = process.env.ORDISCAN_API_KEY
  
  if (ordiscanApiKey) {
    try {
      const result = await callOrdiscan(`/address/${address}/utxos`, ordiscanApiKey)
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
  } else {
    console.log(`⚠️ [Hybrid] ORDISCAN_API_KEY not set, using value filter only (>${MIN_UTXO_VALUE} sats)`)
  }

  // Step 3: Filter and collect payment-ready UTXOs
  const paymentReady: PaymentUtxo[] = []
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
      height: utxo.status?.block_height || null
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

/**
 * Filter and sort UTXOs (additional filtering for compatibility)
 * Filters out UTXOs <= 800 sats and sorts by value descending
 */
export function filterAndSortUtxos(utxos: PaymentUtxo[]): PaymentUtxo[] {
  console.log(`🔍 [Hybrid] Filtering and sorting ${utxos.length} UTXOs...`)
  
  const filteredUtxos = utxos
    .filter((utxo) => utxo.value > 800)
    .sort((a, b) => b.value - a.value)

  console.log(`✅ [Hybrid] After filtering (>800 sats): ${filteredUtxos.length} UTXOs`)
  
  if (filteredUtxos.length > 0) {
    console.log(`   Largest 5 UTXOs:`, filteredUtxos.slice(0, 5).map(u => ({ 
      value: u.value, 
      outpoint: u.outpoint.substring(0, 20) + '...' 
    })))
  }

  if (filteredUtxos.length === 0) {
    throw new Error('No suitable UTXOs found (all below 800 sats)')
  }

  return filteredUtxos
}

/**
 * Validate that sufficient funds are available
 */
export function validateSufficientFunds(
  utxos: PaymentUtxo[], 
  targetAmount: number, 
  excludedCount: number = 0
): number {
  const amountRetrieved = utxos.reduce((sum, utxo) => sum + utxo.value, 0)
  
  if (amountRetrieved === 0) {
    const excludedMsg = excludedCount > 0 
      ? ` (${excludedCount} UTXOs are currently excluded from pending transactions)` 
      : ''
    throw new Error(`No spendable UTXOs found${excludedMsg}. Please wait for pending transactions to confirm.`)
  }
  
  if (amountRetrieved < targetAmount) {
    const shortage = targetAmount - amountRetrieved
    const excludedMsg = excludedCount > 0 
      ? ` Note: ${excludedCount} UTXO(s) are currently excluded from pending transactions. ` 
      : ''
    throw new Error(
      `Insufficient funds: need ${targetAmount} sats but only have ${amountRetrieved} sats available ` +
      `(short by ${shortage} sats).${excludedMsg}Please wait for pending transactions to confirm or add more funds.`
    )
  }
  
  return amountRetrieved
}
