import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'

bitcoin.initEccLib(ecc)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { psbt } = body

    if (!psbt || typeof psbt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'PSBT is required and must be a base64 string' },
        { status: 400 },
      )
    }

    // Extract transaction from PSBT
    const finalPsbt = bitcoin.Psbt.fromBase64(psbt)
    const signedTxHex = finalPsbt.extractTransaction().toHex()

    return NextResponse.json({
      success: true,
      signedTxHex,
    })
  } catch (error) {
    console.error('[wallet/extract-psbt] Failed to extract transaction from PSBT', error)
    const message = error instanceof Error ? error.message : 'Unable to extract transaction from PSBT'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
