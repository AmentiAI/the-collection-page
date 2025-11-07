import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { addInputSigningInfo } from '@/app/api/self-inscribe/utils/bitcoin'

bitcoin.initEccLib(ecc)

const MIN_OUTPUT_VALUE = 546

export async function POST(request: NextRequest) {
  try {
    const {
      parentTxid,
      targetFeeRate,
      walletAddresses,
      paymentPublicKey,
      taprootPublicKey,
      returnAddress
    }: {
      parentTxid: string
      targetFeeRate: number
      walletAddresses: string[]
      paymentPublicKey?: string | { type: string; data: number[] } | Uint8Array
      taprootPublicKey?: string | { type: string; data: number[] } | Uint8Array
      returnAddress: string
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

    if (!parentTxid || parentTxid.length !== 64) {
      return NextResponse.json({ success: false, error: 'Invalid txid.' }, { status: 400 })
    }

    if (!targetFeeRate || Number.isNaN(targetFeeRate) || targetFeeRate <= 0) {
      return NextResponse.json({ success: false, error: 'Target fee rate must be greater than 0.' }, { status: 400 })
    }

    if (!returnAddress) {
      return NextResponse.json({ success: false, error: 'Return address is required.' }, { status: 400 })
    }

    const addressSet = new Set(
      Array.isArray(walletAddresses)
        ? walletAddresses.filter((addr) => typeof addr === 'string' && addr.length > 0)
        : []
    )

    if (addressSet.size === 0) {
      return NextResponse.json({ success: false, error: 'No wallet addresses provided.' }, { status: 400 })
    }

    const txDetailsResponse = await fetch(`https://mempool.space/api/tx/${parentTxid}`)
    if (!txDetailsResponse.ok) {
      throw new Error(`Failed to fetch transaction details: ${txDetailsResponse.status}`)
    }
    const txDetails = await txDetailsResponse.json()

    if (txDetails.status?.confirmed) {
      return NextResponse.json({ success: false, error: 'Transaction already confirmed.' }, { status: 400 })
    }

    const isOptInRbf = txDetails.vin?.every((vin: any) => vin.sequence < 0xfffffffe)
    if (!isOptInRbf) {
      return NextResponse.json({ success: false, error: 'Transaction does not signal opt-in RBF.' }, { status: 400 })
    }

    const walletInputs = txDetails.vin.filter((vin: any) => {
      const addr = vin.prevout?.scriptpubkey_address
      return addr && addressSet.has(addr)
    })

    if (walletInputs.length !== txDetails.vin.length) {
      return NextResponse.json({ success: false, error: 'Not all inputs belong to the connected wallet.' }, { status: 400 })
    }

    const parentHexResponse = await fetch(`https://mempool.space/api/tx/${parentTxid}/hex`)
    if (!parentHexResponse.ok) {
      throw new Error('Failed to fetch parent transaction hex')
    }
    const parentTxHex = await parentHexResponse.text()
    const parentTransaction = bitcoin.Transaction.fromHex(parentTxHex)

    const currentFee: number = txDetails.fee

    let vsize: number = txDetails.vsize
    if (!Number.isFinite(vsize) || vsize <= 0) {
      const fallbackWeight = Number.isFinite(txDetails.weight) ? txDetails.weight : null
      if (fallbackWeight && fallbackWeight > 0) {
        vsize = Math.ceil(fallbackWeight / 4)
      }
    }

    if (!Number.isFinite(vsize) || vsize <= 0) {
      return NextResponse.json({ success: false, error: 'Unable to determine transaction size for replacement.' }, { status: 400 })
    }
    const requiredTotalFee = Math.ceil(vsize * targetFeeRate)
    const feeDelta = requiredTotalFee - currentFee

    if (feeDelta <= 0) {
      return NextResponse.json({ success: false, error: 'Target fee rate does not exceed current fee.' }, { status: 400 })
    }

    const originalInputTotal = txDetails.vin.reduce((sum: number, vin: any) => sum + (vin.prevout?.value ?? 0), 0)
    const newFee = currentFee + feeDelta
    if (!Number.isFinite(newFee) || newFee <= 0) {
      return NextResponse.json({ success: false, error: 'Computed fee is invalid.' }, { status: 400 })
    }

    const returnValue = originalInputTotal - newFee

    if (!Number.isFinite(returnValue)) {
      return NextResponse.json({ success: false, error: 'Computed output value is invalid.' }, { status: 400 })
    }

    if (returnValue < MIN_OUTPUT_VALUE) {
      return NextResponse.json({ success: false, error: 'Insufficient funds to pay the higher fee.' }, { status: 400 })
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

      const prevValue = Number(prevOutput.value)
      if (!Number.isFinite(prevValue) || prevValue <= 0) {
        throw new Error(`Previous output value is invalid for ${prevTxid}:${prevVout}`)
      }

      psbt.addInput({
        hash: prevTxid,
        index: prevVout,
        sequence: 0xfffffffd,
        witnessUtxo: {
          script: prevOutput.script,
          value: BigInt(prevValue)
        }
      })

      const address = input.prevout?.scriptpubkey_address ?? ''
      addInputSigningInfo(psbt, i, address, normalizedPaymentKey, normalizedTaprootKey, prevValue)
    }

    const returnScript = bitcoin.address.toOutputScript(returnAddress, bitcoin.networks.bitcoin)
    psbt.addOutput({
      script: Buffer.from(returnScript),
      value: BigInt(Math.trunc(returnValue))
    })

    return NextResponse.json({
      success: true,
      psbt: psbt.toBase64(),
      details: {
        originalFee: currentFee,
        newFee,
        feeIncrease: feeDelta,
        resultingFeeRate: newFee / vsize
      }
    })
  } catch (error) {
    console.error('❌ Error creating cancel PSBT:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create cancel transaction'
    }, { status: 500 })
  }
}

