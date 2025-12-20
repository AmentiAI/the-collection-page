import { NextRequest, NextResponse } from 'next/server'
import { Script } from '@cmdcode/tapscript'
import * as cmdEcc from '@cmdcode/crypto-utils'
import { generatePrivateKey } from '@/app/api/self-inscribe/utils/bitcoin'
import { createInscriptionAddresses } from '@/app/api/self-inscribe/utils/inscription'
import { fetchUtxos, filterAndSortUtxos, validateSufficientFunds } from '@/app/api/self-inscribe/utils/utxo'
import { calculateRevealTxFees, calculateCommitTxSize } from '@/app/api/self-inscribe/utils/fees'
import { createCommitPsbt } from '@/app/api/self-inscribe/utils/psbt'
import { getPool } from '@/lib/db'

interface CreateCommitRequest {
  megaMonsterId: string
  compressedBase64: string
  userAddress: string
  paymentAddress: string
  paymentPubkey: string
  taprootPubkey?: string
  feeRate: number
  excludedUtxos?: string[]
}

export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Starting mega monster mint commit transaction (tapscript pattern)...")
    
    const requestBody: CreateCommitRequest = await request.json()
    const { 
      megaMonsterId,
      compressedBase64,
      userAddress, 
      paymentAddress,
      paymentPubkey,
      taprootPubkey,
      feeRate,
      excludedUtxos
    } = requestBody

    // Ensure tables exist
    const pool = getPool()
    
    // Validate mega monster exists
    const megaMonsterCheck = await pool.query(
      `SELECT id, wallet_address, image_blob_url, image_data
       FROM mega_monsters
       WHERE id = $1`,
      [megaMonsterId]
    )
    
    if (megaMonsterCheck.rowCount === 0) {
      return NextResponse.json({
        success: false,
        error: 'Mega monster record not found'
      }, { status: 404 })
    }
    
    const megaMonster = megaMonsterCheck.rows[0]
    
    // Tool fee for mega monsters (same as ascended)
    const TOOL_FEE_SATS = 5500
    const TOOL_FEE_ADDRESS = '3KWMjoT5nVpsUfJrxP1dqyM1b7EMXD3fSY'
    
    console.log(`🔧 Tool fee: ${TOOL_FEE_SATS} sats to ${TOOL_FEE_ADDRESS}`)

    // Generate inscription keypair
    const privKey = generatePrivateKey()
    const pubKey = cmdEcc.keys.get_pubkey(privKey, true)
    
    console.log(`🔑 Generated inscription keypair`)

    // Create inscription script and address
    const inscriptionData = [{
      content: compressedBase64,
      mimeType: 'image/webp'
    }]
    
    const inscriptionAddresses = createInscriptionAddresses(pubKey.hex, inscriptionData)
    const inscriptionAddress = inscriptionAddresses[0]
    
    console.log(`🏠 Created inscription address: ${inscriptionAddress.address}`)

    // Calculate reveal fees
    const revealTxFees = calculateRevealTxFees(inscriptionAddresses, feeRate)
    const revealTxFee = revealTxFees[0].fee
    
    console.log(`💰 Reveal fee calculation:`)
    console.log(`   Virtual size: ${revealTxFees[0].virtualSize} vBytes`)
    console.log(`   Fee: ${revealTxFee} sats (${feeRate} sat/vB)`)
    
    // Minimal safety buffer (2%)
    const baseRevealCost = revealTxFee + 330 // fee + inscription output
    const safetyBuffer = Math.ceil(baseRevealCost * 0.02)
    const revealSatsNeeded = baseRevealCost + safetyBuffer
    
    console.log(`   Base cost: ${baseRevealCost} sats`)
    console.log(`   Safety buffer (2%): ${safetyBuffer} sats`)
    console.log(`   Total reveal sats: ${revealSatsNeeded} sats`)

    // Calculate accurate commit fee
    const utxoScanAddress = paymentAddress || userAddress
    const estimatedInputCount = 2
    const estimatedOutputCount = 3 // inscription + tool fee + change
    const commitSizeEstimate = calculateCommitTxSize(
      estimatedInputCount,
      estimatedOutputCount,
      utxoScanAddress,
      inscriptionAddress.address,
      TOOL_FEE_ADDRESS
    )
    
    const estimatedCommitTxSize = typeof commitSizeEstimate === 'number' 
      ? commitSizeEstimate 
      : commitSizeEstimate.txSize
    
    const estimatedCommitFee = Math.ceil(estimatedCommitTxSize * feeRate)
    const targetForUTXOSelection = revealSatsNeeded + estimatedCommitFee + TOOL_FEE_SATS
    
    console.log(`🔍 Commit size estimate: ${estimatedCommitTxSize} vB`)
    console.log(`🔍 Estimated commit fee: ${estimatedCommitFee} sats at ${feeRate} sat/vB`)
    console.log(`🔍 UTXO selection target: ${targetForUTXOSelection} sats`)

    // Fetch and validate UTXOs (with exclusion list)
    const { utxos: utxosGathered, excludedCount } = await fetchUtxos(utxoScanAddress, excludedUtxos || [])
    const filteredUtxos = filterAndSortUtxos(utxosGathered)
    validateSufficientFunds(filteredUtxos, targetForUTXOSelection, excludedCount)

    // Create commit PSBT
    const commitTx = createCommitPsbt(
      inscriptionAddress.address,
      revealSatsNeeded,
      filteredUtxos,
      utxoScanAddress,
      paymentPubkey,
      taprootPubkey,
      userAddress,
      undefined, // No rare sat
      feeRate,
      TOOL_FEE_SATS,
      TOOL_FEE_ADDRESS,
      0,
      false // Don't burn UTXO
    )

    console.log(`✅ Commit transaction created`)

    // Extract used UTXOs to add to exclusion list
    const usedUtxos: string[] = []
    try {
      const bitcoin = require('bitcoinjs-lib')
      const psbt = commitTx.psbt
      
      for (let i = 0; i < psbt.data.inputs.length; i++) {
        const input = psbt.txInputs[i]
        const txid = Buffer.from(input.hash).reverse().toString('hex')
        const vout = input.index
        const outpoint = `${txid}:${vout}`
        usedUtxos.push(outpoint)
      }
      
      if (usedUtxos.length > 0) {
        console.log(`📋 Extracted ${usedUtxos.length} UTXOs from commit transaction`)
      }
    } catch (extractError) {
      console.warn('⚠️ Failed to extract UTXOs from PSBT:', extractError)
    }

    // Prepare reveal data
    const revealData = {
      inscriptionScript: inscriptionAddress.tapleaf,
      rawInscriptionScript: Script.encode(inscriptionAddress.script).hex,
      inscriptionPrivKey: privKey,
      inscription: inscriptionAddress.inscription,
      taprootInfo: {
        tapkey: inscriptionAddress.tapkey,
        cblock: inscriptionAddress.cblock,
        address: inscriptionAddress.address
      },
      outputs: [
        {
          address: userAddress,
          value: 330
        }
      ],
      fees: {
        commitTxFee: commitTx.actualCommitFee,
        revealTxFee: revealTxFee
      },
      commitOutputValue: revealSatsNeeded,
      commitOutputIndex: commitTx.commitOutputIndex
    }

    // Store reveal data in mega_monsters table
    // First, ensure reveal_data column exists
    try {
      await pool.query(`
        ALTER TABLE mega_monsters 
        ADD COLUMN IF NOT EXISTS reveal_data JSONB
      `)
    } catch (e) {
      // Column might already exist, ignore error
      console.log('reveal_data column check:', e)
    }
    
    // Update wallet_address and store reveal_data
    await pool.query(
      `UPDATE mega_monsters
       SET wallet_address = COALESCE(wallet_address, $1),
           reveal_data = $2
       WHERE id = $3`,
      [userAddress, JSON.stringify(revealData), megaMonsterId]
    )

    console.log(`✅ Updated mega monster wallet address and stored reveal data`)

    const result = {
      success: true,
      type: "inscription_commit",
      megaMonsterId: megaMonsterId,
      commitPsbt: commitTx.psbt.toBase64(),
      commitOutputIndex: commitTx.commitOutputIndex,
      commitOutputValue: revealSatsNeeded,
      usedUtxos: usedUtxos,
      revealData: revealData, // Return reveal data for frontend to store
      fees: {
        commitTxFee: commitTx.actualCommitFee,
        revealTxFee: revealSatsNeeded,
        toolFee: TOOL_FEE_SATS,
        totalCost: commitTx.actualCommitFee + revealSatsNeeded + TOOL_FEE_SATS
      }
    }

    console.log("✅ COMMIT PSBT CREATED")
    console.log(`   Commit fee: ${commitTx.actualCommitFee} sats`)
    console.log(`   Reveal cost: ${revealSatsNeeded} sats`)
    console.log(`   Tool Fee: ${TOOL_FEE_SATS} sats`)
    console.log(`   Total: ${commitTx.actualCommitFee + revealSatsNeeded + TOOL_FEE_SATS} sats`)
    
    return NextResponse.json(result)

  } catch (error) {
    console.error("❌ Error creating commit PSBT:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

