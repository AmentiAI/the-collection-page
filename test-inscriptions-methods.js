// Test ord_inscriptions and esplora_address::inscriptions to see their response structure
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

const address = 'bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2'

async function testMethod(method, params, label) {
  const request = {
    jsonrpc: '2.0',
    id: method,
    method,
    params
  }

  try {
    let response = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })

    if (!response.ok && (response.status === 400 || response.status === 401)) {
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
    
    if (data.error) {
      console.log(`\n❌ ${label}: ${data.error.message}`)
      return null
    }
    
    console.log(`\n✅ ${label}:`)
    console.log(JSON.stringify(data.result, null, 2).substring(0, 2000))
    return data.result
  } catch (error) {
    console.log(`\n❌ ${label}: ${error.message}`)
    return null
  }
}

async function main() {
  console.log('🔍 Testing inscription methods for address:', address)
  
  await testMethod('ord_inscriptions', [address], 'ord_inscriptions')
  await testMethod('esplora_address::inscriptions', [address], 'esplora_address::inscriptions')
}

main().catch(console.error)
