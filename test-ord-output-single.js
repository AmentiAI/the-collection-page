// Test ord_output as single call and check REST endpoint
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

const testOutpoint = '18e0ea5ea085448488a84087d7e70c8917dfe1e8c992248c45b5e5ad16760f25:0'

async function testJsonRpc(method) {
  console.log(`\n📤 Testing JSON-RPC: ${method}`)
  const request = {
    jsonrpc: '2.0',
    id: 'test',
    method,
    params: [testOutpoint]
  }

  // Try URL path auth
  let response = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })

  if (!response.ok || response.status === 401 || response.status === 400) {
    // Try header auth
    response = await fetch(`${SUBFROST_API_URL}/jsonrpc`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-subfrost-api-key': SUBFROST_API_KEY
      },
      body: JSON.stringify(request)
    })
  }

  const text = await response.text()
  const data = JSON.parse(text)
  console.log(`   Status: ${response.status}`)
  console.log(`   Response:`, JSON.stringify(data, null, 2))
  return data
}

async function testRest() {
  console.log(`\n📤 Testing REST API: /output/${testOutpoint}`)
  
  // Try REST endpoint
  const restUrl = `${SUBFROST_API_URL}/api/output/${testOutpoint}`
  let response = await fetch(restUrl, {
    method: 'GET',
    headers: { 'x-subfrost-api-key': SUBFROST_API_KEY }
  })

  if (!response.ok) {
    // Try with API key in path
    const pathUrl = `${SUBFROST_API_URL}/${SUBFROST_API_KEY}/api/output/${testOutpoint}`
    response = await fetch(pathUrl, {
      method: 'GET',
      headers: {}
    })
  }

  const text = await response.text()
  console.log(`   Status: ${response.status}`)
  console.log(`   Response (first 500 chars):`, text.substring(0, 500))
  
  try {
    const data = JSON.parse(text)
    console.log(`   Parsed JSON:`, JSON.stringify(data, null, 2))
    return data
  } catch (e) {
    return null
  }
}

async function main() {
  console.log('🔍 Testing ord_output methods for:', testOutpoint)
  
  // Test different JSON-RPC method names
  await testJsonRpc('ord_output')
  await testJsonRpc('ord::output')
  
  // Test REST endpoint
  await testRest()
}

main().catch(console.error)
