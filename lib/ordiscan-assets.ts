/**
 * Ordiscan-based wallet asset fetching
 * 
 * Uses Ordiscan API to fetch inscriptions and runes for wallet addresses.
 * This provides more reliable asset detection than Subfrost's ord_output checks.
 */

import type { CategorisedWalletAssets, BaseUtxo, InscriptionUtxo, RuneBearingUtxo, PendingUtxo, ProcessedRuneBalance } from './sandshrew'

const ORDISCAN_API_URL = 'https://api.ordiscan.com/v1'

export interface OrdiscanRune {
  name: string
  amount?: string  // Some APIs use "amount"
  balance?: string  // Ordiscan uses "balance"
  divisibility?: number
  symbol?: string
}

export interface OrdiscanUtxoResponse {
  txid: string
  vout: number
  value: number
  outpoint?: string
  inscriptions?: string[]
  runes?: OrdiscanRune[]
  block_height?: number
  confirmed?: boolean
}

export interface OrdiscanAddressResponse {
  data?: OrdiscanUtxoResponse[]
  // Some responses might return array directly
}

/**
 * Call Ordiscan API for address UTXOs with inscription/rune data
 */
async function callOrdiscan(endpoint: string, apiKey: string): Promise<OrdiscanUtxoResponse[]> {
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
  
  const data: OrdiscanAddressResponse | OrdiscanUtxoResponse[] = await response.json()
  
  // Handle both response formats
  if (Array.isArray(data)) {
    return data
  }
  if (data.data && Array.isArray(data.data)) {
    return data.data
  }
  
  return []
}

/**
 * Determine if a rune is an alkane based on its name
 * Uses the same logic as sandshrew.ts
 */
function isAlkane(runeName: string, blockHeight?: number | null): boolean {
  const MAINNET_RUNES_ACTIVATION_BLOCK = 840_000
  
  // If block height is before runes activation, it's an alkane
  if (blockHeight !== null && blockHeight !== undefined && blockHeight < MAINNET_RUNES_ACTIVATION_BLOCK) {
    return true
  }
  
  // Check name/symbol for alkane indicators
  const upperName = runeName.trim().toUpperCase()
  return upperName.includes('ALK') || upperName.includes('ALKANE')
}

/**
 * Convert Ordiscan rune format to ProcessedRuneBalance format
 */
function processRuneBalance(
  rune: OrdiscanRune,
  outpoint: string,
  blockHeight?: number | null
): ProcessedRuneBalance | null {
  if (!rune.name) return null
  
  const isAlkaneRune = isAlkane(rune.name, blockHeight)
  const category: 'rune' | 'alkane' = isAlkaneRune ? 'alkane' : 'rune'
  
  // Parse amount/balance (Ordiscan uses "balance", some APIs use "amount")
  let balance: bigint
  let rawBalance: string
  try {
    // Ordiscan returns "balance", but support "amount" for compatibility
    rawBalance = rune.balance || rune.amount || '0'
    if (!rawBalance || rawBalance === '0') {
      return null
    }
    if (rawBalance.startsWith('0x') || rawBalance.startsWith('0X')) {
      balance = BigInt(rawBalance)
    } else {
      balance = BigInt(rawBalance)
    }
  } catch {
    return null
  }
  
  const divisibility = rune.divisibility || 0
  
  // Format balance with divisibility
  const balanceFormatted = formatRuneBalance(balance, divisibility)
  
  // Ordiscan doesn't provide block/tx in Sandshrew format, use placeholders
  // The UI should work with name-based identification
  return {
    category,
    rawId: {
      block: '0x0',
      tx: '0x0',
    },
    block: null,
    txIndex: null,
    name: rune.name,
    spacedName: rune.name,
    symbol: rune.symbol,
    divisibility,
    spacers: 0,
    rawBalance,
    balance,
    balanceFormatted,
  }
}

/**
 * Format rune balance with divisibility
 */
function formatRuneBalance(balance: bigint, divisibility: number): string {
  if (divisibility === 0) {
    return balance.toString()
  }
  
  const divisor = BigInt(10 ** divisibility)
  const whole = balance / divisor
  const fraction = balance % divisor
  
  if (fraction === BigInt(0)) {
    return whole.toString()
  }
  
  const fractionString = fraction
    .toString()
    .padStart(divisibility, '0')
    .replace(/0+$/, '')
  
  return `${whole.toString()}.${fractionString}`
}

/**
 * Fetch wallet assets using Ordiscan for inscription/rune detection
 * 
 * @param address - Bitcoin address to fetch assets for
 * @param clientMempoolData - Optional: Client-provided mempool data. If not provided, uses Subfrost for UTXO data.
 * @returns Categorised wallet assets
 */
export async function fetchWalletAssetsWithOrdiscan(
  address: string,
  clientMempoolData?: { utxos: Array<{ txid: string; vout: number; value: number; status?: { confirmed: boolean; block_height?: number } }> }
): Promise<CategorisedWalletAssets> {
  const ordiscanApiKey = process.env.ORDISCAN_API_KEY
  
  if (!ordiscanApiKey) {
    throw new Error('ORDISCAN_API_KEY environment variable is not set')
  }

  console.log(`🔍 [Ordiscan] Fetching assets for ${address.substring(0, 20)}...`)

  // Step 1: Fetch Ordiscan data (inscriptions and runes)
  let ordiscanUtxos: OrdiscanUtxoResponse[] = []
  try {
    ordiscanUtxos = await callOrdiscan(`/address/${address}/utxos`, ordiscanApiKey)
    console.log(`📜 [Ordiscan] Got ${ordiscanUtxos.length} UTXOs with asset data`)
    
    // Debug: Count runes
    const runeCount = ordiscanUtxos.reduce((sum, utxo) => sum + (utxo.runes?.length || 0), 0)
    if (runeCount > 0) {
      console.log(`🔮 [Ordiscan] Found ${runeCount} rune entries across ${ordiscanUtxos.filter(u => u.runes && u.runes.length > 0).length} UTXOs`)
    }
  } catch (error) {
    console.error('[Ordiscan] Failed to fetch Ordiscan data:', error)
    throw new Error(`Failed to fetch Ordiscan data: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Step 2: Get UTXO data (from client mempool data or fetch from mempool.space)
  let utxoData: Array<{ txid: string; vout: number; value: number; height?: number | null; confirmed: boolean }> = []
  
  if (clientMempoolData) {
    // Use client-provided mempool data
    utxoData = clientMempoolData.utxos.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      height: utxo.status?.block_height || null,
      confirmed: utxo.status?.confirmed || false,
    }))
    console.log(`📊 [Ordiscan] Using ${utxoData.length} UTXOs from client mempool data`)
  } else {
    // Fetch UTXO data from mempool.space (server-side)
    console.log(`📊 [Ordiscan] Fetching UTXOs from mempool.space for ${address.substring(0, 20)}...`)
    try {
      const { fetchMempoolData } = await import('./hybrid-utxo')
      const mempoolData = await fetchMempoolData(address)
      utxoData = mempoolData.utxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        height: utxo.status?.block_height || null,
        confirmed: utxo.status?.confirmed || false,
      }))
      console.log(`📊 [Ordiscan] Using ${utxoData.length} UTXOs from mempool.space`)
    } catch (mempoolError) {
      console.error('[Ordiscan] Failed to fetch mempool.space data:', mempoolError)
      throw new Error(`Failed to fetch UTXO data from mempool.space: ${mempoolError instanceof Error ? mempoolError.message : String(mempoolError)}`)
    }
  }

  // Step 3: Create outpoint map for Ordiscan data
  const ordiscanByOutpoint = new Map<string, OrdiscanUtxoResponse>()
  for (const utxo of ordiscanUtxos) {
    const key = utxo.outpoint || `${utxo.txid}:${utxo.vout}`
    ordiscanByOutpoint.set(key, utxo)
  }

  // Step 4: Categorize UTXOs
  const spendable: BaseUtxo[] = []
  const inscriptions: InscriptionUtxo[] = []
  const runes: RuneBearingUtxo[] = []
  const alkanes: RuneBearingUtxo[] = []
  const pending: PendingUtxo[] = []

  for (const utxo of utxoData) {
    const outpoint = `${utxo.txid}:${utxo.vout}`
    const ordiscanData = ordiscanByOutpoint.get(outpoint)
    
    const baseUtxo: BaseUtxo = {
      outpoint,
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      height: utxo.height ?? null,
    }

    // Check for inscriptions
    const inscriptionIds = ordiscanData?.inscriptions || []
    const hasInscriptions = inscriptionIds.length > 0

    // Check for runes
    const runeData = ordiscanData?.runes || []
    const hasRunes = runeData.length > 0

    // Process rune balances
    const processedRunes: ProcessedRuneBalance[] = []
    const runesByCategory: { rune: ProcessedRuneBalance[]; alkane: ProcessedRuneBalance[] } = {
      rune: [],
      alkane: [],
    }

    if (hasRunes) {
      console.log(`🔮 [Ordiscan] Processing ${runeData.length} runes for UTXO ${outpoint}`)
    }

    for (const rune of runeData) {
      const processed = processRuneBalance(rune, outpoint, utxo.height)
      if (processed) {
        processedRunes.push(processed)
        if (processed.category === 'alkane') {
          runesByCategory.alkane.push(processed)
        } else {
          runesByCategory.rune.push(processed)
        }
        console.log(`   ✅ Processed rune: ${processed.name} (${processed.category}), balance: ${processed.rawBalance}`)
      } else {
        console.warn(`   ⚠️ Failed to process rune: ${JSON.stringify(rune)}`)
      }
    }

    if (!utxo.confirmed) {
      // Pending UTXO
      pending.push({
        ...baseUtxo,
        status: 'pending',
        inscriptions: hasInscriptions ? inscriptionIds : undefined,
        runeBalances: processedRunes.length > 0 ? processedRunes : undefined,
      })
    } else if (hasInscriptions || hasRunes) {
      // Asset UTXO (has inscriptions/runes)
      
      // Add to inscriptions if has inscriptions
      if (hasInscriptions) {
        inscriptions.push({
          ...baseUtxo,
          inscriptions: inscriptionIds,
        })
      }

      // Add to runes/alkanes if has runes
      if (runesByCategory.rune.length > 0) {
        runes.push({
          ...baseUtxo,
          category: 'rune',
          runeBalances: runesByCategory.rune,
        })
        console.log(`   ✅ Added to runes array: ${outpoint} with ${runesByCategory.rune.length} rune(s)`)
      }

      if (runesByCategory.alkane.length > 0) {
        alkanes.push({
          ...baseUtxo,
          category: 'alkane',
          runeBalances: runesByCategory.alkane,
        })
        console.log(`   ✅ Added to alkanes array: ${outpoint} with ${runesByCategory.alkane.length} alkane(s)`)
      }

      // For small UTXOs (< 2000 sats) with inscriptions, also add to spendable
      if (utxo.value < 2000 && hasInscriptions) {
        spendable.push({
          ...baseUtxo,
          inscriptions: inscriptionIds,
        })
      }
    } else {
      // Clean spendable UTXO (no inscriptions/runes)
      spendable.push(baseUtxo)
    }
  }

  console.log(`✅ [Ordiscan] Categorized: ${spendable.length} spendable, ${inscriptions.length} inscriptions, ${runes.length} runes, ${alkanes.length} alkanes, ${pending.length} pending`)

  // Get block heights (try to get from first confirmed UTXO or use null)
  let ordHeight: number | undefined
  let metashrewHeight: number | undefined
  
  const confirmedUtxos = utxoData.filter(u => u.confirmed && u.height)
  if (confirmedUtxos.length > 0) {
    const maxHeight = Math.max(...confirmedUtxos.map(u => u.height!).filter((h): h is number => h !== null))
    ordHeight = maxHeight
    metashrewHeight = maxHeight
  }

  // Build raw result in SandshrewBalancesResult format
  const rawAssets: any[] = []
  
  // Add inscriptions to assets
  for (const ins of inscriptions) {
    rawAssets.push({
      outpoint: ins.outpoint,
      txid: ins.txid,
      vout: ins.vout,
      value: ins.value,
      height: ins.height,
      inscriptions: ins.inscriptions,
      runes: null,
    })
  }
  
  // Add runes to assets
  for (const rune of [...runes, ...alkanes]) {
    rawAssets.push({
      outpoint: rune.outpoint,
      txid: rune.txid,
      vout: rune.vout,
      value: rune.value,
      height: rune.height,
      inscriptions: null,
      runes: rune.runeBalances.map(r => ({
        rune: {
          id: r.rawId,
          name: r.name,
          spacedName: r.spacedName,
          divisibility: r.divisibility,
          spacers: r.spacers,
          symbol: r.symbol,
        },
        balance: r.rawBalance,
      })),
    })
  }
  
  return {
    address,
    ordHeight,
    metashrewHeight,
    spendable,
    inscriptions,
    runes,
    alkanes,
    pending,
    raw: {
      spendable: spendable.map(u => ({
        outpoint: u.outpoint,
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        height: u.height,
        inscriptions: 'inscriptions' in u && u.inscriptions ? u.inscriptions : null,
        runes: null,
      })),
      assets: rawAssets.length > 0 ? rawAssets : undefined,
      pending: pending.length > 0 ? pending.map(u => ({
        outpoint: u.outpoint,
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        height: u.height,
        status: u.status,
        inscriptions: u.inscriptions || null,
        runes: u.runeBalances?.map(r => ({
          rune: {
            id: r.rawId,
            name: r.name,
            spacedName: r.spacedName,
            divisibility: r.divisibility,
            spacers: r.spacers,
            symbol: r.symbol,
          },
          balance: r.rawBalance,
        })) || null,
      })) : undefined,
      ordHeight,
      metashrewHeight,
    } as any,
  }
}
