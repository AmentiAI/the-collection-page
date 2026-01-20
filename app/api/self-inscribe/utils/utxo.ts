import type { MempoolClientData, PaymentUtxo } from '@/lib/hybrid-utxo'
import { fetchUtxosHybrid, filterAndSortUtxos as hybridFilterAndSortUtxos, validateSufficientFunds as hybridValidateSufficientFunds } from '@/lib/hybrid-utxo'

export interface RareSat {
  sat: [number, number]
  name: string
  block: number
  time: string
  offset: number
  types: string[]
}

export interface RareSatUtxo {
  id: string
  value: number
  is_safe: boolean
  sats: RareSat[]
  is_confirm: boolean
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

  // Try URL path authentication first
  let response = await fetch(`${apiUrl}/${apiKey}`, {
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
  if (!response.ok && (response.status === 400 || response.status === 401)) {
    response = await fetch(`${apiUrl}/jsonrpc`, {
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

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Subfrost ${method} failed (${response.status}): ${errorText.substring(0, 200)}`)
  }

  const data = await response.json()
  if (data.error) {
    throw new Error(`Subfrost ${method} error: ${data.error.message || JSON.stringify(data.error)}`)
  }

  return data.result
}

/**
 * Fetch payment-ready UTXOs using hybrid approach (mempool.space + Ordiscan)
 * 
 * @param address - Bitcoin address to fetch UTXOs for
 * @param excludedUtxos - Outpoints to exclude (e.g., from recent pending txs)
 * @param clientMempoolData - Optional: Client-provided mempool data. If not provided, falls back to legacy Subfrost approach.
 * @returns Payment-ready UTXOs
 */
export async function fetchUtxos(
  address: string, 
  excludedUtxos: string[] = [],
  clientMempoolData?: MempoolClientData
) {
  // Use hybrid approach if client mempool data is provided
  if (clientMempoolData) {
    console.log(`🔍 [Hybrid] Using hybrid UTXO fetching for: ${address.substring(0, 20)}...`)
    const result = await fetchUtxosHybrid(address, clientMempoolData, excludedUtxos)
    
    // Convert PaymentUtxo[] to the expected format
    const utxosGathered = result.utxos.map(utxo => ({
      outpoint: utxo.outpoint,
      value: utxo.value,
      height: utxo.height,
      txid: utxo.txid,
      vout: utxo.vout,
    }))
    
    if (utxosGathered.length === 0) {
      const excludedMsg = excludedUtxos.length > 0
        ? ` (${excludedUtxos.length} UTXOs were excluded from pending transactions)`
        : ''
      throw new Error(`No spendable UTXOs found for this address${excludedMsg}`)
    }
    
    return { utxos: utxosGathered, excludedCount: excludedUtxos.length }
  }
  
  // Fallback to legacy Subfrost approach (for backward compatibility during migration)
  console.warn(`⚠️ [Legacy] Using legacy Subfrost approach. Consider migrating to hybrid approach with clientMempoolData.`)
  return fetchUtxosLegacy(address, excludedUtxos)
}

/**
 * Legacy Subfrost-based UTXO fetching (kept for backward compatibility)
 * @deprecated Use hybrid approach with clientMempoolData instead
 */
async function fetchUtxosLegacy(address: string, excludedUtxos: string[] = []) {
  const SUBFROST_API_URL = process.env.SUBFROST_URL || 'https://mainnet.subfrost.io/v4'
  const rawApiKey = process.env.SUBFROST_API_KEY || ''
  const SUBFROST_API_KEY = rawApiKey.endsWith('%') ? rawApiKey.slice(0, -1) : rawApiKey

  if (!SUBFROST_API_KEY) {
    throw new Error('SUBFROST_API_KEY environment variable is not set')
  }

  console.log(`🔍 [Legacy] Fetching UTXOs via Subfrost for: ${address.substring(0, 20)}...`)

  // Step 1: Get all UTXOs - correct method name is esplora_address::utxo (with double colons)
  const rawUtxos = await fetchSubfrostRpc('esplora_address::utxo', [address], SUBFROST_API_KEY, SUBFROST_API_URL)
  console.log(`📊 Found ${rawUtxos.length} total UTXOs`)

  // Step 1.5: Filter out UTXOs with value < 1001 sats (early filtering)
  const minValueUtxos = rawUtxos.filter((utxo: any) => (utxo.value || 0) >= 1001)
  console.log(`💰 Filtered to ${minValueUtxos.length} UTXOs with value >= 1001 sats`)

  // Step 2: Get block height for confirmation check
  let maxIndexedHeight = 0
  try {
    maxIndexedHeight = (await fetchSubfrostRpc('ord_blockheight', [], SUBFROST_API_KEY, SUBFROST_API_URL)) || 0
    console.log(`📏 Max indexed height: ${maxIndexedHeight}`)
  } catch (heightError) {
    console.warn('Could not fetch block height, using all UTXOs with block_height')
  }

  // Step 3: Filter confirmed UTXOs and check for inscriptions/runes
  const spendableUtxos: any[] = []

  for (const utxo of minValueUtxos) {
    const height = utxo.status?.block_height
    if (!height) continue // Skip unconfirmed

    // Check if confirmed (based on ord/metashrew height)
    if (maxIndexedHeight > 0 && height > maxIndexedHeight) continue

    const outpoint = `${utxo.txid}:${utxo.vout}`

    // Check if UTXO has inscriptions or runes using ord_output
    try {
      const ordData = await fetchSubfrostRpc('ord_output', [outpoint], SUBFROST_API_KEY, SUBFROST_API_URL)
      if (ordData) {
        const hasInscriptions = ordData.inscriptions && Array.isArray(ordData.inscriptions) && ordData.inscriptions.length > 0
        const hasRunes = ordData.runes && Array.isArray(ordData.runes) && ordData.runes.length > 0

        if (hasInscriptions || hasRunes) {
          console.log(`🚫 Filtering out UTXO ${outpoint} (has inscriptions: ${hasInscriptions}, has runes: ${hasRunes})`)
          continue // Skip this UTXO
        }
      }
    } catch (ordError) {
      // If ord_output call fails, assume UTXO is clean (no ordinals data)
      console.warn(`⚠️ Could not check ord_output for ${outpoint}, assuming clean`)
    }

    // UTXO is confirmed and clean - add to spendable
    spendableUtxos.push({
      outpoint: outpoint,
      value: utxo.value || 0,
      height: height,
      txid: utxo.txid,
      vout: utxo.vout,
    })
  }

  console.log(`✅ Found ${spendableUtxos.length} spendable payment UTXOs (runes and inscriptions filtered out)`)

  // Filter out excluded UTXOs (from recent pending transactions)
  let utxosGathered = spendableUtxos
  if (excludedUtxos.length > 0) {
    console.log(`🚫 Excluding ${excludedUtxos.length} UTXOs from recent pending transactions:`, excludedUtxos)
    const beforeCount = utxosGathered.length
    utxosGathered = utxosGathered.filter((utxo: any) => !excludedUtxos.includes(utxo.outpoint))
    const filteredCount = beforeCount - utxosGathered.length
    if (filteredCount > 0) {
      console.log(`   - Filtered out ${filteredCount} excluded UTXO(s)`)
    }
  }

  if (utxosGathered.length === 0) {
    const excludedMsg = excludedUtxos.length > 0
      ? ` (${excludedUtxos.length} UTXOs were excluded from pending transactions)`
      : ''
    throw new Error(`No spendable UTXOs found for this address${excludedMsg}`)
  }

  return { utxos: utxosGathered, excludedCount: excludedUtxos.length }
}

/**
 * Filter and sort UTXOs (wrapper for hybrid utility)
 */
export function filterAndSortUtxos(utxos: any[]) {
  // Convert to PaymentUtxo format for hybrid utility
  const paymentUtxos: PaymentUtxo[] = utxos.map((u: any) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    outpoint: u.outpoint,
    height: u.height || null,
  }))
  
  const filtered = hybridFilterAndSortUtxos(paymentUtxos)
  
  // Convert back to expected format
  return filtered.map(utxo => ({
    outpoint: utxo.outpoint,
    value: utxo.value,
    height: utxo.height,
    txid: utxo.txid,
    vout: utxo.vout,
  }))
}

/**
 * Validate sufficient funds (wrapper for hybrid utility)
 */
export function validateSufficientFunds(utxos: any[], targetAmount: number, excludedCount: number = 0) {
  // Convert to PaymentUtxo format for hybrid utility
  const paymentUtxos: PaymentUtxo[] = utxos.map((u: any) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    outpoint: u.outpoint,
    height: u.height || null,
  }))
  
  return hybridValidateSufficientFunds(paymentUtxos, targetAmount, excludedCount)
}
