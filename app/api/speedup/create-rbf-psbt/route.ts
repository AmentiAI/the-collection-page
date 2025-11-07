import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { addInputSigningInfo } from '@/app/api/self-inscribe/utils/bitcoin'

bitcoin.initEccLib(ecc)

const MIN_CHANGE_OUTPUT = 546

export async function POST(request: NextRequest) {
  try {
    const {
      parentTxid,
      targetFeeRate,
      walletAddresses,
      paymentPublicKey,
      taprootPublicKey
    }: {
      parentTxid: string
      targetFeeRate: number
      walletAddresses: string[]
      paymentPublicKey?: string
      taprootPublicKey?: string
    } = await request.json()

    if (!parentTxid || typeof parentTxid !== 'string' || parentTxid.length !== 64) {
      return NextResponse.json({ success: false, error: 'Invalid parent txid provided.' }, { status: 400 })
    }

    if (!targetFeeRate || Number.isNaN(targetFeeRate) || targetFeeRate <= 0) {
      return NextResponse.json({ success: false, error: 'Target fee rate must be greater than 0.' }, { status: 400 })
    }

    const addressSet = new Set(
      Array.isArray(walletAddresses)
        ? walletAddresses.filter((addr) => typeof addr === 'string' && addr.length > 0)
        : []
    )

    if (addressSet.size === 0) {
      return NextResponse.json({ success: false, error: 'No wallet addresses provided for RBF analysis.' }, { status: 400 })
    }

    const txDetailsResponse = await fetch(`https://mempool.space/api/tx/${parentTxid}`)
    if (!txDetailsResponse.ok) {
      throw new Error(`Failed to fetch transaction details (${txDetailsResponse.status})`)
    }
    const txDetails = await txDetailsResponse.json()

    if (txDetails.status?.confirmed) {
      return NextResponse.json({ success: false, error: 'Transaction already confirmed; RBF not required.' }, { status: 400 })
    }

    const isOptInRbf = txDetails.vin?.some((vin: any) => vin.sequence < 0xfffffffe)
    if (!isOptInRbf) {
      return NextResponse.json({ success: false, error: 'Transaction does not signal opt-in RBF.' }, { status: 400 })
    }

    const walletInputs = txDetails.vin.filter((vin: any) => {
      const addr = vin.prevout?.scriptpubkey_address
      return addr && addressSet.has(addr)
    })

    if (walletInputs.length !== txDetails.vin.length) {
      return NextResponse.json({ success: false, error: 'Not all transaction inputs belong to the connected wallet. RBF is not possible.' }, { status: 400 })
    }

    const parentHexResponse = await fetch(`https://mempool.space/api/tx/${parentTxid}/hex`)
    if (!parentHexResponse.ok) {
      throw new Error('Failed to fetch parent transaction hex')
    }
    const parentTxHex = await parentHexResponse.text()
    const parentTransaction = bitcoin.Transaction.fromHex(parentTxHex)

    const currentFee: number = txDetails.fee
    const vsize: number = txDetails.vsize
    const requiredTotalFee = Math.ceil(vsize * targetFeeRate)
    const feeDelta = requiredTotalFee - currentFee

    if (feeDelta <= 0) {
      return NextResponse.json({ success: false, error: 'Target fee rate does not exceed current transaction fee.' }, { status: 400 })
    }

    const outputs = txDetails.vout.map((output: any, index: number) => ({
      index,
      address: output.scriptpubkey_address ?? null,
      value: output.value,
      spent: output.spent,
      belongsToWallet: output.scriptpubkey_address ? addressSet.has(output.scriptpubkey_address) : false
    }))

    const adjustableOutputs = outputs
      .filter((output: any) => output.belongsToWallet && output.value > MIN_CHANGE_OUTPUT)
      .sort((a: any, b: any) => b.value - a.value)

    if (adjustableOutputs.length === 0) {
      return NextResponse.json({ success: false, error: 'No change outputs large enough to fund an RBF increase.' }, { status: 400 })
    }

    const updatedOutputValues = parentTransaction.outs.map((out) => Number(out.value))

    let remainingFee = feeDelta
    for (const output of adjustableOutputs) {
      if (remainingFee <= 0) break
      const currentValue = updatedOutputValues[output.index]
      const maxReducible = currentValue - MIN_CHANGE_OUTPUT
      if (maxReducible <= 0) continue

      const reduceBy = Math.min(maxReducible, remainingFee)
      updatedOutputValues[output.index] = currentValue - reduceBy
      remainingFee -= reduceBy
    }

    if (remainingFee > 0) {
      return NextResponse.json({
        success: false,
        error: `Insufficient wallet-owned change to raise fee by ${feeDelta} sats. Shortfall: ${remainingFee} sats. Consider CPFP.`
      }, { status: 400 })
    }

    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })

    for (let i = 0; i < txDetails.vin.length; i++) {
      const input = txDetails.vin[i]
      const prevTxid: string = input.txid
      const prevVout: number = input.vout

      const prevTxHexResponse = await fetch(`https://mempool.space/api/tx/${prevTxid}/hex`)
      if (!prevTxHexResponse.ok) {
        throw new Error(`Failed to fetch previous transaction ${prevTxid}`)
      }
      const prevTxHex = await prevTxHexResponse.text()
      const prevTransaction = bitcoin.Transaction.fromHex(prevTxHex)
      const prevOutput = prevTransaction.outs[prevVout]

      psbt.addInput({
        hash: prevTxid,
        index: prevVout,
        sequence: 0xfffffffd,
        witnessUtxo: {
          script: prevOutput.script,
          value: BigInt(prevOutput.value)
        }
      })

      const address = input.prevout?.scriptpubkey_address ?? ''
      addInputSigningInfo(psbt, i, address, paymentPublicKey, taprootPublicKey)
    }

    parentTransaction.outs.forEach((out, index) => {
      const newValue = updatedOutputValues[index]
      if (newValue <= 0) {
        throw new Error(`Computed negative output value for index ${index}`)
      }
      psbt.addOutput({
        script: Buffer.from(out.script),
        value: BigInt(newValue)
      })
    })

    const originalInputTotal = txDetails.vin.reduce((sum: number, vin: any) => sum + (vin.prevout?.value ?? 0), 0)
    const adjustedOutputTotal = updatedOutputValues.reduce((total, value) => total + value, 0)
    const newTotalFee = originalInputTotal - adjustedOutputTotal
    const resultingFeeRate = newTotalFee / vsize

    return NextResponse.json({
      success: true,
      psbt: psbt.toBase64(),
      details: {
        originalFee: currentFee,
        newFee: newTotalFee,
        feeIncrease: feeDelta,
        resultingFeeRate,
        vsize
      }
    })
  } catch (error) {
    console.error('❌ Error creating RBF PSBT:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create RBF PSBT'
    }, { status: 500 })
  }
}

