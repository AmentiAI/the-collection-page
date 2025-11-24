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

export async function fetchUtxos(address: string, excludedUtxos: string[] = []) {
  const SANDSHREW_API_URL = process.env.SANDSHREW_URL || "https://mainnet.sandshrew.io/v2"
  const SANDSHREW_DEVELOPER_KEY = process.env.SANDSHREW_DEVELOPER_KEY
  
  if (!SANDSHREW_DEVELOPER_KEY) {
    throw new Error("SANDSHREW_DEVELOPER_KEY environment variable is not set")
  }

  console.log(`🔍 Fetching UTXOs for: ${address.substring(0, 20)}...`)
  console.log(`🔗 Sandshrew URL: ${SANDSHREW_API_URL}`)
  console.log(`🔑 Has developer key: ${!!SANDSHREW_DEVELOPER_KEY}`)

  const requestBody = {
    jsonrpc: "2.0",
    id: "420",
    method: 'sandshrew_balances',
    params: [{ address }]
  }
  
  console.log(`📤 Request body:`, JSON.stringify(requestBody, null, 2))

  const utxoResponse = await fetch(`${SANDSHREW_API_URL}/${SANDSHREW_DEVELOPER_KEY}`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: JSON.stringify(requestBody),
    cache: 'no-store'
  })
  
  console.log(`📥 Response status: ${utxoResponse.status} ${utxoResponse.statusText}`)
  console.log(`📥 Response headers:`, Object.fromEntries(utxoResponse.headers.entries()))

  // Get response text first to handle both JSON and HTML responses
  const responseText = await utxoResponse.text()
  console.log(`📥 Response text (first 500 chars):`, responseText.substring(0, 500))

  if (!utxoResponse.ok) {
    console.error(`❌ HTTP Error ${utxoResponse.status}:`, responseText.substring(0, 200))
    throw new Error(`Failed to fetch UTXOs: ${utxoResponse.status} ${utxoResponse.statusText} - ${responseText.substring(0, 100)}`)
  }
  
  let utxoResult
  try {
    utxoResult = JSON.parse(responseText)
  } catch (parseError) {
    console.error('❌ Failed to parse UTXO response as JSON')
    console.error('   Response starts with:', responseText.substring(0, 200))
    console.error('   Full URL:', `${SANDSHREW_API_URL}/${SANDSHREW_DEVELOPER_KEY?.substring(0, 10)}...`)
    
    // Check if response looks like HTML
    if (responseText.trim().startsWith('<')) {
      throw new Error(`Sandshrew API returned HTML instead of JSON. This usually means:
        1. The API key is invalid or expired
        2. The Sandshrew service is temporarily unavailable
        3. The request URL is incorrect
        Please check your SANDSHREW_DEVELOPER_KEY environment variable.`)
    }
    
    throw new Error(`UTXO API returned invalid JSON. Response: ${responseText.substring(0, 100)}...`)
  }
  
  if (utxoResult.error) {
    throw new Error(`UTXO fetch error: ${utxoResult.error.message}`)
  }

  let utxosGathered = utxoResult.result?.spendable || []
  console.log(`📊 Found ${utxosGathered.length} payment UTXOs`)

  // Filter out excluded UTXOs (from recent pending transactions to prevent RBF errors)
  if (excludedUtxos.length > 0) {
    console.log(`🚫 Excluding ${excludedUtxos.length} UTXOs from recent pending transactions:`, excludedUtxos)
    const beforeCount = utxosGathered.length
    utxosGathered = utxosGathered.filter((utxo: any) => 
      !excludedUtxos.includes(utxo.outpoint)
    )
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
