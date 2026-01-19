# Subfrost UTXO Migration Guide

This guide explains how to replace `sandshrew_balances` API calls with the Subfrost multi-step UTXO fetching system. This migration provides better control, more accurate filtering, and avoids rate limiting issues.

## Table of Contents

1. [Why Replace Sandshrew?](#why-replace-sandshrew)
2. [Subfrost API Overview](#subfrost-api-overview)
3. [Implementation Steps](#implementation-steps)
4. [Complete Code Example](#complete-code-example)
5. [Authentication Methods](#authentication-methods)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Migration Checklist](#migration-checklist)

---

## Why Replace Sandshrew?

### Issues with Sandshrew `sandshrew_balances`:
- **Rate Limiting**: Frequent 429 "Too Many Requests" errors
- **Limited Filtering**: Doesn't provide granular control over UTXO filtering
- **Black Box**: Less visibility into what's being filtered and why
- **Dependency**: Single point of failure

### Benefits of Subfrost:
- **Direct RPC Calls**: Full control over the UTXO fetching process
- **Better Filtering**: Early filtering of small UTXOs reduces API calls
- **Inscription/Rune Detection**: Explicit checks for ordinals data
- **Flexible Authentication**: Multiple authentication methods
- **Better Error Handling**: More granular error information

---

## Subfrost API Overview

Subfrost provides a JSON-RPC 2.0 API with the following key methods:

### Required Methods:
1. **`esplora_addressutxo`** - Fetch all UTXOs for an address
2. **`ord_blockheight`** - Get current indexed block height (for confirmation checks)
3. **`ord_output`** - Check if a UTXO has inscriptions or runes

### API Endpoints:
- **Mainnet**: `https://mainnet.subfrost.io/v4`
- **Testnet**: `https://testnet.subfrost.io/v4` (if available)

---

## Implementation Steps

### Step 1: Environment Variables

Add to your `.env` file:

```bash
SUBFROST_URL=https://mainnet.subfrost.io/v4
SUBFROST_API_KEY=your_api_key_here
```

**Note**: Remove trailing `%` from API key if present (URL encoding artifact).

### Step 2: Initialize API Configuration

```typescript
const SUBFROST_API_URL = process.env.SUBFROST_URL || "https://mainnet.subfrost.io/v4"
const rawApiKey = process.env.SUBFROST_API_KEY || ""
const SUBFROST_API_KEY = rawApiKey.endsWith('%') ? rawApiKey.slice(0, -1) : rawApiKey

if (!SUBFROST_API_KEY) {
  throw new Error("SUBFROST_API_KEY environment variable is not set")
}
```

### Step 3: Fetch All UTXOs

Use `esplora_addressutxo` to get all UTXOs for an address:

```typescript
const utxoRequest = {
  jsonrpc: "2.0",
  id: "utxos",
  method: "esplora_addressutxo",
  params: [address]
}

const utxoResponse = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  },
  body: JSON.stringify(utxoRequest),
  cache: 'no-store'
})

const utxoData = await utxoResponse.json()
const rawUtxos = utxoData.result || []
```

### Step 4: Early Value Filtering

Filter out UTXOs with value < 1001 sats immediately to reduce subsequent API calls:

```typescript
const minValueUtxos = rawUtxos.filter((utxo: any) => (utxo.value || 0) >= 1001)
console.log(`💰 Filtered to ${minValueUtxos.length} UTXOs with value >= 1001 sats`)
```

### Step 5: Get Block Height for Confirmation

Check the current indexed block height to filter unconfirmed UTXOs:

```typescript
const heightRequest = {
  jsonrpc: "2.0",
  id: "height",
  method: "ord_blockheight",
  params: []
}

const heightResponse = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(heightRequest),
  cache: 'no-store'
})

const heightData = await heightResponse.json()
const maxIndexedHeight = heightData.result || 0
```

### Step 6: Filter Confirmed UTXOs and Check for Ordinals

For each UTXO, check if it's confirmed and doesn't have inscriptions/runes:

```typescript
const spendableUtxos: any[] = []

for (const utxo of minValueUtxos) {
  const height = utxo.status?.block_height
  if (!height) continue // Skip unconfirmed
  
  // Check if confirmed (based on ord/metashrew height)
  if (maxIndexedHeight > 0 && height > maxIndexedHeight) continue
  
  const outpoint = `${utxo.txid}:${utxo.vout}`
  
  // Check if UTXO has inscriptions or runes
  const ordRequest = {
    jsonrpc: "2.0",
    id: `ord_${outpoint}`,
    method: "ord_output",
    params: [outpoint]
  }
  
  const ordResponse = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ordRequest),
    cache: 'no-store'
  })
  
  if (ordResponse.ok) {
    const ordData = await ordResponse.json()
    if (ordData.result) {
      const ord = ordData.result
      const hasInscriptions = ord.inscriptions && Array.isArray(ord.inscriptions) && ord.inscriptions.length > 0
      const hasRunes = ord.runes && Array.isArray(ord.runes) && ord.runes.length > 0
      
      if (hasInscriptions || hasRunes) {
        console.log(`🚫 Filtering out UTXO ${outpoint} (has inscriptions: ${hasInscriptions}, has runes: ${hasRunes})`)
        continue // Skip this UTXO
      }
    }
  }
  
  // UTXO is confirmed and clean - add to spendable
  spendableUtxos.push({
    outpoint: outpoint,
    value: utxo.value || 0,
    height: height,
    txid: utxo.txid,
    vout: utxo.vout
  })
}
```

### Step 7: Filter Excluded UTXOs (Optional)

If you have UTXOs to exclude (e.g., from recent pending transactions):

```typescript
if (excludedUtxos.length > 0) {
  const beforeCount = spendableUtxos.length
  spendableUtxos = spendableUtxos.filter((utxo: any) => 
    !excludedUtxos.includes(utxo.outpoint)
  )
  console.log(`🚫 Excluded ${beforeCount - spendableUtxos.length} UTXOs from pending transactions`)
}
```

---

## Complete Code Example

Here's a complete function that replaces `sandshrew_balances`:

```typescript
export async function fetchUtxos(address: string, excludedUtxos: string[] = []) {
  const SUBFROST_API_URL = process.env.SUBFROST_URL || "https://mainnet.subfrost.io/v4"
  const rawApiKey = process.env.SUBFROST_API_KEY || ""
  const SUBFROST_API_KEY = rawApiKey.endsWith('%') ? rawApiKey.slice(0, -1) : rawApiKey
  
  if (!SUBFROST_API_KEY) {
    throw new Error("SUBFROST_API_KEY environment variable is not set")
  }

  console.log(`🔍 Fetching UTXOs for: ${address.substring(0, 20)}...`)

  // Step 1: Get all UTXOs for the address
  const utxoRequest = {
    jsonrpc: "2.0",
    id: "utxos",
    method: "esplora_addressutxo",
    params: [address]
  }
  
  let utxoResponse = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: JSON.stringify(utxoRequest),
    cache: 'no-store'
  })
  
  // Try header auth if URL path auth fails
  if (!utxoResponse.ok && (utxoResponse.status === 400 || utxoResponse.status === 401)) {
    console.log(`⚠️ URL path auth failed, trying header method...`)
    utxoResponse = await fetch(`${SUBFROST_API_URL}/jsonrpc`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-subfrost-api-key': SUBFROST_API_KEY,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify(utxoRequest),
      cache: 'no-store'
    })
  }
  
  if (!utxoResponse.ok) {
    const errorText = await utxoResponse.text()
    throw new Error(`Failed to fetch UTXOs: ${utxoResponse.status} ${utxoResponse.statusText} - ${errorText.substring(0, 100)}`)
  }
  
  const utxoData = await utxoResponse.json()
  if (utxoData.error) {
    throw new Error(`UTXO fetch error: ${utxoData.error.message || JSON.stringify(utxoData.error)}`)
  }
  
  const rawUtxos = utxoData.result || []
  console.log(`📊 Found ${rawUtxos.length} total UTXOs`)
  
  // Step 1.5: Filter out UTXOs with value < 1001 sats (early filtering)
  const minValueUtxos = rawUtxos.filter((utxo: any) => (utxo.value || 0) >= 1001)
  console.log(`💰 Filtered to ${minValueUtxos.length} UTXOs with value >= 1001 sats`)
  
  // Step 2: Get block height for confirmation check
  const heightRequest = {
    jsonrpc: "2.0",
    id: "height",
    method: "ord_blockheight",
    params: []
  }
  
  let maxIndexedHeight = 0
  try {
    const heightResponse = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(heightRequest),
      cache: 'no-store'
    })
    if (heightResponse.ok) {
      const heightData = await heightResponse.json()
      maxIndexedHeight = heightData.result || 0
      console.log(`📏 Max indexed height: ${maxIndexedHeight}`)
    }
  } catch (heightError) {
    console.warn("Could not fetch block height, using all UTXOs with block_height")
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
      const ordRequest = {
        jsonrpc: "2.0",
        id: `ord_${outpoint}`,
        method: "ord_output",
        params: [outpoint]
      }
      
      const ordResponse = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ordRequest),
        cache: 'no-store'
      })
      
      if (ordResponse.ok) {
        const ordData = await ordResponse.json()
        if (ordData.result) {
          const ord = ordData.result
          const hasInscriptions = ord.inscriptions && Array.isArray(ord.inscriptions) && ord.inscriptions.length > 0
          const hasRunes = ord.runes && Array.isArray(ord.runes) && ord.runes.length > 0
          
          if (hasInscriptions || hasRunes) {
            console.log(`🚫 Filtering out UTXO ${outpoint} (has inscriptions: ${hasInscriptions}, has runes: ${hasRunes})`)
            continue // Skip this UTXO
          }
        }
      }
      // If ord_output fails or returns no data, assume UTXO is clean
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
      vout: utxo.vout
    })
  }
  
  console.log(`✅ Found ${spendableUtxos.length} spendable payment UTXOs (runes and inscriptions filtered out)`)
  
  // Filter out excluded UTXOs (from recent pending transactions)
  if (excludedUtxos.length > 0) {
    const beforeCount = spendableUtxos.length
    spendableUtxos = spendableUtxos.filter((utxo: any) => 
      !excludedUtxos.includes(utxo.outpoint)
    )
    console.log(`🚫 Excluded ${beforeCount - spendableUtxos.length} UTXOs from pending transactions`)
  }
  
  if (spendableUtxos.length === 0) {
    const excludedMsg = excludedUtxos.length > 0 
      ? ` (${excludedUtxos.length} UTXOs were excluded from pending transactions)` 
      : ''
    throw new Error(`No spendable UTXOs found for this address${excludedMsg}`)
  }
  
  return { utxos: spendableUtxos, excludedCount: excludedUtxos.length }
}
```

---

## Authentication Methods

Subfrost supports two authentication methods. The code should try both:

### Method 1: URL Path Authentication (Primary)
```typescript
const response = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody)
})
```

### Method 2: Header Authentication (Fallback)
```typescript
const response = await fetch(`${SUBFROST_API_URL}/jsonrpc`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'x-subfrost-api-key': SUBFROST_API_KEY
  },
  body: JSON.stringify(requestBody)
})
```

**Implementation**: Try Method 1 first, and if it returns 400/401, fall back to Method 2.

---

## Error Handling

### Common Errors and Solutions:

1. **401 Unauthorized**
   - Check API key is correct
   - Try header authentication method
   - Verify API key doesn't have trailing `%`

2. **429 Too Many Requests**
   - Implement rate limiting/throttling
   - Add retry logic with exponential backoff
   - Consider caching UTXO data for short periods

3. **UTXO Not Found**
   - Check address format is correct
   - Verify address has received transactions
   - Check if UTXOs are confirmed

4. **ord_output Fails**
   - Assume UTXO is clean (no ordinals data)
   - Log warning but continue processing
   - Don't fail the entire fetch operation

### Example Error Handling:

```typescript
try {
  const utxoResponse = await fetch(...)
  if (!utxoResponse.ok) {
    if (utxoResponse.status === 401) {
      // Try alternative auth method
    } else if (utxoResponse.status === 429) {
      // Implement retry logic
    } else {
      throw new Error(`HTTP ${utxoResponse.status}: ${await utxoResponse.text()}`)
    }
  }
} catch (error) {
  console.error("UTXO fetch error:", error)
  throw error
}
```

---

## Best Practices

### 1. Early Value Filtering
Always filter UTXOs with value < 1001 sats **before** checking for inscriptions/runes. This reduces API calls significantly.

```typescript
const minValueUtxos = rawUtxos.filter((utxo: any) => (utxo.value || 0) >= 1001)
```

### 2. Cache Block Height
The `ord_blockheight` call can be cached for a short period (e.g., 30 seconds) since it doesn't change frequently.

### 3. Parallel Processing (Advanced)
For large UTXO sets, consider batching `ord_output` calls:

```typescript
// Process in batches of 10
const batchSize = 10
for (let i = 0; i < utxos.length; i += batchSize) {
  const batch = utxos.slice(i, i + batchSize)
  const results = await Promise.all(
    batch.map(utxo => checkOrdOutput(utxo))
  )
  // Process results
}
```

### 4. Logging
Add comprehensive logging for debugging:
- Total UTXOs found
- Filtered counts at each step
- Excluded UTXOs and reasons
- Final spendable count

### 5. Return Format
Return a consistent format that matches your existing code:

```typescript
return {
  utxos: spendableUtxos,  // Array of UTXO objects
  excludedCount: excludedUtxos.length  // Count of excluded UTXOs
}
```

---

## Migration Checklist

When replacing `sandshrew_balances` in your codebase:

- [ ] Add `SUBFROST_URL` and `SUBFROST_API_KEY` to `.env`
- [ ] Remove `SANDSHREW_DEVELOPER_KEY` dependency (if no longer needed)
- [ ] Replace `sandshrew_balances` API calls with Subfrost implementation
- [ ] Update function signatures to match new return format
- [ ] Add dual authentication (URL path + header fallback)
- [ ] Implement early value filtering (< 1001 sats)
- [ ] Add `ord_blockheight` check for confirmation
- [ ] Add `ord_output` checks for inscriptions/runes
- [ ] Update error handling for new API
- [ ] Add comprehensive logging
- [ ] Test with various addresses (empty, small balance, large balance)
- [ ] Test with addresses containing inscriptions/runes
- [ ] Test error scenarios (invalid API key, network errors)
- [ ] Update any dependent code that expects old format
- [ ] Remove unused Sandshrew imports/utilities

---

## Example: Before and After

### Before (Sandshrew):
```typescript
const requestBody = {
  jsonrpc: "2.0",
  id: "420",
  method: 'sandshrew_balances',
  params: [{ address: paymentAddress }]
}

const res = await fetch(`${SANDSHREW_URL}${SANDSHREW_DEVELOPER_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody)
})

const data = await res.json()
const utxos = data.result?.spendable || []
```

### After (Subfrost):
```typescript
const { utxos } = await fetchUtxos(paymentAddress, excludedUtxos)
// utxos is already filtered for:
// - Value >= 1001 sats
// - Confirmed status
// - No inscriptions/runes
// - Not in excluded list
```

---

## Additional Resources

- **Subfrost API Documentation**: https://api.subfrost.io/docs
- **Subfrost JSON-RPC Methods**: https://api.subfrost.io/docs/jsonrpc
- **Example Implementation**: See `app/api/self-inscribe/utils/utxo.ts` in this codebase

---

## Notes

- The minimum value filter (1001 sats) is a performance optimization. Adjust based on your needs.
- The `ord_output` check assumes UTXOs are clean if the check fails. This is a safe default for payment UTXOs.
- Always use `cache: 'no-store'` in fetch options to prevent caching of UTXO data.
- Consider implementing retry logic for transient network errors.
