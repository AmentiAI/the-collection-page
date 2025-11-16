import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { fetchSandshrewBalances, fetchSandshrewTx } from '@/lib/sandshrew'

export const dynamic = 'force-dynamic'

type ScanItem = {
  inscriptionId: string
  outpoint: string | null
  txid: string | null
  senderAddress: string | null
  hasBurnRecord: boolean
  burnRecord?: {
    id: string
    txId: string | null
    ordinalWallet: string | null
    status: string
  } | null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const burnWallet = (searchParams.get('burnWallet') ?? '').toString().trim()
    if (!burnWallet) {
      return NextResponse.json({ success: false, error: 'burnWallet is required' }, { status: 400 })
    }

    const pool = getPool()
    const balances = await fetchSandshrewBalances(burnWallet)
    const assets = balances.assets ?? []

    const inscriptionUtxos = assets.filter((a) => Array.isArray(a.inscriptions) && (a.inscriptions as string[]).length > 0)

    const results: ScanItem[] = []
    for (const utxo of inscriptionUtxos) {
      const inscriptions = Array.isArray(utxo.inscriptions) ? utxo.inscriptions : []
      for (const inscriptionId of inscriptions) {
        const outpoint = typeof utxo.outpoint === 'string' ? utxo.outpoint : null
        const txid = outpoint && outpoint.includes(':') ? outpoint.split(':')[0] : null

        let senderAddress: string | null = null
        if (txid) {
          try {
            const tx = await fetchSandshrewTx(txid)
            // Sandshrew Esplora-compatible: try to read first input's prevout address
            const vin: any[] = Array.isArray((tx as any).vin) ? ((tx as any).vin as any[]) : []
            const first = vin[0]
            const prevout = first?.prevout
            senderAddress = typeof prevout?.scriptpubkey_address === 'string' ? prevout.scriptpubkey_address : null
          } catch {
            senderAddress = null
          }
        }

        const burnRes = await pool.query(
          `
            SELECT id, tx_id, ordinal_wallet, status
            FROM abyss_burns
            WHERE LOWER(inscription_id) = LOWER($1)
               OR ($2::text IS NOT NULL AND LOWER(tx_id) = LOWER($2::text))
            LIMIT 1
          `,
          [inscriptionId, txid],
        )
        const row = burnRes.rows[0]
        const hasBurnRecord = Boolean(row)

        results.push({
          inscriptionId,
          outpoint,
          txid,
          senderAddress,
          hasBurnRecord,
          burnRecord: row
            ? {
                id: row.id,
                txId: row.tx_id ?? null,
                ordinalWallet: row.ordinal_wallet ?? null,
                status: row.status ?? 'pending',
              }
            : null,
        })
      }
    }

    return NextResponse.json({ success: true, items: results, count: results.length })
  } catch (error) {
    console.error('[admin/burn-audit/scan][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to scan burn wallet' }, { status: 500 })
  }
}


