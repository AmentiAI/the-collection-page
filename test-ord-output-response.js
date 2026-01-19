// Test ord_output to see actual response structure
const fs = require('fs')
const path = require('path')

// Read .env.local
const envPath = path.join(__dirname, '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      let value = match[2].trim()
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

// Test with a known inscription UTXO from the address
const testOutpoints = [
  '18e0ea5ea085448488a84087d7e70c8917dfe1e8c992248c45b5e5ad16760f25:0',
  '06fec740962fe3b8dc440867b91d33d01891f8f2f619a869672b56d6c72dfe79:2',
]

async function testOrdOutput(outpoint) {
  const request = {
    jsonrpc: '2.0',
    id: `ord_${outpoint}`,
    method: 'ord_output',
    params: [outpoint]
  }

  console.log(`\n🔍 Testing ord_output for: ${outpoint}`)
  
  // Try header auth first
  let response = await fetch(`${SUBFROST_API_URL}/jsonrpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-subfrost-api-key': SUBFROST_API_KEY
    },
    body: JSON.stringify(request)
  })

  if (!response.ok && (response.status === 400 || response.status === 401)) {
    // Try URL path auth
    response = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    })
  }

  const text = await response.text()
  console.log(`   Status: ${response.status}`)
  console.log(`   Response text (first 500 chars): ${text.substring(0, 500)}`)
  
  try {
    const data = JSON.parse(text)
    console.log(`   Parsed JSON:`, JSON.stringify(data, null, 2))
    
    if (data.error) {
      console.log(`   ❌ Error: ${data.error.message || JSON.stringify(data.error)}`)
    } else if (data.result) {
      if (typeof data.result === 'string') {
        console.log(`   ⚠️ Result is string: ${data.result}`)
      } else if (data.result === null) {
        console.log(`   ✅ Result is null (clean UTXO)`)
      } else {
        console.log(`   ✅ Result is object`)
        console.log(`   Keys: ${Object.keys(data.result).join(', ')}`)
        if (data.result.inscriptions) {
          console.log(`   Inscriptions: ${JSON.stringify(data.result.inscriptions, null, 2)}`)
        }
        if (data.result.runes) {
          console.log(`   Runes: ${JSON.stringify(data.result.runes, null, 2)}`)
        }
      }
    }
  } catch (e) {
    console.log(`   ❌ Failed to parse JSON: ${e.message}`)
  }
}

async function main() {
  for (const outpoint of testOutpoints) {
    await testOrdOutput(outpoint)
  }
}

main().catch(console.error)
