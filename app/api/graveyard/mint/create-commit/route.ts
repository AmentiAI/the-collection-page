import { NextRequest, NextResponse } from 'next/server'
import { Script } from '@cmdcode/tapscript'
import * as cmdEcc from '@cmdcode/crypto-utils'
import { generatePrivateKey } from '@/app/api/self-inscribe/utils/bitcoin'
import { createInscriptionAddresses } from '@/app/api/self-inscribe/utils/inscription'
import { fetchUtxos, filterAndSortUtxos, validateSufficientFunds } from '@/app/api/self-inscribe/utils/utxo'
import { calculateRevealTxFees, calculateCommitTxSize } from '@/app/api/self-inscribe/utils/fees'
import { createCommitPsbt } from '@/app/api/self-inscribe/utils/psbt'
import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'
import type { Pool } from 'pg'

interface CreateCommitRequest {
  mintQueueId: string
  compressedBase64: string
  userAddress: string
  paymentAddress: string
  paymentPubkey: string
  taprootPubkey?: string
  feeRate: number
  excludedUtxos?: string[]
}

async function ensureMintInfrastructure(pool: Pool) {
  // Skip if already initialized to avoid redundant DDL operations
  if (isTableInitialized('mint_inscriptions')) {
    return
  }

  console.log('🔧 Initializing mint infrastructure...')
  
  // Create main mint tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mint_inscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mint_queue_id UUID NOT NULL REFERENCES ascended_images_mint_queue(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      payment_address TEXT,
      receiving_address TEXT NOT NULL,
      
      -- Transaction tracking
      commit_tx_id TEXT,
      reveal_tx_id TEXT,
      inscription_id TEXT,
      
      -- Image data
      original_image_url TEXT NOT NULL,
      compressed_image_url TEXT,
      compressed_base64 TEXT,
      is_compressed BOOLEAN DEFAULT FALSE,
      
      -- Fee and gas tracking
      fee_rate DECIMAL NOT NULL,
      commit_fee_sats INTEGER,
      reveal_fee_sats INTEGER,
      total_cost_sats INTEGER,
      
      -- Status tracking
      mint_status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      
      -- Timestamps
      created_at TIMESTAMPTZ DEFAULT NOW(),
      commit_broadcast_at TIMESTAMPTZ,
      commit_confirmed_at TIMESTAMPTZ,
      reveal_broadcast_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      
      -- Reveal data (stored for creating reveal tx)
      reveal_data JSONB,
      
      UNIQUE(mint_queue_id)
    )
  `)
  
  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_wallet ON mint_inscriptions(LOWER(wallet_address))
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_status ON mint_inscriptions(mint_status)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_commit_tx ON mint_inscriptions(commit_tx_id)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_reveal_tx ON mint_inscriptions(reveal_tx_id)
  `)
  
  // Add fields to ascended_images_mint_queue if they don't exist
  await pool.query(`
    ALTER TABLE ascended_images_mint_queue 
    ADD COLUMN IF NOT EXISTS mint_status TEXT DEFAULT 'awaiting_mint',
    ADD COLUMN IF NOT EXISTS compressed_image_url TEXT,
    ADD COLUMN IF NOT EXISTS compressed_size_bytes INTEGER,
    ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT FALSE
  `)
  
  console.log('✅ Mint infrastructure initialized')
  
  markTableInitialized('mint_inscriptions')
}

export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Starting mint commit transaction (tapscript pattern)...")
    
    const requestBody: CreateCommitRequest = await request.json()
    const { 
      mintQueueId,
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
    await ensureMintInfrastructure(pool)
    
    // Validate mint queue exists and get source_inscription_id to determine if demon or ascended
    const mintQueueCheck = await pool.query(
      `SELECT id, wallet_address, image_url, compressed_image_url, is_compressed, source_inscription_id
       FROM ascended_images_mint_queue
       WHERE id = $1`,
      [mintQueueId]
    )
    
    if (mintQueueCheck.rowCount === 0) {
      return NextResponse.json({
        success: false,
        error: 'Mint queue record not found'
      }, { status: 404 })
    }
    
    const mintQueue = mintQueueCheck.rows[0]
    const isDemon = !mintQueue.source_inscription_id?.toLowerCase().startsWith('ascended_')
    
    // Verify wallet matches
    if (mintQueue.wallet_address.toLowerCase() !== userAddress.toLowerCase()) {
      return NextResponse.json({
        success: false,
        error: 'Wallet address does not match mint queue record'
      }, { status: 403 })
    }

    // Tool fee varies based on inscription type
    const ASCENDED_FEE_SATS = 6500
    const DEMON_FEE_SATS = 6500
    const TOOL_FEE_ADDRESS = '3KWMjoT5nVpsUfJrxP1dqyM1b7EMXD3fSY'
    
    const toolFeeInSats = isDemon ? DEMON_FEE_SATS : ASCENDED_FEE_SATS
    const toolFeeAddressFromSettings = TOOL_FEE_ADDRESS
    
    console.log(`🔧 Tool fee: ${toolFeeInSats} sats to ${TOOL_FEE_ADDRESS} (${isDemon ? 'Demon' : 'Ascended'})`)

    // Generate inscription keypair
    const privKey = generatePrivateKey()
    const pubKey = cmdEcc.keys.get_pubkey(privKey, true)
    
    console.log(`🔑 Generated inscription keypair`)
    console.log(`🔍 PrivKey length: ${privKey.length}`)
    console.log(`🔍 PrivKey preview: ${privKey.substring(0, 20)}...`)
    console.log(`🔍 PubKey type: ${typeof pubKey}, has hex: ${'hex' in pubKey}`)
    console.log(`🔑 PubKey hex: ${pubKey.hex.substring(0, 20)}... (length: ${pubKey.hex.length})`)

    // Create inscription script and address
    const inscriptionData = [{
      content: compressedBase64,
      mimeType: 'image/webp'
    }]
    
    console.log(`📝 Inscription content length BEFORE createInscriptionAddresses: ${compressedBase64.length}`)
    console.log(`📝 Content preview: ${compressedBase64.substring(0, 50)}...`)
    
    const inscriptionAddresses = createInscriptionAddresses(pubKey.hex, inscriptionData)
    const inscriptionAddress = inscriptionAddresses[0]
    
    console.log(`🏠 Created inscription address: ${inscriptionAddress.address}`)
    console.log(`📝 Inscription content length AFTER (from inscriptionAddress.inscription): ${inscriptionAddress.inscription.content.length}`)

    // Calculate reveal fees
    const revealTxFees = calculateRevealTxFees(inscriptionAddresses, feeRate)
    const revealTxFee = revealTxFees[0].fee
    
    console.log(`💰 Reveal fee calculation:`)
    console.log(`   Virtual size: ${revealTxFees[0].virtualSize} vBytes`)
    console.log(`   Fee: ${revealTxFee} sats (${feeRate} sat/vB)`)
    
    // Minimal safety buffer (2% instead of 15%)
    const baseRevealCost = revealTxFee + 330 // fee + inscription output
    const safetyBuffer = Math.ceil(baseRevealCost * 0.02)
    const revealSatsNeeded = baseRevealCost + safetyBuffer
    
    console.log(`   Base cost: ${baseRevealCost} sats`)
    console.log(`   Safety buffer (2%): ${safetyBuffer} sats`)
    console.log(`   Total reveal sats: ${revealSatsNeeded} sats`)

    // Calculate accurate commit fee based on actual address types
    // Estimate 2-3 inputs typically needed for this transaction size
    const utxoScanAddress = paymentAddress || userAddress
    const estimatedInputCount = 2
    const estimatedOutputCount = 3 // inscription + tool fee + change
    const commitSizeEstimate = calculateCommitTxSize(
      estimatedInputCount,
      estimatedOutputCount,
      utxoScanAddress,
      inscriptionAddress.address,
      toolFeeAddressFromSettings
    )
    
    const estimatedCommitTxSize = typeof commitSizeEstimate === 'number' 
      ? commitSizeEstimate 
      : commitSizeEstimate.txSize
    
    const estimatedCommitFee = Math.ceil(estimatedCommitTxSize * feeRate)
    const targetForUTXOSelection = revealSatsNeeded + estimatedCommitFee + toolFeeInSats
    
    console.log(`🔍 Commit size estimate: ${estimatedCommitTxSize} vB (was 280 vB hardcoded)`)
    console.log(`🔍 Estimated commit fee: ${estimatedCommitFee} sats at ${feeRate} sat/vB`)
    console.log(`🔍 UTXO selection target: ${targetForUTXOSelection} sats`)

    // Fetch and validate UTXOs (with exclusion list)
    const { utxos: utxosGathered, excludedCount } = await fetchUtxos(utxoScanAddress, excludedUtxos || [])
    const filteredUtxos = filterAndSortUtxos(utxosGathered)
    validateSufficientFunds(filteredUtxos, targetForUTXOSelection, excludedCount)

    // Create commit PSBT
    const commitTx = createCommitPsbt(
      inscriptionAddress.address,
      revealSatsNeeded, // Output value for reveal
      filteredUtxos,
      utxoScanAddress,
      paymentPubkey,
      taprootPubkey,
      userAddress,
      undefined, // No rare sat
      feeRate,
      toolFeeInSats,
      toolFeeAddressFromSettings,
      0,
      false // Don't burn UTXO
    )

    console.log(`✅ Commit transaction created`)

    // Extract used UTXOs to add to exclusion list
    const usedUtxos: string[] = []
    try {
      const bitcoin = require('bitcoinjs-lib')
      const psbt = commitTx.psbt
      
      // Extract all payment UTXO outpoints (skip first input if it's inscription/rare sat)
      const startIndex = 0 // All inputs are payment UTXOs in our case
      for (let i = startIndex; i < psbt.data.inputs.length; i++) {
        const input = psbt.txInputs[i]
        const txid = Buffer.from(input.hash).reverse().toString('hex')
        const vout = input.index
        const outpoint = `${txid}:${vout}`
        usedUtxos.push(outpoint)
      }
      
      if (usedUtxos.length > 0) {
        console.log(`📋 Extracted ${usedUtxos.length} UTXOs from commit transaction:`)
        usedUtxos.forEach((outpoint, idx) => {
          console.log(`   ${idx + 1}. ${outpoint}`)
        })
      }
    } catch (extractError) {
      console.warn('⚠️ Failed to extract UTXOs from PSBT:', extractError)
      // Don't fail the whole request if extraction fails
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
      // CRITICAL: Store the actual commit output value (includes safety buffer)
      commitOutputValue: revealSatsNeeded,
      commitOutputIndex: commitTx.commitOutputIndex
    }

    // Create mint inscription record
    const insertResult = await pool.query(
      `INSERT INTO mint_inscriptions (
        mint_queue_id, wallet_address, payment_address, receiving_address,
        original_image_url, compressed_image_url, is_compressed,
        fee_rate, total_cost_sats, mint_status, reveal_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (mint_queue_id) 
      DO UPDATE SET 
        fee_rate = $8,
        total_cost_sats = $9,
        mint_status = $10,
        reveal_data = $11,
        created_at = NOW()
      RETURNING id`,
      [
        mintQueueId,
        userAddress,
        paymentAddress || null,
        userAddress,
        mintQueue.image_url,
        mintQueue.compressed_image_url,
        mintQueue.is_compressed || false,
        feeRate,
        commitTx.actualCommitFee + revealTxFee,
        'pending',
        JSON.stringify(revealData)
      ]
    )

    const mintInscriptionId = insertResult.rows[0].id

    console.log(`✅ Created mint inscription record: ${mintInscriptionId}`)

    const result = {
      success: true,
      type: "inscription_commit",
      mintInscriptionId: mintInscriptionId,
      commitPsbt: commitTx.psbt.toBase64(),
      commitOutputIndex: commitTx.commitOutputIndex,
      commitOutputValue: revealSatsNeeded,
      usedUtxos: usedUtxos, // Return used UTXOs for frontend to exclude
      fees: {
        commitTxFee: commitTx.actualCommitFee,
        revealTxFee: revealTxFee,
        toolFee: toolFeeInSats,
        totalCost: commitTx.actualCommitFee + revealTxFee + toolFeeInSats
      }
    }

    console.log("✅ COMMIT PSBT CREATED")
    console.log(`   Commit fee: ${commitTx.actualCommitFee} sats`)
    console.log(`   Reveal fee: ${revealTxFee} sats`)
    console.log(`   Ascension Cost: ${toolFeeInSats} sats (${isDemon ? 'Demon' : 'Ascended'})`)
    console.log(`   Total: ${commitTx.actualCommitFee + revealTxFee + toolFeeInSats} sats`)
    
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

