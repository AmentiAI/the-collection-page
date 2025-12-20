import { NextRequest, NextResponse } from 'next/server'
import { Address, Script, Tap, Tx, Signer } from '@cmdcode/tapscript'
import * as cmdEcc from '@cmdcode/crypto-utils'
import { createInscriptionScript } from '@/app/api/self-inscribe/utils/inscription'
import { getPool } from '@/lib/db'

interface CreateRevealRequest {
  megaMonsterId: string
  commitTxId: string
  feeRate: number
  revealData?: any // Optional - will fetch from DB if not provided
}

export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Starting mega monster mint reveal transaction (tapscript pattern)...")
    
    const pool = getPool()
    
    const requestBody: CreateRevealRequest = await request.json()
    const { megaMonsterId, commitTxId, feeRate, revealData } = requestBody
    
    // Fetch mega monster record
    const megaMonsterRecord = await pool.query(
      `SELECT id, wallet_address, reveal_data
       FROM mega_monsters
       WHERE id = $1`,
      [megaMonsterId]
    )
    
    if (megaMonsterRecord.rowCount === 0) {
      return NextResponse.json({
        success: false,
        error: 'Mega monster record not found'
      }, { status: 404 })
    }
    
    const megaMonster = megaMonsterRecord.rows[0]
    
    // Use reveal data from request if provided, otherwise from database
    const actualRevealData = revealData || megaMonster.reveal_data
    
    if (!actualRevealData || !actualRevealData.inscriptionPrivKey) {
      return NextResponse.json({
        success: false,
        error: 'Invalid reveal data. Please restart the mint process.'
      }, { status: 400 })
    }

    console.log("📝 Reveal transaction parameters:", {
      megaMonsterId,
      commitTxId: commitTxId.substring(0, 20) + '...',
      feeRate: `${feeRate} sat/vB`,
      hasPrivKey: !!revealData.inscriptionPrivKey
    })

    // Extract data from reveal data
    const { inscriptionPrivKey, taprootInfo, outputs, inscription } = actualRevealData
    const { tapkey, cblock } = taprootInfo
    
    console.log(`🔍 Using stored taproot data:`)
    console.log(`   Tapkey: ${tapkey.substring(0, 40)}...`)
    console.log(`   Cblock: ${cblock.substring(0, 40)}...`)

    // Get commit output value from reveal data
    const commitOutputValue = actualRevealData.commitOutputValue || (outputs[0].value + actualRevealData.fees.revealTxFee)
    const commitOutputIndex = actualRevealData.commitOutputIndex !== undefined ? actualRevealData.commitOutputIndex : 0

    if (commitOutputValue <= 0) {
      throw new Error(`Invalid commitOutputValue: ${commitOutputValue}`)
    }
    
    console.log(`💰 Using commit output value: ${commitOutputValue} sats`)

    // Get the private key and derive public key
    const secKey = cmdEcc.keys.get_seckey(inscriptionPrivKey)
    const pubKey = cmdEcc.keys.get_pubkey(inscriptionPrivKey, true)
    
    let pubKeyHex: string
    
    if (typeof pubKey === 'string') {
      pubKeyHex = pubKey
    } else {
      if ((pubKey as any).hex) {
        pubKeyHex = (pubKey as any).hex
      } else {
        const pubKeyBuffer = Buffer.from(pubKey as any)
        pubKeyHex = pubKeyBuffer.toString('hex')
      }
    }
    
    console.log(`🔑 Final pubKey hex: ${pubKeyHex.substring(0, 20)}...`)
    
    // Recreate inscription script
    const inscriptions = [{
      content: inscription.content,
      mimeType: inscription.mimeType,
      ...(inscription.delegateAddress && { delegateAddress: inscription.delegateAddress })
    }]
    const script = createInscriptionScript(pubKeyHex, inscriptions)
    console.log(`📜 Created script array with ${script.length} elements`)
    
    const tapleaf = Tap.encodeScript(script)
    console.log(`🍃 Encoded tapleaf: ${tapleaf.length} chars`)
    
    // Verify tapleaf matches
    if (tapleaf !== actualRevealData.inscriptionScript) {
      console.error('❌ TAPLEAF MISMATCH!')
      throw new Error('Tapleaf mismatch - script recreation failed')
    }
    console.log('✅ Tapleaf matches stored value')
    
    // Verify tapkey and cblock
    const [recreatedTapkey, recreatedCblock] = Tap.getPubKey(pubKeyHex, { target: tapleaf })
    
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

    // Sign the transaction
    console.log("✍️ Signing reveal transaction...")
    const sig = Signer.taproot.sign(secKey, txData, 0, { extension: tapleaf })
    
    // Set the witness data
    txData.vin[0].witness = [sig, script, cblock]
    
    console.log("✅ Reveal transaction signed successfully")

    // Encode the transaction to hex
    const signedTxHex = Tx.encode(txData).hex
    console.log(`📦 Signed transaction hex: ${signedTxHex.substring(0, 60)}...`)

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
    
    // Clear reveal_data from database after successful reveal creation
    await pool.query(
      `UPDATE mega_monsters
       SET reveal_data = NULL
       WHERE id = $1`,
      [megaMonsterId]
    )
    
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

