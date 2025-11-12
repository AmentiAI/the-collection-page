import { NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'

export const dynamic = 'force-dynamic'

type HorsePsbtInput = {
  txid: string
  vout: number
  value: number
}

type HorsePsbtOutput = {
  address: string
  amount: number
}

const oylnet: bitcoin.networks.Network = {
  ...bitcoin.networks.testnet,
  bech32: 'oy',
  messagePrefix: '\x18OY Network Signed Message:\n',
  bip32: {
    public: 0x04b24746,
    private: 0x04b2430c,
  },
  pubKeyHash: 0x42,
  scriptHash: 0x32,
  wif: 0xc4,
}

const PLACEHOLDER_WITNESS_SCRIPT = Buffer.concat([
  Buffer.from([0x00, 0x14]),
  Buffer.alloc(20, 0),
])

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null)

    const inputs: HorsePsbtInput[] = Array.isArray(payload?.inputs) ? payload.inputs : []
    const outputs: HorsePsbtOutput[] = Array.isArray(payload?.outputs) ? payload.outputs : []
    const feeRate = Number(payload?.feeRate ?? 0)

    if (inputs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one input is required.' },
        { status: 400 },
      )
    }
    if (outputs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one output is required.' },
        { status: 400 },
      )
    }

    const psbt = new bitcoin.Psbt({ network: oylnet })

    for (const input of inputs) {
      if (typeof input?.txid !== 'string' || !/^[0-9a-fA-F]{64}$/.test(input.txid)) {
        return NextResponse.json(
          { success: false, error: `Invalid txid provided: ${input?.txid ?? 'undefined'}` },
          { status: 400 },
        )
      }
      if (!Number.isInteger(input?.vout) || input.vout < 0) {
        return NextResponse.json(
          { success: false, error: `Invalid vout index for input ${input.txid}` },
          { status: 400 },
        )
      }
      if (!Number.isFinite(input?.value) || input.value <= 0) {
        return NextResponse.json(
          { success: false, error: `Invalid value for input ${input.txid}:${input.vout}` },
          { status: 400 },
        )
      }

      psbt.addInput({
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: PLACEHOLDER_WITNESS_SCRIPT,
          value: BigInt(Math.trunc(input.value)),
        },
        sequence: 0xfffffffd,
      })
    }

    for (const output of outputs) {
      if (typeof output?.address !== 'string' || output.address.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'Each output must include an address.' },
          { status: 400 },
        )
      }
      if (!Number.isFinite(output?.amount) || output.amount <= 0) {
        return NextResponse.json(
          { success: false, error: `Invalid amount for output ${output.address}` },
          { status: 400 },
        )
      }

      try {
        // Validate address against the oylnet network without modifying the provided value.
        bitcoin.address.toOutputScript(output.address, oylnet)
      } catch (addressError) {
        return NextResponse.json(
          {
            success: false,
            error: `Output address ${output.address} is not valid for oylnet.`,
          },
          { status: 400 },
        )
      }

      psbt.addOutput({
        address: output.address,
        value: BigInt(Math.trunc(output.amount)),
      })
    }

    const psbtBase64 = psbt.toBase64()

    return NextResponse.json({
      success: true,
      network: 'oylnet',
      feeRate,
      psbt: psbtBase64,
      inputs: inputs.length,
      outputs: outputs.length,
    })
  } catch (error) {
    console.error('[horse/psbt] Failed to craft PSBT', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error building PSBT.',
      },
      { status: 500 },
    )
  }
}

