import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { fetchSandshrewTx } from '@/lib/sandshrew'

export const dynamic = 'force-dynamic'

async function ensureAbyssBurnsTable(pool: any) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_burns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inscription_id TEXT UNIQUE NOT NULL,
      tx_id TEXT,
      ordinal_wallet TEXT,
      payment_wallet TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'abyss',
      summon_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_status ON abyss_burns(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_tx_id ON abyss_burns(tx_id)`)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const inscriptionId = (body?.inscriptionId ?? '').toString().trim()
    const txid = (body?.txid ?? '').toString().trim()
    let ordinalWallet = (body?.ordinalWallet ?? '').toString().trim()
    let paymentWallet = (body?.paymentWallet ?? '').toString().trim()

    if (!inscriptionId) {
      return NextResponse.json({ success: false, error: 'inscriptionId is required' }, { status: 400 })
    }
    if (!txid || txid.length !== 64) {
      return NextResponse.json({ success: false, error: 'txid (64 hex) is required' }, { status: 400 })
    }

    const pool = getPool()
  
    if (!ordinalWallet || !paymentWallet) {
      try {
        const tx = await fetchSandshrewTx(txid)
        const vin: any[] = Array.isArray((tx as any).vin) ? ((tx as any).vin as any[]) : []
        const first = vin[0]
        const prevout = first?.prevout
        const addr = typeof prevout?.scriptpubkey_address === 'string' ? prevout.scriptpubkey_address : null
        if (addr) {
          if (!ordinalWallet) ordinalWallet = addr
          if (!paymentWallet) paymentWallet = addr
        }
      } catch {
        // ignore inference failure
      }
    }
    if (!ordinalWallet) {
      return NextResponse.json({ success: false, error: 'ordinalWallet is required or could not be inferred from tx' }, { status: 400 })
    }
    if (!paymentWallet) {
      // Fallback: use ordinalWallet as payment wallet if not available
      paymentWallet = ordinalWallet
    }

    const source = 'admin_fix'

    const result = await pool.query(
      `
        INSERT INTO abyss_burns (inscription_id, tx_id, ordinal_wallet, payment_wallet, status, source, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'confirmed', $5, NOW(), NOW())
        ON CONFLICT (inscription_id) DO UPDATE
        SET tx_id = COALESCE(abyss_burns.tx_id, EXCLUDED.tx_id),
            ordinal_wallet = COALESCE(abyss_burns.ordinal_wallet, EXCLUDED.ordinal_wallet),
            payment_wallet = COALESCE(abyss_burns.payment_wallet, EXCLUDED.payment_wallet),
            source = CASE WHEN abyss_burns.source = 'abyss' THEN abyss_burns.source ELSE EXCLUDED.source END,
            updated_at = NOW()
        RETURNING id, inscription_id, tx_id, ordinal_wallet, payment_wallet, status
      `,
      [inscriptionId, txid, ordinalWallet, paymentWallet, source],
    )

    return NextResponse.json({ success: true, record: result.rows[0] ?? null })
  } catch (error) {
    console.error('[admin/burn-audit/fix][POST]', error)
    return NextResponse.json({ success: false, error: 'Failed to create or update abyss burn record' }, { status: 500 })
  }
}


