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

async function findUtxoByInscription(
  inscription_id: string,
  address: string,
  apiKey: string
): Promise<{ output: string; output_value: number; address: string } | null> {
  // Fetch all UTXOs for the address and find the one containing this inscription
  let page = 1
  while (page <= 30) {
    const res = await fetch(
      `${ORDISCAN_BASE}/address/${encodeURIComponent(address)}/utxos?page=${page}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) break
    const body = await res.json()
    const utxos: Array<{ txid?: string; vout?: number; outpoint?: string; value: number; inscriptions?: string[] }> =
      body.data ?? []
    if (!utxos.length) break

    for (const utxo of utxos) {
      const ids: string[] = utxo.inscriptions ?? []
      if (!ids.includes(inscription_id)) continue

      let txid = utxo.txid ?? ''
      let vout = utxo.vout ?? 0
      if (!txid && utxo.outpoint) {
        const parts = utxo.outpoint.split(':')
        txid = parts[0]
        vout = parseInt(parts[1], 10)
      }
      if (!txid) continue
      return { output: `${txid}:${vout}`, output_value: utxo.value, address }
    }

    if (utxos.length < 100) break
    page++
  }
  return null
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
    //    Try inscription endpoint first; if output is missing, scan address UTXOs
    const inscription = await getInscription(inscription_id, apiKey)

    let output = inscription.output
    let outputValue = inscription.output_value
    let inscriptionAddress = inscription.address || address

    if (!output) {
      const found = await findUtxoByInscription(inscription_id, address, apiKey)
      if (!found) {
        return NextResponse.json(
          { error: 'Could not locate inscription UTXO in wallet' },
          { status: 400 }
        )
      }
      output = found.output
      outputValue = found.output_value
      inscriptionAddress = address
    }

    const [txid, voutStr] = output.split(':')
    const vout = parseInt(voutStr, 10)
    if (!txid || isNaN(vout)) {
      return NextResponse.json({ error: 'Invalid inscription output format' }, { status: 400 })
    }

    // 2. Get scriptpubkey from mempool.space
    const txOutput = await getTxOutput(txid, vout)
    const finalValue = txOutput.value ?? outputValue
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
        value: BigInt(finalValue),
      },
      sequence: 0xfffffffd,
    })

    let outputScript: Buffer
    try {
      outputScript = Buffer.from(
        bitcoin.address.toOutputScript(inscriptionAddress, bitcoin.networks.bitcoin)
      )
    } catch {
      outputScript = Buffer.from(scriptHex, 'hex')
    }

    psbt.addOutput({ script: outputScript, value: BigInt(finalValue) })

    return NextResponse.json({
      success: true,
      psbt: psbt.toBase64(),
      summary: { inscription_id, txid, vout, output_value: finalValue, address: inscriptionAddress },
    })
  } catch (e) {
    console.error('[prepare-psbt]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build PSBT' },
      { status: 500 }
    )
  }
}
