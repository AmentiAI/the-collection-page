// Test ord_address::inscriptions and related methods
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
    
    if (typeof data.result === 'string' && data.result.includes('disabled')) {
      console.log(`⚠️ ${label}: ${data.result}`)
      return null
    }
    
    console.log(`\n✅ ${label}:`)
    if (Array.isArray(data.result)) {
      console.log(`   Array with ${data.result.length} items`)
      if (data.result.length > 0) {
        console.log(`   First item:`, JSON.stringify(data.result[0], null, 2).substring(0, 500))
      }
    } else if (typeof data.result === 'object') {
      console.log(`   Object with keys: ${Object.keys(data.result).join(', ')}`)
      console.log(`   Sample:`, JSON.stringify(data.result, null, 2).substring(0, 1000))
    } else {
      console.log(`   Result:`, data.result)
    }
    return data.result
  } catch (error) {
    console.log(`\n❌ ${label}: ${error.message}`)
    return null
  }
}

async function main() {
  console.log('🔍 Testing ord_address methods for address:', address)
  
  await testMethod('ord_address::inscriptions', [address], 'ord_address::inscriptions')
  await testMethod('ord_address::runes', [address], 'ord_address::runes')
  await testMethod('ord_address', [address], 'ord_address')
}

main().catch(console.error)
