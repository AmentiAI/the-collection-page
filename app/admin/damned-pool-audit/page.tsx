'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import Link from 'next/link'

type Circle = {
  id: string
  creator_wallet: string
  creator_inscription_id: string
  status: string
  required_participants: number
  locked_at?: string | null
  completed_at?: string | null
  expires_at?: string | null
  burn_window_granted: boolean
  created_at: string
  updated_at: string
  participants: Array<{
    id: string
    wallet: string
    inscriptionId: string
    image?: string | null
    role: string
    joinedAt?: string | null
    completed: boolean
    completedAt?: string | null
  }>
}

type Summary = {
  wallet: string
  active_created: number
  completed_created: number
  total_created: number
  active_joined: number
  completed_joined: number
  total_joined: number
  last_activity: string
}

export default function DamnedPoolAuditPage() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [circles, setCircles] = useState<Circle[]>([])
  const [summary, setSummary] = useState<Summary[]>([])
  const [walletQuery, setWalletQuery] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (walletQuery.trim().length > 0) params.set('wallet', walletQuery.trim())
      params.set('limit', '100')
      const res = await fetch(`/api/admin/damned-pool/audit?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? `Failed (${res.status})`)
      }
      const data = await res.json()
      setCircles(Array.isArray(data?.circles) ? data.circles : [])
      setSummary(Array.isArray(data?.summary) ? data.summary : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [walletQuery])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const totalParticipants = useMemo(
    () => circles.reduce((acc, c) => acc + (Array.isArray(c.participants) ? c.participants.length : 0), 0),
    [circles],
  )

  const short = (v?: string | null) => (v && v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-6)}` : v ?? '')

  return (
    <div className="min-h-screen bg-black">
      <Header onConnectedChange={setConnected} />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black uppercase tracking-[0.35em] text-red-100">Damned Pool Audit</h1>
          <div className="flex gap-3">
            <input
              value={walletQuery}
              onChange={(e) => setWalletQuery(e.target.value)}
              placeholder="Filter by wallet (optional)"
              className="rounded border border-red-700/50 bg-black/70 px-3 py-2 text-sm text-red-100 outline-none ring-0 placeholder:text-red-300/50"
            />
            <button
              onClick={() => void loadData()}
              disabled={loading}
              className="rounded border border-red-500 bg-red-700/80 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100 hover:bg-red-600 disabled:opacity-60"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        {error && <div className="mt-3 rounded border border-red-600/50 bg-red-950/40 p-3 text-[11px] text-red-200">{error}</div>}

        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-red-600/40 bg-black/60 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-red-200">Overview</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] uppercase tracking-[0.3em] text-red-200/80">
              <div className="rounded border border-red-600/40 bg-black/40 p-3">
                <div className="text-red-300">Circles</div>
                <div className="mt-1 text-xl text-red-100">{circles.length}</div>
              </div>
              <div className="rounded border border-red-600/40 bg-black/40 p-3">
                <div className="text-red-300">Participants</div>
                <div className="mt-1 text-xl text-red-100">{totalParticipants}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-red-600/40 bg-black/60 p-4 overflow-x-auto">
            <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-red-200">Address Summary</h2>
            <table className="mt-3 min-w-full divide-y divide-red-900/60">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-[0.3em] text-red-300">
                  <th className="px-3 py-2 text-left">Wallet</th>
                  <th className="px-3 py-2 text-right">Created (active/total)</th>
                  <th className="px-3 py-2 text-right">Joined (active/total)</th>
                  <th className="px-3 py-2 text-right">Completed (host/join)</th>
                  <th className="px-3 py-2 text-right">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-900/40">
                {summary.map((s) => (
                  <tr key={s.wallet} className="text-[11px] text-red-100">
                    <td className="px-3 py-2">{short(s.wallet)}</td>
                    <td className="px-3 py-2 text-right">
                      {s.active_created}/{s.total_created}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.active_joined}/{s.total_joined}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.completed_created}/{s.completed_joined}
                    </td>
                    <td className="px-3 py-2 text-right">{new Date(s.last_activity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-red-600/40 bg-black/60 p-4 overflow-x-auto">
          <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-red-200">Recent Circles</h2>
          <table className="mt-3 min-w-full divide-y divide-red-900/60">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-[0.3em] text-red-300">
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Creator</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Seats</th>
                <th className="px-3 py-2 text-left">Participants</th>
                <th className="px-3 py-2 text-left">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-900/40">
              {circles.map((c) => (
                <tr key={c.id} className="text-[11px] text-red-100 align-top">
                  <td className="px-3 py-2">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{short(c.creator_wallet)}</td>
                  <td className="px-3 py-2">{c.status}</td>
                  <td className="px-3 py-2 text-right">
                    {(c.participants?.length ?? 0)}/{c.required_participants}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex max-w-[420px] flex-wrap gap-1">
                      {c.participants?.map((p) => (
                        <span
                          key={p.id}
                          className={[
                            'rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.3em]',
                            p.completed ? 'border-emerald-500/50 text-emerald-200' : 'border-red-400/40 text-red-200/80',
                          ].join(' ')}
                          title={`${p.wallet} • ${p.completed ? 'completed' : 'pending'}`}
                        >
                          {short(p.wallet)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Link href="/abyss-summon?type=damned_pool" className="text-amber-300 hover:text-amber-200">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  )
}


