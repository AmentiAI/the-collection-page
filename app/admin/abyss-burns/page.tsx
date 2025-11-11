'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Loader2, RefreshCw, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type AbyssBurnRecord = {
  id: string
  inscriptionId: string
  txId: string
  ordinalWallet: string
  paymentWallet: string
  status: string
  createdAt: string | null
  updatedAt: string | null
  confirmedAt: string | null
  lastCheckedAt: string | null
}

const formatDateTime = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function AbyssBurnsAdminPage() {
  const [records, setRecords] = useState<AbyssBurnRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(50)
  const [statusFilter, setStatusFilter] = useState('')
  const [txCheckLoading, setTxCheckLoading] = useState<string | null>(null)
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null)

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (statusFilter.trim()) {
        params.set('status', statusFilter.trim())
      }

      const response = await fetch(`/api/abyss/burns/admin?${params.toString()}`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }

      const data = (await response.json()) as {
        success: boolean
        error?: string
        records?: AbyssBurnRecord[]
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch records')
      }

      setRecords(data.records ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load abyss burns'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [limit, statusFilter])

  useEffect(() => {
    void loadRecords()
  }, [loadRecords])

  const handleCheckTx = useCallback(async (txId: string) => {
    if (!txId) {
      window.alert('No transaction ID available.')
      return
    }

    setTxCheckLoading(txId)
    try {
      const response = await fetch(`https://mempool.space/api/tx/${txId}`)
      if (response.ok) {
        window.alert(`Transaction ${txId} found on mempool.space.`)
      } else if (response.status === 404) {
        window.alert(`Transaction ${txId} not found (HTTP 404).`)
      } else {
        window.alert(`Transaction ${txId} returned status ${response.status}.`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      window.alert(`Failed to check transaction ${txId}: ${message}`)
    } finally {
      setTxCheckLoading(null)
    }
  }, [])

  const statusSummary = useMemo(() => {
    return records.reduce<Record<string, number>>((acc, record) => {
      acc[record.status] = (acc[record.status] ?? 0) + 1
      return acc
    }, {})
  }, [records])

  const inscriptionJson = useMemo(() => {
    const ids = records.map((record) => record.inscriptionId).filter(Boolean)
    return JSON.stringify(ids, null, 2)
  }, [records])

  const handleCopy = useCallback(async (value: string, label: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedMessage(`${label} copied`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      window.alert(`Failed to copy: ${message}`)
    }
  }, [])

  useEffect(() => {
    if (!copiedMessage) return
    const timeoutId = window.setTimeout(() => setCopiedMessage(null), 2000)
    return () => window.clearTimeout(timeoutId)
  }, [copiedMessage])

  return (
    <div className="min-h-screen bg-black px-6 py-10 text-red-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-lg border border-red-700/40 bg-black/60 p-6 shadow-[0_0_25px_rgba(220,38,38,0.35)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-[0.35em] text-red-400 uppercase">Abyss Burns</h1>
              <p className="text-sm text-red-200/60">Administrative overview of all abyss burn submissions.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase tracking-[0.35em] text-red-300">Limit</label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value) || 0)}
                  min={1}
                  max={333}
                  className="h-9 w-20 border-red-700/60 bg-black/60 text-red-100"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase tracking-[0.35em] text-red-300">Status</label>
                <Input
                  placeholder="pending | confirmed"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-9 w-44 border-red-700/60 bg-black/60 text-red-100"
                />
              </div>
              <Button
                onClick={() => loadRecords()}
                disabled={loading}
                className="flex items-center gap-2 border border-red-500 bg-red-700/70 text-xs uppercase tracking-[0.25em] text-red-50 hover:bg-red-600"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs tracking-[0.25em] text-red-300/80">
            <span>Total loaded: {records.length}</span>
            {Object.entries(statusSummary).map(([status, count]) => (
              <span key={status}>
                {status}: {count}
              </span>
            ))}
          </div>
          {error && (
            <div className="rounded border border-red-600/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
        </header>

        <div className="overflow-auto rounded-lg border border-red-700/40 bg-black/70 shadow-[0_0_20px_rgba(220,38,38,0.25)]">
          <table className="min-w-full divide-y divide-red-800 text-sm">
            <thead className="bg-red-950/40 uppercase tracking-[0.35em] text-red-300">
              <tr>
                <th className="px-3 py-2 text-left">Inscription</th>
                <th className="px-3 py-2 text-left">Tx</th>
                <th className="px-3 py-2 text-left">Ordinal Wallet</th>
                <th className="px-3 py-2 text-left">Payment Wallet</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th className="px-3 py-2 text-left">Confirmed</th>
                <th className="px-3 py-2 text-left">Last Checked</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-900/60">
              {records.length === 0 && !loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-xs uppercase tracking-[0.35em] text-red-300/70">
                    No records found.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="hover:bg-red-900/20">
                    <td className="px-3 py-2 font-mono text-[11px] text-red-200">
                      <CopyCell value={record.inscriptionId} label="Inscription ID" onCopy={handleCopy} />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-red-200">
                      <CopyCell value={record.txId} label="Transaction ID" onCopy={handleCopy} />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-red-200/90">
                      <CopyCell value={record.ordinalWallet} label="Ordinal Wallet" onCopy={handleCopy} />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-red-200/70">
                      <CopyCell value={record.paymentWallet} label="Payment Wallet" onCopy={handleCopy} />
                    </td>
                    <td className="px-3 py-2 uppercase tracking-[0.3em] text-red-100">
                      {record.status}
                    </td>
                    <td className="px-3 py-2 text-red-200/80">{formatDateTime(record.createdAt)}</td>
                    <td className="px-3 py-2 text-red-200/70">{formatDateTime(record.updatedAt)}</td>
                    <td className="px-3 py-2 text-green-300/80">{formatDateTime(record.confirmedAt)}</td>
                    <td className="px-3 py-2 text-red-200/70">{formatDateTime(record.lastCheckedAt)}</td>
                    <td className="px-3 py-2">
                      <Button
                        variant="outline"
                        className="flex items-center gap-1 border-red-500/70 text-[11px] uppercase tracking-[0.25em] text-red-200 hover:bg-red-800/20"
                        onClick={() => handleCheckTx(record.txId)}
                        disabled={txCheckLoading === record.txId}
                      >
                        {txCheckLoading === record.txId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Search className="h-3 w-3" />
                        )}
                        Check TX
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-red-200">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading records…</span>
            </div>
          )}
        </div>

        <section className="rounded-lg border border-red-700/40 bg-black/70 p-6 shadow-[0_0_20px_rgba(220,38,38,0.3)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold uppercase tracking-[0.35em] text-red-200">Inscription IDs (JSON)</h2>
            <Button
              variant="outline"
              className="flex items-center gap-2 border-red-500/60 text-xs uppercase tracking-[0.3em] text-red-100 hover:bg-red-800/20"
              onClick={() => handleCopy(inscriptionJson, 'Inscription list')}
              disabled={!records.length}
            >
              <Copy className="h-3 w-3" />
              Copy JSON
            </Button>
          </div>
          <textarea
            readOnly
            value={inscriptionJson}
            className="mt-4 h-48 w-full resize-none rounded-lg border border-red-700/30 bg-black/80 p-3 font-mono text-xs text-red-200"
          />
        </section>
      </div>

      {copiedMessage && (
        <div className="fixed bottom-6 right-6 rounded-md border border-red-600/50 bg-black/80 px-4 py-2 font-mono text-xs uppercase tracking-[0.3em] text-red-100 shadow-[0_0_20px_rgba(220,38,38,0.35)]">
          {copiedMessage}
        </div>
      )}
    </div>
  )
}


function CopyCell({
  value,
  label,
  onCopy,
}: {
  value: string | null
  label: string
  onCopy: (value: string, label: string) => void
}) {
  if (!value) {
    return <span>—</span>
  }

  const truncated = value.length <= 14 ? value : `${value.slice(0, 6)}…${value.slice(-6)}`

  return (
    <div className="flex items-center gap-2">
      <span className="truncate" title={value}>
        {truncated}
      </span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => onCopy(value, label)}
        className="text-red-300 transition hover:text-red-100"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

