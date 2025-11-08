import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'

import { addInputSigningInfo } from '@/app/api/self-inscribe/utils/bitcoin'
import { fetchSandshrewTx } from '@/lib/sandshrew'

bitcoin.initEccLib(ecc)

interface BuildPsbtInput {
  txid: string
  vout: number
  value: number
}

interface BuildPsbtOutput {
  address: string
  amount: number
}

interface BuildPsbtRequestBody {
  inputs: BuildPsbtInput[]
  outputs: BuildPsbtOutput[]
  changeOutput?: BuildPsbtOutput | null
  paymentAddress?: string | null
  paymentPublicKey?: string | null
  taprootPublicKey?: string | null
  fee?: number | null
  vsize?: number | null
}

function toHexBuffer(hex: string, field: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid hex string for ${field}`)
  }
  return Buffer.from(hex, 'hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BuildPsbtRequestBody

    if (!body || !Array.isArray(body.inputs) || body.inputs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one input is required to build a PSBT' },
        { status: 400 },
      )
    }

    if (!Array.isArray(body.outputs) || body.outputs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one destination output is required' },
        { status: 400 },
      )
    }

    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })

    const fetchPromises = body.inputs.map((input) => fetchSandshrewTx(input.txid))
    const transactions = await Promise.all(fetchPromises)

    let totalInputValue = 0

    for (let index = 0; index < body.inputs.length; index++) {
      const input = body.inputs[index]
      const tx = transactions[index]
      const output = tx.vout?.[input.vout]

      if (!output) {
        throw new Error(`Transaction ${input.txid} does not have output index ${input.vout}`)
      }

      if (typeof output.value !== 'number') {
        throw new Error(`Sandshrew transaction output missing value for ${input.txid}:${input.vout}`)
      }

      if (input.value != null && input.value !== output.value) {
        console.warn(
          `[wallet/psbt] Input value mismatch for ${input.txid}:${input.vout} (plan=${input.value} vs tx=${output.value})`,
        )
      }

      if (!output.scriptpubkey) {
        throw new Error(`Sandshrew transaction output missing scriptpubkey for ${input.txid}:${input.vout}`)
      }

      psbt.addInput({
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: toHexBuffer(output.scriptpubkey, 'scriptpubkey'),
          value: BigInt(output.value),
        },
      })

      const address = output.scriptpubkey_address ?? body.paymentAddress ?? ''
      if (address) {
        addInputSigningInfo(
          psbt,
          index,
          address,
          body.paymentPublicKey ?? undefined,
          body.taprootPublicKey ?? undefined,
          output.value,
        )
      }

      totalInputValue += output.value
    }

    let totalOutputValue = 0

    for (const output of body.outputs) {
      if (!output.address || typeof output.amount !== 'number' || output.amount <= 0) {
        throw new Error('Each output must include a valid address and positive amount')
      }
      psbt.addOutput({
        address: output.address,
        value: BigInt(output.amount),
      })
      totalOutputValue += output.amount
    }

    if (body.changeOutput && body.changeOutput.amount > 0) {
      if (!body.changeOutput.address) {
        throw new Error('Change output is missing an address')
      }
      psbt.addOutput({
        address: body.changeOutput.address,
        value: BigInt(body.changeOutput.amount),
      })
      totalOutputValue += body.changeOutput.amount
    }

    const impliedFee = totalInputValue - totalOutputValue

    return NextResponse.json({
      success: true,
      psbt: psbt.toBase64(),
      summary: {
        inputs: {
          count: body.inputs.length,
          value: totalInputValue,
        },
        outputs: {
          count: body.outputs.length + (body.changeOutput && body.changeOutput.amount > 0 ? 1 : 0),
          value: totalOutputValue,
        },
        fee: impliedFee,
        planFee: body.fee ?? null,
        planVsize: body.vsize ?? null,
      },
    })
  } catch (error) {
    console.error('[wallet/psbt] Failed to build PSBT', error)
    const message = error instanceof Error ? error.message : 'Unable to build PSBT'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

