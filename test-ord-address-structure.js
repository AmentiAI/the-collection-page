// Test ord_address to see the full structure
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

async function test() {
  const request = {
    jsonrpc: '2.0',
    id: 'test',
    method: 'ord_address',
    params: [address]
  }

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

  const data = await response.json()
  
  if (data.error) {
    console.log('Error:', data.error)
    return
  }
  
  console.log('Full ord_address response structure:')
  console.log(JSON.stringify(data.result, null, 2))
  
  if (data.result.outputs && Array.isArray(data.result.outputs)) {
    console.log(`\n\nFound ${data.result.outputs.length} outputs`)
    if (data.result.outputs.length > 0) {
      console.log('\nFirst output structure:')
      console.log(JSON.stringify(data.result.outputs[0], null, 2))
    }
  }
}

test().catch(console.error)
