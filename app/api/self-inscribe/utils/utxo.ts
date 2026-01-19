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

export async function fetchUtxos(address: string, excludedUtxos: string[] = []) {
  const SUBFROST_API_URL = process.env.SUBFROST_URL || 'https://mainnet.subfrost.io/v4'
  const rawApiKey = process.env.SUBFROST_API_KEY || ''
  const SUBFROST_API_KEY = rawApiKey.endsWith('%') ? rawApiKey.slice(0, -1) : rawApiKey

  if (!SUBFROST_API_KEY) {
    throw new Error('SUBFROST_API_KEY environment variable is not set')
  }

  console.log(`🔍 Fetching UTXOs via Subfrost for: ${address.substring(0, 20)}...`)

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

export function filterAndSortUtxos(utxos: any[]) {
  console.log(`🔍 Filtering and sorting ${utxos.length} UTXOs...`)
  console.log(`   First 3 UTXOs before sort:`, utxos.slice(0, 3).map(u => ({ outpoint: u.outpoint, value: u.value })))
  
  const filteredUtxos = utxos
    .filter((utxo: any) => utxo.value > 800)
    .sort((a: any, b: any) => b.value - a.value)

  console.log(`✅ After filtering (>800 sats): ${filteredUtxos.length} UTXOs`)
  console.log(`   Largest 5 UTXOs:`, filteredUtxos.slice(0, 5).map(u => ({ value: u.value, outpoint: u.outpoint.substring(0, 20) + '...' })))

  if (filteredUtxos.length === 0) {
    throw new Error('No suitable UTXOs found (all below 800 sats)')
  }

  return filteredUtxos
}

export function validateSufficientFunds(utxos: any[], targetAmount: number, excludedCount: number = 0) {
  const amountRetrieved = utxos.reduce((sum: number, utxo: any) => sum + utxo.value, 0)
  
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
    throw new Error(`Insufficient funds: need ${targetAmount} sats but only have ${amountRetrieved} sats available (short by ${shortage} sats).${excludedMsg}Please wait for pending transactions to confirm or add more funds.`)
  }
  
  return amountRetrieved
}
