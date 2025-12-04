'use client'

import { useState, useCallback } from 'react'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'

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

export default function BurnAuditPage() {
  const [connected, setConnected] = useState(false)
  const [burnWallet, setBurnWallet] = useState('')
  const [items, setItems] = useState<ScanItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fixingId, setFixingId] = useState<string | null>(null)

  const handleScan = useCallback(async () => {
    setLoading(true)
    setError(null)
    setItems(null)
    try {
      const params = new URLSearchParams({ burnWallet: burnWallet.trim() })
      const res = await fetch(`/api/admin/burn-audit/scan?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? `Scan failed (${res.status})`)
      }
      const data = await res.json()
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to scan burn wallet.')
    } finally {
      setLoading(false)
    }
  }, [burnWallet])

  const handleFix = useCallback(
    async (item: ScanItem) => {
      setFixingId(item.inscriptionId)
      try {
        const res = await fetch('/api/admin/burn-audit/fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inscriptionId: item.inscriptionId,
            txid: item.txid,
            ordinalWallet: item.senderAddress,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error ?? `Fix failed (${res.status})`)
        }
        const data = await res.json().catch(() => null)
        const record = data?.record
        // Update only the fixed row locally without rescanning the whole wallet
        setItems((prev) => {
          if (!prev) return prev
          return prev.map((row) =>
            row.inscriptionId === item.inscriptionId
              ? {
                  ...row,
                  hasBurnRecord: true,
                  burnRecord: {
                    id: record?.id ?? row.burnRecord?.id ?? '',
                    txId: record?.tx_id ?? record?.txId ?? row.burnRecord?.txId ?? item.txid ?? null,
                    ordinalWallet:
                      record?.ordinal_wallet ?? record?.ordinalWallet ?? row.burnRecord?.ordinalWallet ?? item.senderAddress ?? null,
                    status: record?.status ?? row.burnRecord?.status ?? 'pending',
                  },
                }
              : row,
          )
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fix record.')
      } finally {
        setFixingId(null)
      }
    },
    [],
  )

  return (
    <div className="min-h-screen bg-black">
      <Header onConnectedChange={setConnected} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-black uppercase tracking-[0.35em] text-red-100">Burn Audit</h1>
        <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-red-300/80">
          Scan the burn wallet for inscriptions and cross-check if an abyss_burns record exists.
        </p>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-red-600/40 bg-black/60 p-4">
          <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
            Burn Wallet Address
          </label>
          <input
            className="rounded border border-red-700/50 bg-black/70 px-3 py-2 text-sm text-red-100 outline-none ring-0 placeholder:text-red-300/50"
            placeholder="Paste burn wallet (bc1...)"
            value={burnWallet}
            onChange={(e) => setBurnWallet(e.target.value)}
          />
          <div>
            <Button
              onClick={handleScan}
              disabled={loading || burnWallet.trim().length < 10}
              className="border border-red-500 bg-red-700/80 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100 hover:bg-red-600 disabled:opacity-60"
            >
              {loading ? 'Scanning…' : 'Scan'}
            </Button>
          </div>
          {error && (
            <div className="rounded border border-red-600/50 bg-red-950/40 p-3 text-[11px] text-red-200">{error}</div>
          )}
        </div>

        {items && (
          <div className="mt-8 overflow-x-auto rounded-xl border border-red-600/40">
            <table className="min-w-full divide-y divide-red-800/50">
              <thead className="bg-red-900/20">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Inscription</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Sender</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Txid</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Record</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Ordinal Wallet</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Status</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-900/40">
                {items.map((it) => {
                  const short = (v: string | null) =>
                    v && v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-6)}` : v ?? ''
                  return (
                    <tr key={`${it.inscriptionId}-${it.outpoint ?? ''}`} className="bg-black/40">
                      <td className="px-3 py-2 text-[11px] text-red-100">{short(it.inscriptionId)}</td>
                      <td className="px-3 py-2 text-[11px] text-red-100">{short(it.senderAddress)}</td>
                      <td className="px-3 py-2 text-[11px] text-red-100">{short(it.txid)}</td>
                      <td className="px-3 py-2 text-[11px]">
                        {it.hasBurnRecord ? (
                          <span className="rounded border border-emerald-500/40 bg-emerald-900/20 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-200">
                            Found
                          </span>
                        ) : (
                          <span className="rounded border border-amber-500/40 bg-amber-900/20 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-amber-200">
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-red-100">{short(it.burnRecord?.ordinalWallet ?? null)}</td>
                      <td className="px-3 py-2 text-[11px] text-red-100">{it.burnRecord?.status ?? '-'}</td>
                      <td className="px-3 py-2 text-[11px]">
                        {!it.hasBurnRecord ? (
                          <button
                            onClick={() => handleFix(it)}
                            disabled={fixingId === it.inscriptionId}
                            className="rounded border border-amber-500/40 bg-amber-900/20 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-amber-200 hover:bg-amber-800/30 disabled:opacity-60"
                          >
                            {fixingId === it.inscriptionId ? 'Fixing…' : 'Fix'}
                          </button>
                        ) : (
                          <span className="text-[10px] text-red-300/70">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}


