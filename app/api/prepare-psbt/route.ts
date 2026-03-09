import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { addInputSigningInfo } from '@/app/api/self-inscribe/utils/bitcoin'

bitcoin.initEccLib(ecc)

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

async function getPrevOutput(txid: string, vout: number): Promise<{ script: Buffer; value: number }> {
  const res = await fetch(`${MEMPOOL_BASE}/tx/${txid}/hex`)
  if (!res.ok) throw new Error(`Mempool tx hex lookup failed: ${res.status}`)
  const hex = await res.text()
  const tx = bitcoin.Transaction.fromHex(hex)
  const out = tx.outs[vout]
  if (!out) throw new Error(`Output ${vout} not found in tx ${txid}`)
  return { script: Buffer.from(out.script), value: Number(out.value) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { inscription_id, address, public_key, player_id, queue_id } = body as {
      inscription_id: string
      address: string
      public_key?: string
      player_id?: string
      queue_id?: string
    }

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

    // 2. Get full tx hex from mempool.space and decode the output
    const prevOut = await getPrevOutput(txid, vout)
    const finalValue = prevOut.value || outputValue

    // 3. Build proof-of-ownership PSBT
    //    Input: inscription UTXO → Output: same value back to same address (fee=0, not for broadcast)
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin })

    psbt.addInput({
      hash: txid,
      index: vout,
      sequence: 0xfffffffd,
      witnessUtxo: {
        script: prevOut.script,
        value: BigInt(finalValue),
      },
    })

    // Add taproot signing info (tapInternalKey) using the same helper the speedup/cancel tools use
    addInputSigningInfo(psbt, 0, inscriptionAddress, undefined, public_key)

    // SIGHASH_NONE | SIGHASH_ANYONECANPAY (0x82):
    // The player's signature commits only to their specific input (txid:vout, amount, script).
    // It does NOT commit to outputs or other inputs, so the sig remains valid when this
    // input is later combined into the multi-input battle transaction by the server.
    psbt.updateInput(0, {
      sighashType: bitcoin.Transaction.SIGHASH_NONE | bitcoin.Transaction.SIGHASH_ANYONECANPAY,
    })

    // No output — this is just a signed input commitment.
    // The cron will combine both players' signed inputs to build the final battle tx.

    const scriptHex = Buffer.from(prevOut.script).toString('hex')

    // Persist UTXO + unsigned PSBT to DB so the cron can build the final tx
    // (signed_psbt will be updated when the player signs via /api/battle-commitment)
    if (player_id) {
      try {
        const { getPool } = await import('@/lib/db')
        const pool = getPool()
        await pool.query(`
          CREATE TABLE IF NOT EXISTS battle_commitments (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            queue_id UUID, player_id TEXT NOT NULL, inscription_id TEXT NOT NULL,
            txid TEXT NOT NULL, vout INTEGER NOT NULL, output_value BIGINT NOT NULL,
            script_pubkey TEXT NOT NULL, signed_psbt TEXT NOT NULL,
            address TEXT NOT NULL, public_key TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (player_id, inscription_id)
          )`)
        await pool.query(
          `INSERT INTO battle_commitments (queue_id, player_id, inscription_id, txid, vout, output_value, script_pubkey, signed_psbt, address, public_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (player_id, inscription_id) DO UPDATE SET
             queue_id=EXCLUDED.queue_id, txid=EXCLUDED.txid, vout=EXCLUDED.vout,
             output_value=EXCLUDED.output_value, script_pubkey=EXCLUDED.script_pubkey,
             signed_psbt=EXCLUDED.signed_psbt, public_key=EXCLUDED.public_key, created_at=NOW()`,
          [queue_id ?? null, player_id, inscription_id, txid, vout, finalValue, scriptHex, psbt.toBase64(), inscriptionAddress, public_key ?? null]
        )
      } catch (dbErr) {
        console.warn('[prepare-psbt] Could not save commitment to DB:', dbErr)
      }
    }

    return NextResponse.json({
      success: true,
      psbt: psbt.toBase64(),
      summary: { inscription_id, txid, vout, output_value: finalValue, address: inscriptionAddress, script_pubkey: scriptHex },
    })
  } catch (e) {
    console.error('[prepare-psbt]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build PSBT' },
      { status: 500 }
    )
  }
}
