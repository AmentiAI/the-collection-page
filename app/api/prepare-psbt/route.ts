import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'

export const dynamic = 'force-dynamic'

const ORDISCAN_BASE = 'https://api.ordiscan.com/v1'
const MEMPOOL_BASE = 'https://mempool.space/api'

async function getInscription(id: string, apiKey: string) {
  const res = await fetch(`${ORDISCAN_BASE}/inscription/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Ordiscan inscription lookup failed: ${res.status}`)
  const body = await res.json()
  return body.data as {
    inscription_id: string
    address: string
    output: string        // "txid:vout"
    output_value: number
  }
}

async function getTxOutput(txid: string, vout: number) {
  const res = await fetch(`${MEMPOOL_BASE}/tx/${txid}`)
  if (!res.ok) throw new Error(`Mempool tx lookup failed: ${res.status}`)
  const tx = await res.json()
  const output = tx.vout?.[vout]
  if (!output) throw new Error(`Output ${vout} not found in tx ${txid}`)
  return output as { scriptpubkey: string; value: number }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { inscription_id, address } = body as { inscription_id: string; address: string }

    if (!inscription_id || !address) {
      return NextResponse.json({ error: 'inscription_id and address required' }, { status: 400 })
    }

    const apiKey = process.env.ORDISCAN_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ORDISCAN_API_KEY not configured' }, { status: 500 })
    }

    // 1. Get inscription → UTXO location
    const inscription = await getInscription(inscription_id, apiKey)
    if (!inscription.output) {
      return NextResponse.json({ error: 'Inscription has no UTXO output' }, { status: 400 })
    }

    const [txid, voutStr] = inscription.output.split(':')
    const vout = parseInt(voutStr, 10)
    if (!txid || isNaN(vout)) {
      return NextResponse.json({ error: 'Invalid inscription output format' }, { status: 400 })
    }

    // 2. Get scriptpubkey from mempool.space
    const txOutput = await getTxOutput(txid, vout)
    const outputValue = txOutput.value ?? inscription.output_value
    const scriptHex = txOutput.scriptpubkey
    if (!scriptHex) {
      return NextResponse.json({ error: 'Could not retrieve scriptpubkey' }, { status: 400 })
    }

    // 3. Build proof-of-ownership PSBT
    //    Input: inscription UTXO
    //    Output: same value back to inscription's current address (fee = 0, not for broadcast)
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })

    psbt.addInput({
      hash: txid,
      index: vout,
      witnessUtxo: {
        script: Buffer.from(scriptHex, 'hex'),
        value: BigInt(outputValue),
      },
      sequence: 0xfffffffd,
    })

    let outputScript: Buffer
    try {
      outputScript = Buffer.from(
        bitcoin.address.toOutputScript(inscription.address, bitcoin.networks.bitcoin)
      )
    } catch {
      outputScript = Buffer.from(scriptHex, 'hex')
    }

    psbt.addOutput({ script: outputScript, value: BigInt(outputValue) })

    return NextResponse.json({
      success: true,
      psbt: psbt.toBase64(),
      summary: { inscription_id, txid, vout, output_value: outputValue, address: inscription.address },
    })
  } catch (e) {
    console.error('[prepare-psbt]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build PSBT' },
      { status: 500 }
    )
  }
}
