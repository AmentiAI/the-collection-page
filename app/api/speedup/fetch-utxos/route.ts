import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { address, excludedUtxos = [] } = await request.json()
    
    if (!address) {
      return NextResponse.json({
        success: false,
        error: 'Address is required'
      }, { status: 400 })
    }
    
    if (excludedUtxos.length > 0) {
      console.log(`🚫 Excluding ${excludedUtxos.length} UTXOs from selection`)
    }
    
    const SANDSHREW_API_URL = process.env.SANDSHREW_URL || "https://mainnet.sandshrew.io/v2"
    const SANDSHREW_DEVELOPER_KEY = process.env.SANDSHREW_DEVELOPER_KEY
    
    if (!SANDSHREW_DEVELOPER_KEY) {
      throw new Error("SANDSHREW_DEVELOPER_KEY environment variable is not set")
    }
    
    console.log(`🔍 Fetching UTXOs for speedup: ${address.substring(0, 20)}...`)
    
    const requestBody = {
      jsonrpc: "2.0",
      id: "speedup",
      method: 'sandshrew_balances',
      params: [{ address }]
    }
    
    const utxoResponse = await fetch(`${SANDSHREW_API_URL}/${SANDSHREW_DEVELOPER_KEY}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify(requestBody),
      cache: 'no-store'
    })
    
    console.log(`📥 UTXO Response status: ${utxoResponse.status}`)
    
    const responseText = await utxoResponse.text()
    
    if (!utxoResponse.ok) {
      console.error(`❌ HTTP Error ${utxoResponse.status}:`, responseText.substring(0, 200))
      return NextResponse.json({
        success: false,
        error: 'Payment service temporarily unavailable. Please try again.'
      }, { status: 503 })
    }
    
    let utxoResult
    try {
      utxoResult = JSON.parse(responseText)
    } catch (parseError) {
      console.error('❌ Failed to parse UTXO response as JSON')
      console.error('   Response starts with:', responseText.substring(0, 200))
      
      if (responseText.trim().startsWith('<')) {
        return NextResponse.json({
          success: false,
          error: 'Payment service configuration error. Please contact support.'
        }, { status: 503 })
      }
      
      return NextResponse.json({
        success: false,
        error: 'Unable to fetch wallet UTXOs. Please try again.'
      }, { status: 503 })
    }
    
    if (utxoResult.error) {
      console.error('❌ Sandshrew API error:', utxoResult.error)
      return NextResponse.json({
        success: false,
        error: `UTXO fetch error: ${utxoResult.error.message}`
      }, { status: 500 })
    }
    
    const utxos = utxoResult.result?.spendable || []
    console.log(`✅ Found ${utxos.length} spendable UTXOs from Sandshrew`)
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
    console.error('❌ Error fetching UTXOs for speedup:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch UTXOs'
    }, { status: 500 })
  }
}

