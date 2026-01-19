// Test to see what's actually in the esplora_address::utxo response
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
    method: 'esplora_address::utxo',
    params: [address]
  }

  const response = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })

  const data = await response.json()
  const utxos = data.result || []
  
  console.log(`Found ${utxos.length} UTXOs`)
  console.log('\n=== First UTXO Full Structure ===')
  if (utxos.length > 0) {
    console.log(JSON.stringify(utxos[0], null, 2))
  }
  
  // Check if any UTXO has inscriptions or runes in the response
  const utxosWithInscriptions = utxos.filter(u => 
    (u.inscriptions && Array.isArray(u.inscriptions) && u.inscriptions.length > 0) ||
    (u.runes && (Array.isArray(u.runes) ? u.runes.length > 0 : Object.keys(u.runes).length > 0))
  )
  
  console.log(`\n=== UTXOs with inscriptions/runes in response: ${utxosWithInscriptions.length} ===`)
  if (utxosWithInscriptions.length > 0) {
    console.log(JSON.stringify(utxosWithInscriptions[0], null, 2))
  }
}

test().catch(console.error)
