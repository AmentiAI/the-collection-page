import { NextRequest, NextResponse } from 'next/server'
import { Address, Script, Tap, Tx, Signer } from '@cmdcode/tapscript'
import * as cmdEcc from '@cmdcode/crypto-utils'
import { createInscriptionScript } from '@/app/api/self-inscribe/utils/inscription'
import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'
import type { Pool } from 'pg'

async function ensureMintInfrastructure(pool: Pool) {
  if (isTableInitialized('mint_inscriptions')) {
    return
  }

  console.log('🔧 Initializing mint infrastructure (create-reveal endpoint)...')

  // Create mint_inscriptions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mint_inscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mint_queue_id UUID REFERENCES ascended_images_mint_queue(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      payment_address TEXT,
      receiving_address TEXT,
      
      commit_tx_id TEXT,
      reveal_tx_id TEXT,
      inscription_id TEXT,
      
      commit_psbt_base64 TEXT,
      reveal_psbt_base64 TEXT,
      signed_commit_tx_hex TEXT,
      signed_reveal_tx_hex TEXT,
      
      fee_rate DECIMAL(10, 2) NOT NULL,
      commit_fee_sats INTEGER,
      reveal_fee_sats INTEGER,
      total_cost_sats INTEGER,
      
      original_image_url TEXT NOT NULL,
      compressed_image_url TEXT,
      compressed_base64 TEXT,
      is_compressed BOOLEAN DEFAULT FALSE,
      
      mint_status TEXT NOT NULL DEFAULT 'pending_compression',
      error_message TEXT,
      
      reveal_data JSONB,
      
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      commit_signed_at TIMESTAMPTZ,
      commit_broadcast_at TIMESTAMPTZ,
      commit_confirmed_at TIMESTAMPTZ,
      reveal_broadcast_at TIMESTAMPTZ,
      reveal_confirmed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      
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

interface CreateRevealRequest {
  mintInscriptionId: string
  commitTxId: string
  feeRate: number
}

export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Starting mint reveal transaction (tapscript pattern)...")
    
    const pool = getPool()
    await ensureMintInfrastructure(pool)
    
    const requestBody: CreateRevealRequest = await request.json()
    const { mintInscriptionId, commitTxId, feeRate } = requestBody
    
    // Fetch mint inscription record
    const mintRecord = await pool.query(
      `SELECT id, wallet_address, receiving_address, reveal_data, mint_status
       FROM mint_inscriptions
       WHERE id = $1`,
      [mintInscriptionId]
    )
    
    if (mintRecord.rowCount === 0) {
      return NextResponse.json({
        success: false,
        error: 'Mint inscription record not found'
      }, { status: 404 })
    }
    
    const mint = mintRecord.rows[0]
    
    // Verify status
    if (mint.mint_status !== 'commit_confirmed' && mint.mint_status !== 'pending') {
      console.log(`⚠️ Creating reveal for mint in ${mint.mint_status} status`)
    }
    
    const revealData = mint.reveal_data
    
    if (!revealData || !revealData.inscriptionPrivKey) {
      return NextResponse.json({
        success: false,
        error: 'Invalid reveal data in mint record'
      }, { status: 400 })
    }

    console.log("📝 Reveal transaction parameters:", {
      mintInscriptionId,
      commitTxId: commitTxId.substring(0, 20) + '...',
      feeRate: `${feeRate} sat/vB`,
      hasPrivKey: !!revealData.inscriptionPrivKey
    })

    // Extract data from stored reveal data
    const { inscriptionPrivKey, taprootInfo, outputs, inscription } = revealData
    const { tapkey, cblock } = taprootInfo
    
    console.log(`🔍 Using stored taproot data:`)
    console.log(`   Tapkey: ${tapkey.substring(0, 40)}...`)
    console.log(`   Cblock: ${cblock.substring(0, 40)}...`)

    // Get commit output value from reveal data (includes safety buffer)
    const commitOutputValue = revealData.commitOutputValue || (outputs[0].value + revealData.fees.revealTxFee)
    const commitOutputIndex = revealData.commitOutputIndex !== undefined ? revealData.commitOutputIndex : 0

    // Validate commit output value
    if (commitOutputValue <= 0) {
      throw new Error(`Invalid commitOutputValue: ${commitOutputValue}`)
    }
    
    console.log(`💰 Using commit output value: ${commitOutputValue} sats`)
    console.log(`   (includes ${outputs[0].value} sats inscription output + fees + safety buffer)`)

    // Get the private key and derive public key (EXACT LaserEyes pattern)
    console.log(`🔍 Stored PrivKey length: ${inscriptionPrivKey.length}`)
    console.log(`🔍 Stored PrivKey preview: ${inscriptionPrivKey.substring(0, 20)}...`)
    const secKey = cmdEcc.keys.get_seckey(inscriptionPrivKey)
    const pubKey = cmdEcc.keys.get_pubkey(inscriptionPrivKey, true)
    
    console.log("🔑 Using inscription private key for signing")
    console.log(`🔍 PubKey object type: ${typeof pubKey}`)
    console.log(`🔍 PubKey has hex property: ${'hex' in pubKey}`)
    console.log(`🔍 PubKey keys: ${Object.keys(pubKey)}`)

    // RECREATE the script exactly like LaserEyes does (critical!)
    // CRITICAL: cmdEcc may return different formats - we need 33-byte compressed key
    let pubKeyHex: string
    
    if (typeof pubKey === 'string') {
      pubKeyHex = pubKey
      console.log(`🔑 PubKey is string`)
    } else {
      // Check if it has .hex property - this is what commit used!
      if ((pubKey as any).hex) {
        pubKeyHex = (pubKey as any).hex
        console.log(`✅ Using pubKey.hex property (SAME as commit used)`)
        console.log(`   Length: ${pubKeyHex.length} chars`)
      } else {
        // Fall back to buffer conversion
        const pubKeyBuffer = Buffer.from(pubKey as any)
        pubKeyHex = pubKeyBuffer.toString('hex')
        console.log(`✅ Using buffer.toString('hex')`)
        console.log(`   Length: ${pubKeyHex.length} chars`)
      }
    }
    
    console.log(`🔑 Final pubKey hex: ${pubKeyHex.substring(0, 20)}...`)
    console.log(`🔑 Full pubKey hex length: ${pubKeyHex.length} chars`)
    
    // Don't validate length - commit used whatever length cmdEcc gave it!
    // if (pubKeyHex.length !== 66) {
    //   console.error(`❌ CRITICAL: PubKey hex length is ${pubKeyHex.length}, expected 66!`)
    //   throw new Error(`PubKey hex length is ${pubKeyHex.length}, expected 66 for compressed key!`)
    // }
    
    // CRITICAL: Pass the ENTIRE inscription object, not just content/mimeType
    // The inscription may have additional fields like delegateAddress or parentInscriptionId
    // that affect the script generation
    console.log(`📝 Recreating script with inscription:`)
    console.log(`   Content length: ${inscription.content ? inscription.content.length : 'MISSING!'} chars`)
    console.log(`   Content first 50 chars: ${inscription.content ? inscription.content.substring(0, 50) : 'MISSING!'}`)
    console.log(`   MIME type: ${inscription.mimeType}`)
    console.log(`   Has delegateAddress: ${!!inscription.delegateAddress}`)
    console.log(`   Full inscription object keys: ${Object.keys(inscription).join(', ')}`)
    console.log(`   Inscription object JSON: ${JSON.stringify(inscription).substring(0, 200)}...`)
    
    // CRITICAL: Explicitly reconstruct inscription object like working code does
    // This ensures ONLY the required fields are passed (no extra properties)
    const inscriptions = [{
      content: inscription.content,
      mimeType: inscription.mimeType,
      ...(inscription.delegateAddress && { delegateAddress: inscription.delegateAddress })
    }]
    const script = createInscriptionScript(pubKeyHex, inscriptions)
    console.log(`📜 Created script array with ${script.length} elements`)
    
    const tapleaf = Tap.encodeScript(script)
    console.log(`🍃 Encoded tapleaf: ${tapleaf.length} chars`)
    
    console.log(`🍃 Recreated tapleaf: ${tapleaf.substring(0, 40)}...`)
    console.log(`🔍 Stored tapleaf:   ${revealData.inscriptionScript.substring(0, 40)}...`)
    
    // CRITICAL COMPARISON
    if (tapleaf === revealData.inscriptionScript) {
      console.log('✅✅✅ TAPLEAF MATCH - Script recreation is PERFECT!')
    } else {
      console.error('❌❌❌ TAPLEAF MISMATCH - Script recreation FAILED!')
      console.error(`   Recreated: ${tapleaf}`)
      console.error(`   Stored:    ${revealData.inscriptionScript}`)
      throw new Error('FATAL: Tapleaf mismatch - cannot proceed with reveal')
    }
    
    // Verify tapleaf matches (safety check)
    if (tapleaf !== revealData.inscriptionScript) {
      console.error('❌ TAPLEAF MISMATCH!')
      console.error(`   Created: ${tapleaf}`)
      console.error(`   Stored:  ${revealData.inscriptionScript}`)
      throw new Error('Tapleaf mismatch - script recreation failed')
    }
    console.log('✅ Tapleaf matches stored value')
    
    // Verify tapkey and cblock by recreating them
    const [recreatedTapkey, recreatedCblock] = Tap.getPubKey(pubKeyHex, { target: tapleaf })
    console.log(`🔍 Verifying taproot commitment:`)
    console.log(`   Recreated tapkey: ${recreatedTapkey.substring(0, 40)}...`)
    console.log(`   Stored tapkey:    ${tapkey.substring(0, 40)}...`)
    console.log(`   Tapkey match: ${recreatedTapkey === tapkey ? '✅' : '❌'}`)
    console.log(`   Recreated cblock: ${recreatedCblock.substring(0, 40)}...`)
    console.log(`   Stored cblock:    ${cblock.substring(0, 40)}...`)
    console.log(`   Cblock match: ${recreatedCblock === cblock ? '✅' : '❌'}`)
    
    if (recreatedTapkey !== tapkey || recreatedCblock !== cblock) {
      throw new Error('Taproot commitment mismatch - tapkey or cblock does not match')
    }

    // Simple output structure
    const simpleOutputs = [
      {
        value: 330, // Inscription output
        address: outputs[0].address
      }
    ]

    const totalOutputValue = simpleOutputs.reduce((sum, output) => sum + output.value, 0)
    const actualFee = commitOutputValue - totalOutputValue
    
    console.log(`🔍 REVEAL TRANSACTION BREAKDOWN:`)
    console.log(`   Input: ${commitOutputValue} sats`)
    console.log(`   Inscription output: 330 sats`)
    console.log(`   Actual fee: ${actualFee} sats`)

    // Create reveal transaction
    const txData = Tx.create({
      vin: [
        {
          txid: commitTxId,
          vout: commitOutputIndex,
          prevout: {
            value: commitOutputValue,
            scriptPubKey: ['OP_1', tapkey],
          },
        },
      ],
      vout: simpleOutputs.map(output => ({
        value: output.value,
        scriptPubKey: Address.toScriptPubKey(output.address),
      }))
    })

    console.log(`🔨 Created reveal transaction`)

    // Sign the transaction using tapscript Signer
    console.log("✍️ Signing reveal transaction...")
    const sig = Signer.taproot.sign(secKey, txData, 0, { extension: tapleaf })
    
    // Set the witness data manually (EXACT LaserEyes pattern: [sig, script, cblock])
    txData.vin[0].witness = [sig, script, cblock]
    
    console.log("✅ Reveal transaction signed successfully")
    console.log(`🔍 Witness structure: [sig, script(${script.length}), cblock(${cblock.length})]`)

    // Encode the transaction to hex for broadcasting
    const signedTxHex = Tx.encode(txData).hex
    console.log(`📦 Signed transaction hex: ${signedTxHex.substring(0, 60)}...`)
    console.log(`📏 Transaction size: ${signedTxHex.length / 2} bytes`)

    // Get transaction ID
    const txId = Tx.util.getTxid(txData)
    console.log(`🆔 Transaction ID: ${txId}`)

    const result = {
      success: true,
      signedTxHex,
      txId,
      transaction: {
        inputCount: txData.vin.length,
        outputCount: txData.vout.length,
        commitTxId,
        commitOutputValue,
        totalOutputValue,
        transactionFee: actualFee
      }
    }

    console.log("🎉 REVEAL TRANSACTION COMPLETED!")
    console.log(`   Transaction ID: ${txId}`)
    
    return NextResponse.json(result)

  } catch (error) {
    console.error("❌ Error creating reveal transaction:", error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error creating reveal transaction'
      },
      { status: 500 }
    )
  }
}

