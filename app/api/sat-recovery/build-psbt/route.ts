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
}

function isTaprootAddress(address: string): boolean {
  // Taproot addresses start with bc1p and are 62 characters long
  return address.startsWith('bc1p') && address.length === 62
}

function estimateTransactionVsize(inputCount: number, taprootAddress: string, paymentAddress: string): number {
  // For sat recovery transactions:
  // - inputCount taproot inputs (58 vbytes each)
  // - inputCount taproot outputs for inscriptions (43 vbytes each)
  // - inputCount payment outputs (taproot if bc1p, 43 vbytes; P2WPKH if bc1q, 31 vbytes)
  // - Transaction overhead (10 vbytes)
  const inscriptionOutputs = inputCount
  const paymentOutputs = inputCount
  
  // Check if payment address is also taproot
  const isPaymentTaproot = isTaprootAddress(paymentAddress)
  const paymentOutputSize = isPaymentTaproot ? TAPROOT_OUTPUT_VBYTES : P2WPKH_OUTPUT_VBYTES
  
  return (
    TX_OVERHEAD_VBYTES +
    inputCount * TAPROOT_INPUT_VBYTES +
    inscriptionOutputs * TAPROOT_OUTPUT_VBYTES +
    paymentOutputs * paymentOutputSize
  )
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

    // Calculate outputs
    // FIFO RULE: Each input maps to its two outputs in order
    // Fees are ONLY deducted from the very last output
    
    // Input 1 → Output 0 (inscription) + Output 1 (payment)
    // Input 2 → Output 2 (inscription) + Output 3 (payment - fees here)
    // Input 3 → Output 4 (inscription) + Output 5 (payment - fees here if last)
    
    const inputCount = body.inputs.length
    const outputCount = inputCount * 2 // Two outputs per inscription (inscription + payment)
    const estimatedVsize = estimateTransactionVsize(inputCount, body.taprootAddress, body.paymentAddress)
    const estimatedFee = Math.ceil(estimatedVsize * feeRate)

    console.log('[sat-recovery/build-psbt] Calculation:', {
      inputCount,
      outputCount,
      estimatedVsize,
      estimatedFee,
      feeRate,
      totalInputValue,
    })

    // Calculate outputs for each input using FIFO
    // Each input contributes: 330 (inscription) + (input_value - 330) (payment)
    // Fees are ONLY taken from the last payment output
    const outputValues: number[] = []
    
    for (let i = 0; i < inputCount; i++) {
      const inputValue = body.inputs[i].value
      
      // Inscription output: always 330
      outputValues.push(MIN_INSCRIPTION_OUTPUT)
      
      // Payment output: input_value - 330
      // For the last input, also subtract fees
      const paymentOutput = inputValue - MIN_INSCRIPTION_OUTPUT
      if (i === inputCount - 1) {
        // Last output: subtract fees
        const lastPaymentOutput = paymentOutput - estimatedFee
        if (lastPaymentOutput < MIN_PAYMENT_OUTPUT) {
          console.error('[sat-recovery/build-psbt] Last payment output too small after fees:', {
            inputIndex: i,
            inputValue,
            inscriptionOutput: MIN_INSCRIPTION_OUTPUT,
            paymentOutput,
            estimatedFee,
            lastPaymentOutput,
            minRequired: MIN_PAYMENT_OUTPUT,
          })
          return NextResponse.json(
            {
              success: false,
              error: `Insufficient value after fees. Last payment output would be ${lastPaymentOutput} sats (minimum ${MIN_PAYMENT_OUTPUT} sats required). Fee: ${estimatedFee} sats`,
            },
            { status: 400 },
          )
        }
        outputValues.push(lastPaymentOutput)
      } else {
        // Not last output: no fees deducted
        if (paymentOutput < MIN_PAYMENT_OUTPUT) {
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
        outputValues.push(paymentOutput)
      }
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
    // For each input: inscription output (330) then payment output (input_value - 330)
    // Fees only deducted from last payment output
    const outputsAdded: Array<{ type: string; value: number }> = []
    
    for (let i = 0; i < inputCount; i++) {
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
    if (outputsAdded.length !== outputCount) {
      const errorMsg = `Output count mismatch: expected ${outputCount}, got ${outputsAdded.length}`
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

