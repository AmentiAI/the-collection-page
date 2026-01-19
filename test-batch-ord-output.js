// Test if batch RPC works for ord_output
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

const testOutpoints = [
  '18e0ea5ea085448488a84087d7e70c8917dfe1e8c992248c45b5e5ad16760f25:0',
  '06fec740962fe3b8dc440867b91d33d01891f8f2f619a869672b56d6c72dfe79:2',
]

async function testBatch() {
  const batchRequest = testOutpoints.map((outpoint, index) => ({
    jsonrpc: '2.0',
    id: `ord_${index}_${outpoint}`,
    method: 'ord_output',
    params: [outpoint]
  }))

  console.log('🔍 Testing batch RPC for ord_output')
  console.log(`   Batch size: ${batchRequest.length}`)
  
  // Try header auth first
  let response = await fetch(`${SUBFROST_API_URL}/jsonrpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-subfrost-api-key': SUBFROST_API_KEY
    },
    body: JSON.stringify(batchRequest)
  })

  if (!response.ok && (response.status === 400 || response.status === 401)) {
    // Try URL path auth
    response = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(batchRequest)
    })
  }

  const text = await response.text()
  console.log(`   Status: ${response.status}`)
  console.log(`   Response (first 1000 chars): ${text.substring(0, 1000)}`)
  
  try {
    const data = JSON.parse(text)
    
    if (Array.isArray(data)) {
      console.log(`   ✅ Batch response is array with ${data.length} items`)
      data.forEach((item, index) => {
        if (item.error) {
          console.log(`   ❌ Item ${index}: ${item.error.message || JSON.stringify(item.error)}`)
        } else if (item.result) {
          if (typeof item.result === 'string') {
            console.log(`   ⚠️ Item ${index}: ${item.result}`)
          } else if (item.result === null) {
            console.log(`   ✅ Item ${index}: null (clean)`)
          } else {
            const hasInscriptions = item.result.inscriptions && Array.isArray(item.result.inscriptions) && item.result.inscriptions.length > 0
            console.log(`   ✅ Item ${index}: has inscriptions: ${hasInscriptions}`)
            if (hasInscriptions) {
              console.log(`      Inscriptions: ${JSON.stringify(item.result.inscriptions)}`)
            }
          }
        }
      })
    } else {
      console.log(`   ⚠️ Batch response is not an array: ${typeof data}`)
      console.log(`   Response: ${JSON.stringify(data, null, 2)}`)
    }
  } catch (e) {
    console.log(`   ❌ Failed to parse JSON: ${e.message}`)
  }
}

testBatch().catch(console.error)
