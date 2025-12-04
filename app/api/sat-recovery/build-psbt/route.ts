import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'

import { addInputSigningInfo } from '@/app/api/self-inscribe/utils/bitcoin'
import { fetchSandshrewTx } from '@/lib/sandshrew'

bitcoin.initEccLib(ecc)

export const dynamic = 'force-dynamic'

// Constants
const MIN_INSCRIPTION_OUTPUT = 330
const MIN_PAYMENT_OUTPUT = 546
const TAPROOT_INPUT_VBYTES = 58
const TAPROOT_OUTPUT_VBYTES = 43
const P2WPKH_OUTPUT_VBYTES = 31
const TX_OVERHEAD_VBYTES = 10

interface RecoveryInput {
  txid: string
  vout: number
  value: number
}

interface BuildRecoveryPsbtRequest {
  inputs: RecoveryInput[]
  taprootAddress: string
  paymentAddress: string
  paymentPublicKey?: string
  taprootPublicKey?: string
  feeRate: number
  additionalPaymentInput?: {
    txid: string
    vout: number
    value: number
  } | null
}

function isTaprootAddress(address: string): boolean {
  // Taproot addresses start with bc1p and are 62 characters long
  return address.startsWith('bc1p') && address.length === 62
}

function estimateTransactionVsize(
  inputCount: number, 
  taprootAddress: string, 
  paymentAddress: string,
  inscriptionInputCount?: number,
  hasChangeOutput?: boolean
): number {
  // For sat recovery transactions:
  // - inputCount total inputs (taproot, 58 vbytes each)
  // - inscriptionInputCount inscription outputs (taproot, 43 vbytes each) - defaults to inputCount
  // - inscriptionInputCount payment outputs (taproot if bc1p, 43 vbytes; P2WPKH if bc1q, 31 vbytes)
  // - 1 change output if hasChangeOutput (same type as payment outputs)
  // - Transaction overhead (10 vbytes)
  const actualInscriptionInputs = inscriptionInputCount ?? inputCount
  const inscriptionOutputs = actualInscriptionInputs
  const paymentOutputs = actualInscriptionInputs
  const changeOutputs = hasChangeOutput ? 1 : 0
  
  // Check if payment address is also taproot
  const isPaymentTaproot = isTaprootAddress(paymentAddress)
  const paymentOutputSize = isPaymentTaproot ? TAPROOT_OUTPUT_VBYTES : P2WPKH_OUTPUT_VBYTES
  
  const baseVsize = (
    TX_OVERHEAD_VBYTES +
    inputCount * TAPROOT_INPUT_VBYTES +
    inscriptionOutputs * TAPROOT_OUTPUT_VBYTES +
    paymentOutputs * paymentOutputSize +
    changeOutputs * paymentOutputSize
  )
  
  // Add buffer to account for witness data variations
  // 1% buffer for P2WPKH addresses
  // No buffer for taproot addresses (they're more predictable, and we want to avoid overestimation)
  if (!isPaymentTaproot) {
    return Math.ceil(baseVsize * 1.01)
  }
  
  // For all-taproot transactions, return base size without buffer
  // Taproot transactions have more predictable witness data, so we don't need a buffer
  return baseVsize
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BuildRecoveryPsbtRequest

    if (!body.inputs || !Array.isArray(body.inputs) || body.inputs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one input is required' },
        { status: 400 },
      )
    }

    if (!body.taprootAddress || !body.paymentAddress) {
      return NextResponse.json(
        { success: false, error: 'Taproot and payment addresses are required' },
        { status: 400 },
      )
    }

    const feeRate = typeof body.feeRate === 'number' ? body.feeRate : Number.parseFloat(String(body.feeRate))
    if (!Number.isFinite(feeRate) || feeRate <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid fee rate' },
        { status: 400 },
      )
    }

    // Fetch all input transactions
    const fetchPromises = body.inputs.map((input) => fetchSandshrewTx(input.txid))
    const transactions = await Promise.all(fetchPromises)

    // Create PSBT
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })

    let totalInputValue = 0

    // Add all inputs
    for (let index = 0; index < body.inputs.length; index++) {
      const input = body.inputs[index]
      const tx = transactions[index]
      const output = tx.vout?.[input.vout]

      if (!output) {
        throw new Error(`Transaction ${input.txid} does not have output index ${input.vout}`)
      }

      if (typeof output.value !== 'number') {
        throw new Error(`Transaction output missing value for ${input.txid}:${input.vout}`)
      }

      if (input.value !== output.value) {
        console.warn(
          `[sat-recovery/build-psbt] Input value mismatch for ${input.txid}:${input.vout} (plan=${input.value} vs tx=${output.value})`,
        )
      }

      if (!output.scriptpubkey) {
        throw new Error(`Transaction output missing scriptpubkey for ${input.txid}:${input.vout}`)
      }

      psbt.addInput({
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: Buffer.from(output.scriptpubkey, 'hex'),
          value: BigInt(output.value),
        },
      })

      // Add signing info for input
      // Use the address from the transaction output (which may be bc1q for Magic Eden)
      // Fall back to taprootAddress if not available
      // This is the same approach as /api/wallet/psbt route
      const address = output.scriptpubkey_address ?? body.taprootAddress
      if (address) {
        addInputSigningInfo(
          psbt,
          index,
          address,
          body.paymentPublicKey,
          body.taprootPublicKey,
          output.value,
        )
      }

      totalInputValue += output.value
    }

    // Add additional payment input if provided (to cover shortfall)
    if (body.additionalPaymentInput) {
      const additionalInput = body.additionalPaymentInput
      const additionalTx = await fetchSandshrewTx(additionalInput.txid)
      const additionalOutput = additionalTx.vout?.[additionalInput.vout]

      if (!additionalOutput) {
        throw new Error(`Transaction ${additionalInput.txid} does not have output index ${additionalInput.vout}`)
      }

      if (typeof additionalOutput.value !== 'number') {
        throw new Error(`Transaction output missing value for ${additionalInput.txid}:${additionalInput.vout}`)
      }

      if (!additionalOutput.scriptpubkey) {
        throw new Error(`Transaction output missing scriptpubkey for ${additionalInput.txid}:${additionalInput.vout}`)
      }

      const additionalIndex = body.inputs.length
      psbt.addInput({
        hash: additionalInput.txid,
        index: additionalInput.vout,
        witnessUtxo: {
          script: Buffer.from(additionalOutput.scriptpubkey, 'hex'),
          value: BigInt(additionalOutput.value),
        },
      })

      // Add signing info for additional payment input
      const additionalAddress = additionalOutput.scriptpubkey_address ?? body.paymentAddress
      if (additionalAddress) {
        addInputSigningInfo(
          psbt,
          additionalIndex,
          additionalAddress,
          body.paymentPublicKey,
          body.taprootPublicKey,
          additionalOutput.value,
        )
      }

      totalInputValue += additionalOutput.value
    }

    // Calculate outputs
    // FIFO RULE: Each inscription input maps to its two outputs in order
    // Fees are ONLY deducted from the very last inscription payment output
    // Additional payment input (if present) contributes to change output
    
    // Input 1 → Output 0 (inscription) + Output 1 (payment)
    // Input 2 → Output 2 (inscription) + Output 3 (payment - fees here)
    // Input 3 → Output 4 (inscription) + Output 5 (payment - fees here if last)
    // Additional payment input → change output (if >= 546)
    
    const inputCount = body.inputs.length + (body.additionalPaymentInput ? 1 : 0)
    const inscriptionInputCount = body.inputs.length
    // When payment input is added: inscriptionInputCount inscription inputs + 1 payment input
    // Outputs: inscriptionInputCount inscription + inscriptionInputCount payment + 1 change (if >= 546)
    // We'll estimate assuming change output exists (worst case for fee estimation)
    const hasChangeOutput = body.additionalPaymentInput ? true : false
    const estimatedVsize = estimateTransactionVsize(inputCount, body.taprootAddress, body.paymentAddress, inscriptionInputCount, hasChangeOutput)
    const estimatedFee = Math.ceil(estimatedVsize * feeRate)

    console.log('[sat-recovery/build-psbt] Calculation:', {
      inputCount,
      inscriptionInputCount,
      estimatedVsize,
      estimatedFee,
      feeRate,
      totalInputValue,
    })

    // Calculate outputs for each inscription input using FIFO
    // Each inscription input contributes: 330 (inscription) + (input_value - 330) (payment)
    // When payment input is added, fees come ONLY from the payment input, not inscription outputs
    const outputValues: number[] = []
    
    for (let i = 0; i < inscriptionInputCount; i++) {
      const inputValue = body.inputs[i].value
      
      // Inscription output: always 330
      outputValues.push(MIN_INSCRIPTION_OUTPUT)
      
      // Payment output: input_value - 330 (NO fees deducted from inscription outputs)
      const paymentOutput = inputValue - MIN_INSCRIPTION_OUTPUT
      
      // Check minimum (but if payment input is added, it will cover shortfall)
      if (!body.additionalPaymentInput && paymentOutput < MIN_PAYMENT_OUTPUT) {
        console.error('[sat-recovery/build-psbt] Payment output too small:', {
          inputIndex: i,
          inputValue,
          inscriptionOutput: MIN_INSCRIPTION_OUTPUT,
          paymentOutput,
          minRequired: MIN_PAYMENT_OUTPUT,
        })
        return NextResponse.json(
          {
            success: false,
            error: `Insufficient value in input ${i + 1}. Payment output would be ${paymentOutput} sats (minimum ${MIN_PAYMENT_OUTPUT} sats required).`,
          },
          { status: 400 },
        )
      }
      
      // If payment input is added and this is the last inscription, ensure it meets minimum
      if (body.additionalPaymentInput && i === inscriptionInputCount - 1 && paymentOutput < MIN_PAYMENT_OUTPUT) {
        // Adjust to minimum (shortfall will be covered by payment input)
        outputValues.push(MIN_PAYMENT_OUTPUT)
      } else {
        outputValues.push(paymentOutput)
      }
    }
    
    // Calculate change output if additional payment input was added
    // Payment input pays: shortfall (if any) + all fees
    // Change = payment input value - shortfall - fees
    if (body.additionalPaymentInput) {
      const totalInscriptionOutputs = inscriptionInputCount * MIN_INSCRIPTION_OUTPUT
      const totalPaymentOutputs = outputValues.filter((_, i) => i % 2 === 1).reduce((sum, val) => sum + val, 0)
      const totalOutputsValue = totalInscriptionOutputs + totalPaymentOutputs
      const changeOutput = totalInputValue - totalOutputsValue - estimatedFee
      
      if (changeOutput >= MIN_PAYMENT_OUTPUT) {
        // Add change output back to payment address
        outputValues.push(changeOutput)
      } else if (changeOutput < 0) {
        // This shouldn't happen if the analysis was correct, but handle it
        console.error('[sat-recovery/build-psbt] Change output is negative:', {
          totalInputValue,
          totalOutputsValue,
          estimatedFee,
          changeOutput,
        })
        return NextResponse.json(
          {
            success: false,
            error: `Insufficient value to cover outputs and fees. Shortfall: ${Math.abs(changeOutput)} sats`,
          },
          { status: 400 },
        )
      }
      // If changeOutput is 0 < changeOutput < 546, it's absorbed into the fee (dust)
    } else {
      // No payment input: fees must come from last inscription payment output
      const lastPaymentOutputIndex = (inscriptionInputCount - 1) * 2 + 1
      const lastPaymentOutput = outputValues[lastPaymentOutputIndex]
      const lastPaymentOutputAfterFee = lastPaymentOutput - estimatedFee
      
      if (lastPaymentOutputAfterFee < MIN_PAYMENT_OUTPUT) {
        console.error('[sat-recovery/build-psbt] Last payment output too small after fees:', {
          lastPaymentOutput,
          estimatedFee,
          lastPaymentOutputAfterFee,
          minRequired: MIN_PAYMENT_OUTPUT,
        })
        return NextResponse.json(
          {
            success: false,
            error: `Insufficient value after fees. Last payment output would be ${lastPaymentOutputAfterFee} sats (minimum ${MIN_PAYMENT_OUTPUT} sats required). Fee: ${estimatedFee} sats`,
          },
          { status: 400 },
        )
      }
      
      // Update last payment output to deduct fees
      outputValues[lastPaymentOutputIndex] = lastPaymentOutputAfterFee
    }

    // Calculate total output value
    const totalOutputValue = outputValues.reduce((sum, val) => sum + val, 0)
    const actualFee = totalInputValue - totalOutputValue

    console.log('[sat-recovery/build-psbt] Output calculation (FIFO):', {
      outputValues,
      totalInputValue,
      totalOutputValue,
      estimatedFee,
      actualFee,
      difference: Math.abs(actualFee - estimatedFee),
    })

    // Decode addresses
    let taprootOutputScript: Buffer
    let paymentOutputScript: Buffer

    try {
      const taprootScript = bitcoin.address.toOutputScript(body.taprootAddress, bitcoin.networks.bitcoin)
      taprootOutputScript = Buffer.from(taprootScript)
    } catch (err) {
      return NextResponse.json(
        { success: false, error: 'Invalid taproot address' },
        { status: 400 },
      )
    }

    try {
      const paymentScript = bitcoin.address.toOutputScript(body.paymentAddress, bitcoin.networks.bitcoin)
      paymentOutputScript = Buffer.from(paymentScript)
    } catch (err) {
      return NextResponse.json(
        { success: false, error: 'Invalid payment address' },
        { status: 400 },
      )
    }

    // Add outputs: FIFO order
    // For each inscription input: inscription output (330) then payment output (input_value - 330)
    // Fees only deducted from last inscription payment output
    // If additional payment input exists, add change output at the end
    const outputsAdded: Array<{ type: string; value: number }> = []
    
    for (let i = 0; i < inscriptionInputCount; i++) {
      const outputIndex = i * 2
      
      // Inscription output to taproot (always 330)
      const inscriptionValue = outputValues[outputIndex]
      psbt.addOutput({
        script: taprootOutputScript,
        value: BigInt(inscriptionValue),
      })
      outputsAdded.push({ type: 'inscription', value: inscriptionValue })

      // Payment output (input_value - 330, minus fees if last)
      const paymentValue = outputValues[outputIndex + 1]
      psbt.addOutput({
        script: paymentOutputScript,
        value: BigInt(paymentValue),
      })
      outputsAdded.push({ 
        type: 'payment', 
        value: paymentValue,
      })
    }
    
    // Add change output if additional payment input was added
    if (body.additionalPaymentInput && outputValues.length > inscriptionInputCount * 2) {
      const changeValue = outputValues[outputValues.length - 1]
      psbt.addOutput({
        script: paymentOutputScript,
        value: BigInt(changeValue),
      })
      outputsAdded.push({ 
        type: 'change', 
        value: changeValue,
      })
    }

    console.log('[sat-recovery/build-psbt] Outputs added (FIFO):', {
      count: outputsAdded.length,
      outputs: outputsAdded,
      totalOutputValue,
      totalInputValue,
      actualFee,
    })
    
    console.log('[sat-recovery/build-psbt] Final fee:', {
      estimatedFee,
      actualFee,
      difference: Math.abs(actualFee - estimatedFee),
    })

    // Verify outputs were added correctly
    const expectedOutputCount = inscriptionInputCount * 2 + (body.additionalPaymentInput && outputValues.length > inscriptionInputCount * 2 ? 1 : 0)
    const outputCount = expectedOutputCount
    if (outputsAdded.length !== expectedOutputCount) {
      const errorMsg = `Output count mismatch: expected ${expectedOutputCount}, got ${outputsAdded.length}`
      console.error('[sat-recovery/build-psbt]', errorMsg)
      return NextResponse.json(
        {
          success: false,
          error: errorMsg,
        },
        { status: 500 },
      )
    }

    // Serialize PSBT
    const psbtBase64 = psbt.toBase64()
    
    console.log('[sat-recovery/build-psbt] PSBT serialized successfully:', {
      base64Length: psbtBase64.length,
      inputs: inputCount,
      outputs: outputCount,
      totalInputValue,
      totalOutputValue,
      actualFee,
    })
    
    // Finalize PSBT
    return NextResponse.json({
      success: true,
      psbt: psbtBase64,
      summary: {
        inputs: {
          count: inputCount,
          value: totalInputValue,
        },
        outputs: {
          count: outputCount,
          value: totalOutputValue,
          details: outputsAdded,
        },
        fee: actualFee,
        estimatedVsize,
        estimatedFee,
        feeRate,
      },
    })
  } catch (error) {
    console.error('[sat-recovery/build-psbt] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to build recovery PSBT',
      },
      { status: 500 },
    )
  }
}

