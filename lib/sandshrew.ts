const DEFAULT_SANDSHREW_URL = process.env.SANDSHREW_URL || 'https://mainnet.sandshrew.io/v2'
const SANDSHREW_DEVELOPER_KEY = process.env.SANDSHREW_DEVELOPER_KEY

export interface SandshrewRuneIdentifier {
  block: string
  tx: string
}

export interface SandshrewRuneMetadata {
  id: SandshrewRuneIdentifier
  name?: string
  spacedName?: string
  divisibility?: number
  spacers?: number
  symbol?: string
}

export interface SandshrewRuneBalance {
  rune: SandshrewRuneMetadata
  balance: string
}

export interface SandshrewSpendableUtxo {
  outpoint: string
  value?: number | string
  height?: number | string | null
}

export interface SandshrewAssetUtxo extends SandshrewSpendableUtxo {
  inscriptions?: string[] | string | null
  runes?: SandshrewRuneBalance[] | null
}

export interface SandshrewPendingUtxo extends SandshrewAssetUtxo {
  status?: string
}

export interface SandshrewBalancesResult {
  spendable?: SandshrewSpendableUtxo[]
  assets?: SandshrewAssetUtxo[]
  pending?: SandshrewPendingUtxo[]
  ordHeight?: number
  metashrewHeight?: number
}

export interface SandshrewEsploraTxOutput {
  scriptpubkey: string
  scriptpubkey_asm?: string
  scriptpubkey_type?: string
  scriptpubkey_address?: string
  value: number
}

export interface SandshrewEsploraTx {
  txid: string
  version: number
  locktime: number
  vin: unknown[]
  vout: SandshrewEsploraTxOutput[]
  size?: number
  weight?: number
  fee?: number
  status?: {
    confirmed: boolean
    block_height?: number
    block_hash?: string
    block_time?: number
  }
}

export interface SandshrewEsploraTxResponse {
  jsonrpc: string
  id: string
  result?: SandshrewEsploraTx
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface SandshrewBalancesResponse {
  jsonrpc: string
  id: string
  result?: SandshrewBalancesResult
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface BaseUtxo {
  outpoint: string
  txid: string
  vout: number
  value: number
  height: number | null
}

export interface InscriptionUtxo extends BaseUtxo {
  inscriptions: string[]
}

export type RuneCategory = 'rune' | 'alkane'

export interface ProcessedRuneBalance {
  category: RuneCategory
  rawId: SandshrewRuneIdentifier
  block: number | null
  txIndex: number | null
  name: string | undefined
  spacedName: string | undefined
  symbol: string | undefined
  divisibility: number
  spacers: number
  rawBalance: string
  balance: bigint
  balanceFormatted: string
}

export interface RuneBearingUtxo extends BaseUtxo {
  category: RuneCategory
  runeBalances: ProcessedRuneBalance[]
}

export interface PendingUtxo extends BaseUtxo {
  status?: string
  inscriptions?: string[]
  runeBalances?: ProcessedRuneBalance[]
}

export interface CategorisedWalletAssets {
  address: string
  ordHeight?: number
  metashrewHeight?: number
  spendable: BaseUtxo[]
  inscriptions: InscriptionUtxo[]
  runes: RuneBearingUtxo[]
  alkanes: RuneBearingUtxo[]
  pending: PendingUtxo[]
  raw: SandshrewBalancesResult
}

const MAINNET_RUNES_ACTIVATION_BLOCK = 840_000

function requireSandshrewKey(): string {
  if (!SANDSHREW_DEVELOPER_KEY || !SANDSHREW_DEVELOPER_KEY.trim()) {
    throw new Error('SANDSHREW_DEVELOPER_KEY environment variable is not set')
  }
  return SANDSHREW_DEVELOPER_KEY.trim()
}

function buildSandshrewEndpoint(): string {
  const key = requireSandshrewKey()
  const base = DEFAULT_SANDSHREW_URL.replace(/\/+$/, '')
  return `${base}/${key}`
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function parseOutpoint(outpoint: string): { txid: string; vout: number } {
  const [txid, vout] = outpoint.split(':')
  return {
    txid: txid || '',
    vout: Number.parseInt(vout || '0', 10) || 0,
  }
}

function normaliseBaseUtxo(entry: SandshrewSpendableUtxo): BaseUtxo {
  const value = toNumber(entry.value) ?? 0
  const height = toNumber(entry.height)
  const { txid, vout } = parseOutpoint(entry.outpoint)

  return {
    outpoint: entry.outpoint,
    txid,
    vout,
    value,
    height,
  }
}

function normaliseInscriptions(value: SandshrewAssetUtxo['inscriptions']): string[] {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
  }

  if (typeof value === 'string') {
    return value
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
  }

  return []
}

function parseHexToBigInt(value: string): bigint {
  const trimmed = value.trim()
  if (/^0x/i.test(trimmed)) {
    return BigInt(trimmed)
  }
  return BigInt(`0x${trimmed}`)
}

function safeParseHexInt(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  try {
    return Number.parseInt(value, 16)
  } catch {
    return null
  }
}

function formatWithDivisibility(amount: bigint, divisibility: number): string {
  if (divisibility <= 0) {
    return amount.toString()
  }

  let base = BigInt(1)
  for (let index = 0; index < divisibility; index += 1) {
    base *= BigInt(10)
  }

  const whole = amount / base
  const fraction = amount % base

  if (fraction === BigInt(0)) {
    return whole.toString()
  }

  const fractionString = fraction
    .toString()
    .padStart(divisibility, '0')
    .replace(/0+$/, '')

  return `${whole.toString()}.${fractionString}`
}

function determineRuneCategory(rune: SandshrewRuneMetadata): RuneCategory {
  const blockNumber = safeParseHexInt(rune.id?.block)
  if (blockNumber !== null && blockNumber < MAINNET_RUNES_ACTIVATION_BLOCK) {
    return 'alkane'
  }

  const symbol = rune.symbol?.trim().toUpperCase()
  const name = rune.name?.trim().toUpperCase()

  if (symbol?.includes('ALK') || name?.includes('ALKANE')) {
    return 'alkane'
  }

  return 'rune'
}

function normaliseRuneBalances(
  balances?: SandshrewRuneBalance[] | null,
): ProcessedRuneBalance[] {
  if (!balances || !Array.isArray(balances)) {
    return []
  }

  return balances
    .map((entry) => {
      try {
        const balanceBigInt = parseHexToBigInt(entry.balance)
        const category = determineRuneCategory(entry.rune)
        const divisibility = Number.isFinite(entry.rune.divisibility)
          ? (entry.rune.divisibility as number)
          : 0

        return {
          category,
          rawId: entry.rune.id,
          block: safeParseHexInt(entry.rune.id?.block),
          txIndex: safeParseHexInt(entry.rune.id?.tx),
          name: entry.rune.name,
          spacedName: entry.rune.spacedName,
          symbol: entry.rune.symbol,
          divisibility,
          spacers: entry.rune.spacers ?? 0,
          rawBalance: entry.balance,
          balance: balanceBigInt,
          balanceFormatted: formatWithDivisibility(balanceBigInt, divisibility),
        } satisfies ProcessedRuneBalance
      } catch (error) {
        console.warn('[Sandshrew] Failed to normalise rune balance', error)
        return null
      }
    })
    .filter((entry): entry is ProcessedRuneBalance => Boolean(entry))
}

export function categoriseWalletAssets(
  address: string,
  result: SandshrewBalancesResult,
): CategorisedWalletAssets {
  const spendable = (result.spendable ?? []).map(normaliseBaseUtxo)

  const inscriptions: InscriptionUtxo[] = []
  const runeBuckets: Record<RuneCategory, RuneBearingUtxo[]> = {
    rune: [],
    alkane: [],
  }

  for (const asset of result.assets ?? []) {
    const base = normaliseBaseUtxo(asset)
    const inscriptionIds = normaliseInscriptions(asset.inscriptions)
    if (inscriptionIds.length > 0) {
      inscriptions.push({
        ...base,
        inscriptions: inscriptionIds,
      })
    }

    const runeBalances = normaliseRuneBalances(asset.runes)
    if (runeBalances.length > 0) {
      const balancesByCategory = runeBalances.reduce<Map<RuneCategory, ProcessedRuneBalance[]>>((acc, balance) => {
        const bucket = acc.get(balance.category) ?? []
        bucket.push(balance)
        acc.set(balance.category, bucket)
        return acc
      }, new Map())

      for (const [category, balances] of Array.from(balancesByCategory.entries())) {
        runeBuckets[category as RuneCategory].push({
          ...base,
          category: category as RuneCategory,
          runeBalances: balances,
        })
      }
    }
  }

  const pending: PendingUtxo[] = (result.pending ?? []).map((pendingEntry) => {
    const base = normaliseBaseUtxo(pendingEntry)
    return {
      ...base,
      status: pendingEntry.status,
      inscriptions: normaliseInscriptions(pendingEntry.inscriptions),
      runeBalances: normaliseRuneBalances(pendingEntry.runes),
    }
  })

  return {
    address,
    ordHeight: result.ordHeight,
    metashrewHeight: result.metashrewHeight,
    spendable,
    inscriptions,
    runes: runeBuckets.rune,
    alkanes: runeBuckets.alkane,
    pending,
    raw: result,
  }
}

async function fetchSubfrostBatchRpc(
  requests: Array<{ method: string; params: any[]; id: string }>,
  apiKey: string,
  apiUrl: string,
): Promise<any[]> {
  // JSON-RPC 2.0 batch request - send array of requests
  const batchRequest = requests.map((req, index) => ({
    jsonrpc: '2.0',
    id: req.id || `batch_${index}`,
    method: req.method,
    params: req.params,
  }))

  console.log(`📤 Subfrost Batch RPC: ${requests.length} calls to ${apiUrl}`)

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
    body: JSON.stringify(batchRequest),
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
      body: JSON.stringify(batchRequest),
      cache: 'no-store',
    })
  }

  const responseText = await response.text()

  if (!response.ok) {
    throw new Error(`Subfrost batch RPC failed (${response.status}): ${responseText.substring(0, 200)}`)
  }

  let data
  try {
    data = JSON.parse(responseText)
  } catch (parseError) {
    throw new Error(`Subfrost batch RPC returned invalid JSON: ${responseText.substring(0, 200)}`)
  }

  // Batch responses should be an array
  if (!Array.isArray(data)) {
    throw new Error(`Subfrost batch RPC returned non-array response`)
  }

  // Return results in same order as requests
  const results = data.map((item: any, index: number) => {
    if (item.error) {
      // Per Subfrost guide: errors mean no ordinals data (clean UTXO) - return null
      return null
    }
    
    // Check if result is "JSON API disabled" string (treat as clean)
    if (typeof item.result === 'string' && item.result.includes('disabled')) {
      return null
    }
    
    return item.result
  })
  
  // Log summary
  const successCount = results.filter(r => r !== null && r !== undefined).length
  const errorCount = results.filter(r => r === null || r === undefined).length
  if (errorCount > 0 && successCount > 0) {
    console.log(`📊 Batch RPC: ${successCount} succeeded, ${errorCount} clean/errors out of ${results.length} total`)
  }
  
  return results
}

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

  console.log(`📤 Subfrost RPC: ${method} to ${apiUrl}`)

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

  console.log(`📥 Response status: ${response.status} ${response.statusText}`)

  // Fallback to header authentication if URL path fails
  if (!response.ok && (response.status === 400 || response.status === 401 || response.status === 404)) {
    console.log(`⚠️ URL path auth failed (${response.status}), trying header method...`)
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
    console.log(`📥 Header auth response status: ${response.status} ${response.statusText}`)
  }

  // Get response text first to check for errors
  const responseText = await response.text()
  
  if (!response.ok) {
    // Check if it's an HTML error page or plain text error
    if (responseText.trim().startsWith('<') || responseText.includes('endpoint does not exist') || responseText.includes('not found')) {
      throw new Error(`Subfrost ${method} endpoint error (${response.status}): ${responseText.substring(0, 300)}`)
    }
    throw new Error(`Subfrost ${method} failed (${response.status}): ${responseText.substring(0, 200)}`)
  }

  // Check content type to ensure it's JSON
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json') && !responseText.trim().startsWith('{')) {
    throw new Error(`Subfrost ${method} returned non-JSON response (${contentType}): ${responseText.substring(0, 200)}`)
  }

  let data
  try {
    data = JSON.parse(responseText)
  } catch (parseError) {
    throw new Error(`Subfrost ${method} returned invalid JSON: ${responseText.substring(0, 200)}`)
  }

  // Check for JSON-RPC error
  if (data.error) {
    const errorMsg = data.error.message || data.error.code || JSON.stringify(data.error)
    throw new Error(`Subfrost ${method} RPC error: ${errorMsg}`)
  }

  // Validate that result exists
  if (data.result === undefined || data.result === null) {
    throw new Error(`Subfrost ${method} returned null/undefined result. Response: ${JSON.stringify(data).substring(0, 200)}`)
  }

  return data.result
}

export async function fetchSandshrewBalances(
  address: string,
  requestOptions?: RequestInit,
): Promise<SandshrewBalancesResult> {
  // Use Subfrost instead of Sandshrew
  const SUBFROST_API_URL = process.env.SUBFROST_URL || 'https://mainnet.subfrost.io/v4'
  const rawApiKey = process.env.SUBFROST_API_KEY || ''
  const SUBFROST_API_KEY = rawApiKey.endsWith('%') ? rawApiKey.slice(0, -1) : rawApiKey

  if (!SUBFROST_API_KEY) {
    throw new Error('SUBFROST_API_KEY environment variable is not set')
  }

  console.log(`🔍 Fetching UTXOs via Subfrost for: ${address.substring(0, 20)}...`)

  // Step 1: Get all UTXOs - correct method name is esplora_address::utxo (with double colons)
  const rawUtxos = await fetchSubfrostRpc('esplora_address::utxo', [address], SUBFROST_API_KEY, SUBFROST_API_URL)
  
  // Validate that we got an array
  if (!Array.isArray(rawUtxos)) {
    console.error('❌ Subfrost returned non-array result:', typeof rawUtxos, rawUtxos)
    throw new Error(`Subfrost esplora_addressutxo returned invalid data type: expected array, got ${typeof rawUtxos}`)
  }
  
  console.log(`📊 Found ${rawUtxos.length} total UTXOs`)

  // Step 2: Get block heights
  let ordHeight = 0
  let metashrewHeight = 0
  try {
    ordHeight = (await fetchSubfrostRpc('ord_blockheight', [], SUBFROST_API_KEY, SUBFROST_API_URL)) || 0
    metashrewHeight = ordHeight // Subfrost uses ord_blockheight for both
    console.log(`📏 Block heights - ord: ${ordHeight}, metashrew: ${metashrewHeight}`)
  } catch (error) {
    console.warn('Could not fetch block height, continuing without it')
  }

  // Step 3: Prepare UTXOs and collect outpoints for batch ord_output checks
  const utxosToProcess: Array<{
    utxo: any
    txid: string
    vout: number
    outpoint: string
    height: number | null
    value: number
    isConfirmed: boolean
  }> = []

  // First pass: validate and prepare UTXOs
  for (const utxo of rawUtxos || []) {
    const txid = utxo.txid || ''
    const voutRaw = utxo.vout
    const height = utxo.status?.block_height || null
    const value = utxo.value || 0
    
    // Validate that we have valid txid and vout
    if (!txid || txid === 'undefined' || typeof txid !== 'string' || txid.length === 0) {
      console.warn('⚠️ Skipping UTXO with invalid txid:', JSON.stringify(utxo))
      continue
    }
    
    if (voutRaw === null || voutRaw === undefined || (typeof voutRaw === 'string' && voutRaw === 'undefined')) {
      console.warn('⚠️ Skipping UTXO with invalid vout:', JSON.stringify(utxo))
      continue
    }
    
    const vout = typeof voutRaw === 'number' ? voutRaw : parseInt(String(voutRaw), 10)
    if (isNaN(vout) || vout < 0) {
      console.warn('⚠️ Skipping UTXO with invalid vout (not a number):', JSON.stringify(utxo))
      continue
    }
    
    const outpoint = `${txid}:${vout}`
    const isConfirmed = height && (ordHeight === 0 || height <= ordHeight)

    utxosToProcess.push({
      utxo,
      txid,
      vout,
      outpoint,
      height,
      value,
      isConfirmed,
    })
  }

  // Step 4: Check each UTXO for ordinals data using ord_output (per Subfrost API guide)
  // Note: ord_output doesn't support batch RPC, so we call individually
  console.log(`🔍 Checking ${utxosToProcess.length} UTXOs for ordinals data (individual calls)...`)
  const addressOrdData = new Map<string, { inscriptions: string[], runes: any[] }>()
  
  // Process in smaller batches with Promise.all for parallelization (but not true batch RPC)
  const concurrency = 10 // Process 10 at a time to avoid overwhelming the API
  for (let i = 0; i < utxosToProcess.length; i += concurrency) {
    const batch = utxosToProcess.slice(i, i + concurrency)
    
    const promises = batch.map(async (item) => {
      try {
        const result = await fetchSubfrostRpc('ord_output', [item.outpoint], SUBFROST_API_KEY, SUBFROST_API_URL)
        
        // Per guide: null result or error means clean UTXO (no ordinals data)
        // Only process if result exists and is not null
        if (result && result !== null && typeof result === 'object') {
          // ord_output returns: { inscriptions: string[], runes: {} or [], ... }
          const inscriptions = result.inscriptions || []
          const runes = result.runes || {}
          const protorunes = result.protorunes || []
          
          // Check for inscriptions (array of strings)
          const hasInscriptions = Array.isArray(inscriptions) && inscriptions.length > 0
          
          // Check for runes (can be object {} or array [])
          const hasRunes = (Array.isArray(runes) && runes.length > 0) || 
                          (typeof runes === 'object' && runes !== null && !Array.isArray(runes) && Object.keys(runes).length > 0)
          
          // Check for protorunes
          const hasProtorunes = Array.isArray(protorunes) && protorunes.length > 0
          
          // Only store if there's actual ordinals data
          if (hasInscriptions || hasRunes || hasProtorunes) {
            addressOrdData.set(item.outpoint, {
              inscriptions: hasInscriptions 
                ? inscriptions.map((ins: any) => typeof ins === 'string' ? ins : ins.id || ins.inscription_id || String(ins))
                : [],
              runes: Array.isArray(runes) ? runes : (typeof runes === 'object' && runes !== null ? Object.values(runes) : [])
            })
            console.log(`✅ Found ordinals on ${item.outpoint}: ${hasInscriptions ? `${inscriptions.length} inscriptions` : ''} ${hasRunes ? 'runes' : ''}`)
          }
        }
        // If result is null or error, UTXO is clean - don't add to addressOrdData
      } catch (ordError) {
        // Per guide: on error, assume UTXO is clean (fail open)
        // Don't log every error to avoid spam
      }
    })
    
    await Promise.all(promises)
    
    // Log progress
    if ((i + concurrency) % 50 === 0 || i + concurrency >= utxosToProcess.length) {
      console.log(`   Progress: ${Math.min(i + concurrency, utxosToProcess.length)}/${utxosToProcess.length} checked, ${addressOrdData.size} with ordinals`)
    }
  }

  console.log(`✅ Checked ${utxosToProcess.length} UTXOs, found ${addressOrdData.size} with ordinals data`)
  
  // Debug: Log first few UTXOs with ordinals data
  if (addressOrdData.size > 0) {
    const sampleEntries = Array.from(addressOrdData.entries()).slice(0, 3)
    sampleEntries.forEach(([outpoint, data]) => {
      console.log(`   📝 ${outpoint}: ${data.inscriptions.length} inscriptions, ${data.runes.length} runes`)
    })
  }

  // Step 5: Categorize UTXOs using batch results
  const spendable: SandshrewSpendableUtxo[] = []
  const assets: SandshrewAssetUtxo[] = []
  const pending: SandshrewPendingUtxo[] = []

  for (const item of utxosToProcess) {
    const { txid, vout, outpoint, height, value, isConfirmed } = item

    // Check for inscriptions/runes from ord_address results
    let hasInscriptions = false
    let hasRunes = false
    let inscriptions: string[] = []
    let runes: SandshrewRuneBalance[] | null = null

    const ordData = addressOrdData.get(outpoint)
    if (ordData) {
      if (ordData.inscriptions && Array.isArray(ordData.inscriptions) && ordData.inscriptions.length > 0) {
        hasInscriptions = true
        inscriptions = ordData.inscriptions.map((ins: any) => 
          typeof ins === 'string' ? ins : ins.id || ins.inscription_id || String(ins)
        )
      }
      if (ordData.runes && Array.isArray(ordData.runes) && ordData.runes.length > 0) {
        hasRunes = true
        // Convert Subfrost rune format to Sandshrew format
        runes = ordData.runes.map((rune: any) => ({
          rune: {
            id: {
              block: typeof rune.block === 'string' ? rune.block : `0x${Number(rune.block).toString(16)}`,
              tx: typeof rune.tx === 'string' ? rune.tx : `0x${Number(rune.tx).toString(16)}`,
            },
            name: rune.name,
            spacedName: rune.spaced_name || rune.name,
            divisibility: rune.divisibility || 0,
            spacers: rune.spacers || 0,
            symbol: rune.symbol,
          },
          balance: typeof rune.balance === 'string' ? rune.balance : `0x${BigInt(rune.balance || 0).toString(16)}`,
        }))
      }
    }

    const utxoEntry = {
      outpoint,
      value,
      height: height || null,
      txid,
      vout: typeof vout === 'number' ? vout : parseInt(String(vout), 10) || 0,
    }

    if (!isConfirmed) {
      // Pending UTXO
      pending.push({
        ...utxoEntry,
        status: 'pending',
        inscriptions: hasInscriptions ? inscriptions : null,
        runes: hasRunes ? runes : null,
      })
    } else if (hasInscriptions || hasRunes) {
      // Asset UTXO (has inscriptions/runes)
      assets.push({
        ...utxoEntry,
        inscriptions: hasInscriptions ? inscriptions : null,
        runes: hasRunes ? runes : null,
      })
    } else {
      // Spendable UTXO (clean, confirmed)
      spendable.push(utxoEntry)
    }
  }

  console.log(`✅ Categorized: ${spendable.length} spendable, ${assets.length} assets, ${pending.length} pending`)

  const result: SandshrewBalancesResult = {
    spendable,
    assets: assets.length > 0 ? assets : undefined,
    pending: pending.length > 0 ? pending : undefined,
    ordHeight: ordHeight > 0 ? ordHeight : undefined,
    metashrewHeight: metashrewHeight > 0 ? metashrewHeight : undefined,
  }

  const sanitize = (input: unknown): unknown => {
    if (typeof input === 'bigint') {
      return input.toString()
    }
    if (Array.isArray(input)) {
      return input.map(sanitize)
    }
    if (input && typeof input === 'object') {
      const entries = Object.entries(input as Record<string, unknown>).map(([key, value]) => [
        key,
        sanitize(value),
      ])
      return Object.fromEntries(entries)
    }
    return input
  }

  return sanitize(result) as SandshrewBalancesResult
}

export async function fetchSandshrewTx(
  txid: string,
  requestOptions?: RequestInit,
): Promise<SandshrewEsploraTx> {
  if (!txid || txid.length !== 64) {
    throw new Error('A valid txid is required (64 hex characters)')
  }

  const endpoint = buildSandshrewEndpoint()
  const payload = {
    jsonrpc: '2.0',
    id: `tx-${txid}`,
    method: 'esplora_tx',
    params: [txid],
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, max-age=0',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    ...requestOptions,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Sandshrew tx request failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const json = (await response.json()) as SandshrewEsploraTxResponse

  if (json.error) {
    throw new Error(`Sandshrew responded with error ${json.error.code}: ${json.error.message}`)
  }

  if (!json.result) {
    throw new Error('Sandshrew tx response missing result field')
  }

  return json.result
}

