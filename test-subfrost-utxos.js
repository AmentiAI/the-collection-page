// Test script to fetch UTXOs from Subfrost
// Load environment variables from .env.local
const fs = require('fs')
const path = require('path')

// Read .env.local file
const envPath = path.join(__dirname, '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      let value = match[2].trim()
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  })
}

const SUBFROST_API_URL = process.env.SUBFROST_URL || 'https://mainnet.subfrost.io/v4'
const rawApiKey = process.env.SUBFROST_API_KEY || ''
const SUBFROST_API_KEY = rawApiKey.endsWith('%') ? rawApiKey.slice(0, -1) : rawApiKey

if (!SUBFROST_API_KEY) {
  console.error('❌ SUBFROST_API_KEY environment variable is not set')
  process.exit(1)
}

const address = '3KWMjoT5nVpsUfJrxP1dqyM1b7EMXD3fSY'

async function testSubfrostRpc(method, params, useHeaderAuth = false) {
  const request = {
    jsonrpc: '2.0',
    id: method,
    method,
    params,
  }

  const url = useHeaderAuth 
    ? `${SUBFROST_API_URL}/jsonrpc`
    : `${SUBFROST_API_URL}/${SUBFROST_API_KEY}`

  console.log(`\n📤 Testing ${method}`)
  console.log(`   URL: ${url}`)
  console.log(`   Method: ${useHeaderAuth ? 'Header Auth' : 'URL Path Auth'}`)
  console.log(`   Request:`, JSON.stringify(request, null, 2))

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: useHeaderAuth
        ? {
            'Content-Type': 'application/json',
            'x-subfrost-api-key': SUBFROST_API_KEY,
          }
        : {
            'Content-Type': 'application/json',
          },
      body: JSON.stringify(request),
    })

    console.log(`\n📥 Response Status: ${response.status} ${response.statusText}`)
    console.log(`   Content-Type: ${response.headers.get('content-type')}`)

    const responseText = await response.text()
    console.log(`\n📥 Raw Response (first 500 chars):`)
    console.log(responseText.substring(0, 500))

    if (!response.ok) {
      console.error(`\n❌ HTTP Error: ${response.status}`)
      return null
    }

    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error(`\n❌ JSON Parse Error:`, parseError.message)
      console.error(`   Response text:`, responseText.substring(0, 200))
      return null
    }

    console.log(`\n📊 Parsed JSON:`)
    console.log(JSON.stringify(data, null, 2))

    if (data.error) {
      console.error(`\n❌ RPC Error:`, data.error)
      return null
    }

    console.log(`\n✅ Result type: ${typeof data.result}`)
    if (Array.isArray(data.result)) {
      console.log(`   Array length: ${data.result.length}`)
      if (data.result.length > 0) {
        console.log(`   First item:`, JSON.stringify(data.result[0], null, 2))
      }
    } else if (typeof data.result === 'string') {
      console.log(`   String length: ${data.result.length}`)
      console.log(`   String value: ${data.result.substring(0, 200)}`)
    } else if (data.result && typeof data.result === 'object') {
      console.log(`   Object keys:`, Object.keys(data.result))
    }

    return data.result
  } catch (error) {
    console.error(`\n❌ Fetch Error:`, error.message)
    return null
  }
}

async function testOrdOutput(outpoint) {
  console.log(`\n🔍 Testing ord_output for: ${outpoint}`)
  
  const methodsToTry = ['ord::output', 'ord_output', 'ord_outputs', 'ord::outputs']
  
  for (const method of methodsToTry) {
    console.log(`\n   Trying method: ${method}`)
    const result = await testSubfrostRpc(method, [outpoint], false)
    
    if (result) {
      if (typeof result === 'object' && !Array.isArray(result) && result.inscriptions !== undefined) {
        console.log(`✅ Success with method: ${method}`)
        console.log(`   Inscriptions: ${Array.isArray(result.inscriptions) ? result.inscriptions.length : 'N/A'}`)
        console.log(`   Runes: ${result.runes ? Object.keys(result.runes).length : 0}`)
        return result
      } else if (typeof result === 'string' && result.includes('disabled')) {
        console.log(`   ⚠️ Method ${method} returned: ${result}`)
      }
    }
  }
  return null
}

async function main() {
  console.log('🔍 Testing Subfrost API for address:', address)
  console.log('   API URL:', SUBFROST_API_URL)
  console.log('   API Key:', SUBFROST_API_KEY.substring(0, 10) + '...')

  // Try different method names - correct one is esplora_address::utxo
  const methodsToTry = [
    'esplora_address::utxo',  // Correct method name per Subfrost docs
    'esplora_addressutxo',     // Old incorrect name
  ]

  let result = null
  for (const method of methodsToTry) {
    console.log(`\n\n${'='.repeat(60)}`)
    console.log(`Trying method: ${method}`)
    console.log('='.repeat(60))
    
    // Test URL path auth first
    result = await testSubfrostRpc(method, [address], false)
    
    // If that fails, try header auth
    if (!result || (typeof result === 'string' && (result.includes('error') || result.includes('does not exist')))) {
      console.log('\n🔄 Trying header authentication...')
      result = await testSubfrostRpc(method, [address], true)
    }
    
    // If we got a valid array, break
    if (result && Array.isArray(result)) {
      console.log(`\n✅ Success with method: ${method}`)
      break
    }
    
    // If we got an error string, continue to next method
    if (result && typeof result === 'string') {
      console.log(`\n⚠️ Method ${method} returned error: ${result}`)
      continue
    }
  }

  // Process results if we got valid data
  if (result) {
    if (Array.isArray(result)) {
      console.log(`\n✅ Success! Got ${result.length} UTXOs`)
      
      // Show spendable UTXOs (confirmed, no inscriptions/runes)
      const spendable = result.filter(utxo => {
        const height = utxo.status?.block_height || utxo.block_height
        const value = utxo.value || 0
        return height && value >= 1001
      })
      
      console.log(`\n💰 Spendable UTXOs (confirmed, >= 1001 sats): ${spendable.length}`)
      spendable.slice(0, 5).forEach((utxo, i) => {
        const txid = utxo.txid || utxo.tx_hash || 'unknown'
        const vout = utxo.vout !== undefined ? utxo.vout : (utxo.v_out !== undefined ? utxo.v_out : 'unknown')
        const value = utxo.value || 0
        const height = utxo.status?.block_height || utxo.block_height || 'unconfirmed'
        console.log(`   ${i + 1}. ${txid}:${vout} = ${value} sats (height: ${height})`)
      })
      
      // Test ord_output on first few UTXOs
      if (spendable.length > 0) {
        console.log(`\n🔍 Testing ord_output on first UTXO...`)
        const firstUtxo = spendable[0]
        const outpoint = `${firstUtxo.txid}:${firstUtxo.vout}`
        await testOrdOutput(outpoint)
      }
    } else {
      console.log(`\n⚠️ Result is not an array, it's a ${typeof result}`)
    }
  } else {
    console.log('\n❌ Failed to get UTXOs')
  }
}

main().catch(console.error)
