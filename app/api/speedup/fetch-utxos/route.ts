import { NextRequest, NextResponse } from 'next/server'
import type { MempoolClientData } from '@/lib/hybrid-utxo'
import { fetchUtxosHybrid } from '@/lib/hybrid-utxo'

export async function POST(request: NextRequest) {
  try {
    const { address, excludedUtxos = [], clientMempoolData } = await request.json()
    
    if (!address) {
      return NextResponse.json({
        success: false,
        error: 'Address is required'
      }, { status: 400 })
    }
    
    if (excludedUtxos.length > 0) {
      console.log(`🚫 Excluding ${excludedUtxos.length} UTXOs from selection`)
    }
    
    // Use hybrid approach if client mempool data is provided
    if (clientMempoolData) {
      console.log(`🔍 [Hybrid] Using hybrid UTXO fetching for speedup: ${address.substring(0, 20)}...`)
      
      const result = await fetchUtxosHybrid(address, clientMempoolData as MempoolClientData, excludedUtxos)
      
      // Convert to expected format
      const filteredUtxos = result.utxos
        .filter((utxo) => {
          if (utxo.value <= 800) {
            return false
          }
          if (excludedUtxos.includes(utxo.outpoint)) {
            console.log(`   🚫 Excluding UTXO (in excluded list): ${utxo.outpoint}`)
            return false
          }
          return true
        })
        .sort((a, b) => b.value - a.value)
        .map((utxo) => {
          const [txid, vout] = utxo.outpoint.split(':')
          return {
            txid,
            vout: parseInt(vout, 10),
            value: utxo.value,
            outpoint: utxo.outpoint
          }
        })
      
      console.log(`✅ [Hybrid] Found ${filteredUtxos.length} payment-ready UTXOs`)
      if (filteredUtxos.length > 0) {
        console.log(`   Largest 3:`, filteredUtxos.slice(0, 3).map((u: any) => `${u.value} sats`))
      }
      
      return NextResponse.json({
        success: true,
        utxos: filteredUtxos
      })
    }
    
    // Fallback to legacy Subfrost approach
    console.warn(`⚠️ [Legacy] Using legacy Subfrost approach. Consider migrating to hybrid approach with clientMempoolData.`)
    return fetchUtxosLegacy(address, excludedUtxos)
  } catch (error) {
    console.error('❌ Error fetching UTXOs for speedup:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch UTXOs'
    }, { status: 500 })
  }
}

async function fetchUtxosLegacy(address: string, excludedUtxos: string[] = []): Promise<NextResponse> {
  try {
    const SUBFROST_API_URL = process.env.SUBFROST_URL || 'https://mainnet.subfrost.io/v4'
    const rawApiKey = process.env.SUBFROST_API_KEY || ''
    const SUBFROST_API_KEY = rawApiKey.endsWith('%') ? rawApiKey.slice(0, -1) : rawApiKey

    if (!SUBFROST_API_KEY) {
      throw new Error('SUBFROST_API_KEY environment variable is not set')
    }

    console.log(`🔍 [Legacy] Fetching UTXOs via Subfrost for speedup: ${address.substring(0, 20)}...`)

    // Helper function for Subfrost RPC calls
    const fetchSubfrostRpc = async (method: string, params: any[]): Promise<any> => {
      const request = {
        jsonrpc: '2.0',
        id: method,
        method,
        params,
      }

      // Try URL path authentication first
      let response = await fetch(`${SUBFROST_API_URL}/${SUBFROST_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        body: JSON.stringify(request),
        cache: 'no-store',
      })

      // Fallback to header authentication if URL path fails
      if (!response.ok && (response.status === 400 || response.status === 401)) {
        response = await fetch(`${SUBFROST_API_URL}/jsonrpc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-subfrost-api-key': SUBFROST_API_KEY,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
          body: JSON.stringify(request),
          cache: 'no-store',
        })
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Subfrost ${method} failed (${response.status}): ${errorText.substring(0, 200)}`)
      }

      const data = await response.json()
      if (data.error) {
        throw new Error(`Subfrost ${method} error: ${data.error.message || JSON.stringify(data.error)}`)
      }

      return data.result
    }

    // Step 1: Get all UTXOs - correct method name is esplora_address::utxo (with double colons)
    const rawUtxos = await fetchSubfrostRpc('esplora_address::utxo', [address])
    console.log(`📊 Found ${rawUtxos.length} total UTXOs`)

    // Step 1.5: Filter out UTXOs with value < 1001 sats (early filtering)
    const minValueUtxos = rawUtxos.filter((utxo: any) => (utxo.value || 0) >= 1001)
    console.log(`💰 Filtered to ${minValueUtxos.length} UTXOs with value >= 1001 sats`)

    // Step 2: Get block height for confirmation check
    let maxIndexedHeight = 0
    try {
      maxIndexedHeight = (await fetchSubfrostRpc('ord_blockheight', [])) || 0
      console.log(`📏 Max indexed height: ${maxIndexedHeight}`)
    } catch (heightError) {
      console.warn('Could not fetch block height, using all UTXOs with block_height')
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
        const ordData = await fetchSubfrostRpc('ord_output', [outpoint])
        if (ordData) {
          const hasInscriptions = ordData.inscriptions && Array.isArray(ordData.inscriptions) && ordData.inscriptions.length > 0
          const hasRunes = ordData.runes && Array.isArray(ordData.runes) && ordData.runes.length > 0

          if (hasInscriptions || hasRunes) {
            console.log(`🚫 Filtering out UTXO ${outpoint} (has inscriptions: ${hasInscriptions}, has runes: ${hasRunes})`)
            continue // Skip this UTXO
          }
        }
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
        vout: utxo.vout,
      })
    }

    const utxos = spendableUtxos
    console.log(`✅ Found ${utxos.length} spendable UTXOs from Subfrost`)
    if (utxos.length > 0) {
      console.log(`   First 3:`, utxos.slice(0, 3).map((u: any) => `${u.outpoint} = ${u.value} sats`))
    }
    
    // Filter and sort UTXOs (largest first, exclude small ones, exclude pending ones)
    const beforeExclusionCount = utxos.length
    const smallOnesCount = utxos.filter((u: any) => u.value <= 800).length
    
    const filteredUtxos = utxos
      .filter((utxo: any) => {
        if (utxo.value <= 800) {
          return false
        }
        if (excludedUtxos.includes(utxo.outpoint)) {
          console.log(`   🚫 Excluding UTXO (in excluded list): ${utxo.outpoint}`)
          return false
        }
        return true
      })
      .sort((a: any, b: any) => b.value - a.value)
      .map((utxo: any) => {
        // Parse outpoint (format: "txid:vout")
        const [txid, vout] = utxo.outpoint.split(':')
        return {
          txid,
          vout: parseInt(vout, 10),
          value: utxo.value,
          outpoint: utxo.outpoint
        }
      })
    
    const excludedCount = beforeExclusionCount - filteredUtxos.length - smallOnesCount
    console.log(`📊 After filtering: ${filteredUtxos.length} UTXOs > 800 sats`)
    console.log(`   Filtered out: ${smallOnesCount} too small (≤800 sats), ${excludedCount} in excluded list`)
    if (filteredUtxos.length > 0) {
      console.log(`   Largest 3:`, filteredUtxos.slice(0, 3).map((u: any) => `${u.value} sats`))
    }
    
    return NextResponse.json({
      success: true,
      utxos: filteredUtxos
    })
  } catch (error) {
    console.error('❌ [Legacy] Error fetching UTXOs for speedup:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch UTXOs'
    }, { status: 500 })
  }
}

