import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { addInputSigningInfo, getAddressType } from '@/app/api/self-inscribe/utils/bitcoin'

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc)

export async function POST(request: NextRequest) {
  try {
    const {
      parentTxid,
      outputIndex,
      outputValue,
      outputAddress,
      userAddress,
      childFee,
      additionalUtxos,
      paymentPublicKey,
      taprootPublicKey,
      preserveAnchorValue = true
    } = await request.json()

    const normalizeKey = (key?: string | { type: string; data: number[] } | Uint8Array) => {
      if (!key) return undefined
      if (typeof key === 'string') return key
      if (key instanceof Uint8Array) return Buffer.from(key).toString('hex')
      if (typeof key === 'object' && Array.isArray((key as any).data)) {
        return Buffer.from((key as any).data).toString('hex')
      }
      return undefined
    }

    const normalizedPaymentKey = normalizeKey(paymentPublicKey)
    const normalizedTaprootKey = normalizeKey(taprootPublicKey)
    
    console.log(`🔨 Creating Hybrid CPFP PSBT:`)
    console.log(`   Parent TX: ${parentTxid}`)
    console.log(`   Parent Output: #${outputIndex} (${outputValue} sats)`)
    console.log(`   Child Fee Needed: ${childFee} sats`)
    console.log(`   Additional UTXOs: ${additionalUtxos?.length || 0}`)
    console.log(`   User Address: ${userAddress}`)
    console.log(`   Address Type: ${getAddressType(userAddress)}`)
    console.log(`   Preserve Anchor Value: ${preserveAnchorValue}`)
    
    // Calculate total input value
    let totalInputValue = outputValue
    const additionalInputValue = additionalUtxos?.reduce((sum: number, utxo: any) => sum + utxo.value, 0) || 0
    totalInputValue += additionalInputValue
    
    console.log(`   Total Input Value: ${totalInputValue} sats (${outputValue} from parent + ${additionalInputValue} from wallet)`)
    
    // Calculate change: total inputs - inscription output - fee
    const MIN_SIMPLE_OUTPUT = 546
    let inscriptionOutput = outputValue
    if (!preserveAnchorValue) {
      const reducedAmount = outputValue - childFee
      if (reducedAmount < MIN_SIMPLE_OUTPUT) {
        return NextResponse.json(
          {
            success: false,
            error: `Child fee ${childFee} sats is too high for your output (${outputValue} sats). Keep at least ${MIN_SIMPLE_OUTPUT} sats or add additional funds.`
          },
          { status: 400 }
        )
      }
      inscriptionOutput = reducedAmount
    }

    let changeAmount = totalInputValue - inscriptionOutput - childFee
    let actualFee = childFee
    
    if (changeAmount < 0) {
      return NextResponse.json({
        success: false,
        error: `Need ${Math.abs(changeAmount)} more sats. Total inputs (${totalInputValue} sats) - inscription (${inscriptionOutput} sats) - fee (${childFee} sats) = ${changeAmount} sats.`
      }, { status: 400 })
    }
    
    // Bitcoin dust limit: outputs must be >= 546 sats
    // If change is less than dust limit, add it to the fee instead
    const DUST_LIMIT = 546
    if (changeAmount > 0 && changeAmount < DUST_LIMIT) {
      console.log(`⚠️ Change amount (${changeAmount} sats) is below dust limit (${DUST_LIMIT} sats)`)
      console.log(`   Adding change to fee instead of creating dust output`)
      actualFee += changeAmount
      changeAmount = 0
    }
    
    console.log(`   Inscription Output: ${inscriptionOutput} sats ${preserveAnchorValue ? '(preserved)' : '(adjusted)'}`)
    console.log(`   Change Amount: ${changeAmount} sats${changeAmount === 0 ? ' (dust added to fee)' : ''}`)
    console.log(`   Actual Fee: ${actualFee} sats`)
    
    // Create PSBT
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })
    
    // Fetch parent transaction to get output details
    const parentTxResponse = await fetch(`https://mempool.space/api/tx/${parentTxid}/hex`)
    if (!parentTxResponse.ok) {
      throw new Error('Failed to fetch parent transaction')
    }
    const parentTxHex = await parentTxResponse.text()
    const parentTx = bitcoin.Transaction.fromHex(parentTxHex)
    
    console.log(`📥 Fetched parent transaction hex`)
    
    // Get the specific output we're spending from parent
    const parentUtxo = parentTx.outs[outputIndex]
    
    // Add input #1: from parent tx output (this links the CPFP)
    psbt.addInput({
      hash: parentTxid,
      index: outputIndex,
      witnessUtxo: {
        script: parentUtxo.script,
        value: BigInt(outputValue)
      }
    })
    
    // Add signing info for parent output (usually taproot ordinals address)
    addInputSigningInfo(psbt, 0, outputAddress, normalizedPaymentKey, normalizedTaprootKey, Number(outputValue))
    
    console.log(`✅ Added input #1 from parent TX (${outputValue} sats)`)
    
    // Add additional UTXOs as inputs to cover the fee
    if (additionalUtxos && additionalUtxos.length > 0) {
      for (let i = 0; i < additionalUtxos.length; i++) {
        const utxo = additionalUtxos[i]
        
        // Fetch the transaction containing this UTXO
        const utxoTxResponse = await fetch(`https://mempool.space/api/tx/${utxo.txid}/hex`)
        if (!utxoTxResponse.ok) {
          throw new Error(`Failed to fetch UTXO transaction ${utxo.txid}`)
        }
        const utxoTxHex = await utxoTxResponse.text()
        const utxoTx = bitcoin.Transaction.fromHex(utxoTxHex)
        const utxoOutput = utxoTx.outs[utxo.vout]
        
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: utxoOutput.script,
            value: BigInt(utxo.value)
          }
        })
        
        // Add signing info for wallet UTXO (from payment address - could be P2SH, P2WPKH, or P2TR)
        addInputSigningInfo(psbt, i + 1, userAddress, normalizedPaymentKey, normalizedTaprootKey, Number(utxo.value))
        
        console.log(`✅ Added input #${i + 2} from wallet UTXO (${utxo.value} sats)`)
      }
    }
    
    // Decode addresses to get output scripts
    let inscriptionOutputScript: Uint8Array
    let changeOutputScript: Uint8Array
    
    try {
      inscriptionOutputScript = bitcoin.address.toOutputScript(outputAddress, bitcoin.networks.bitcoin)
    } catch (err) {
      console.error('❌ Inscription address decode error:', err)
      return NextResponse.json({
        success: false,
        error: 'Invalid inscription address'
      }, { status: 400 })
    }
    
    try {
      changeOutputScript = bitcoin.address.toOutputScript(userAddress, bitcoin.networks.bitcoin)
    } catch (err) {
      console.error('❌ User address decode error:', err)
      return NextResponse.json({
        success: false,
        error: 'Invalid user address'
      }, { status: 400 })
    }
    
    // Add output #0: Preserve inscription output (330 sats to original address)
    psbt.addOutput({
      script: Buffer.from(inscriptionOutputScript),
      value: BigInt(inscriptionOutput)
    })
    
    console.log(`✅ Added output #0: Inscription (${inscriptionOutput} sats to ${outputAddress.substring(0, 20)}...)`)
    
    // Add output #1: Change back to user's wallet
    if (changeAmount > 0) {
      psbt.addOutput({
        script: Buffer.from(changeOutputScript),
        value: BigInt(changeAmount)
      })
      console.log(`✅ Added output #1: Change (${changeAmount} sats to user's wallet)`)
    }
    
    console.log(`📊 Hybrid CPFP PSBT created successfully:`)
    console.log(`   Inputs: ${1 + (additionalUtxos?.length || 0)} (${totalInputValue} sats total)`)
    console.log(`   Outputs: ${changeAmount > 0 ? 2 : 1} (${inscriptionOutput} sats inscription${changeAmount > 0 ? ` + ${changeAmount} sats change` : ''})`)
    console.log(`   Fee: ${actualFee} sats`)
    
    // Estimated size: base (110 vB) + inputs (68 vB each) + outputs (43 vB each, but we have 2 outputs so +43)
    const estimatedSize = 110 + (1 + (additionalUtxos?.length || 0)) * 68 + (changeAmount > 0 ? 2 : 1) * 43
    
    return NextResponse.json({
      success: true,
      psbt: psbt.toBase64(),
      details: {
        inputValue: totalInputValue,
        inscriptionOutput,
        changeOutput: changeAmount,
        totalOutput: inscriptionOutput + changeAmount,
        fee: actualFee,
        feeRate: (actualFee / estimatedSize).toFixed(2),
        inputCount: 1 + (additionalUtxos?.length || 0),
        outputCount: changeAmount > 0 ? 2 : 1,
        estimatedSize
      }
    })
    
  } catch (error) {
    console.error('❌ Error creating CPFP PSBT:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create CPFP PSBT'
    }, { status: 500 })
  }
}

