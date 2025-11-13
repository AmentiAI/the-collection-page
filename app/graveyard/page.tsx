'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Skull, AlertTriangle } from 'lucide-react'

import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/Toast'
import { useWallet } from '@/lib/wallet/compatibility'

type GraveyardEntry = {
  inscriptionId: string
  txId: string
  status: string
  source: string
  createdAt?: string | null
  confirmedAt?: string | null
  updatedAt?: string | null
}

type WalletProfile = {
  username?: string | null
  avatar_url?: string | null
  ascension_powder?: number | null
}

const GRAVEYARD_LIMIT = 180

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  const intervals = [
    { label: 'day', seconds: 86_400 },
    { label: 'hour', seconds: 3_600 },
    { label: 'minute', seconds: 60 },
  ] as const

  for (const { label, seconds } of intervals) {
    if (diffSeconds >= seconds) {
      const count = Math.floor(diffSeconds / seconds)
      return `${count} ${label}${count === 1 ? '' : 's'} ago`
    }
  }

  return `${diffSeconds}s ago`
}

function GraveyardContent() {
  const wallet = useWallet()
  const toast = useToast()

  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [entries, setEntries] = useState<GraveyardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<WalletProfile | null>(null)

  const ordinalAddress = wallet.currentAddress?.trim() || ''

  const formattedSources = useMemo(() => {
    const sources = new Set(entries.map((entry) => entry.source.replace(/_/g, ' ')))
    return Array.from(sources)
      .map((source) => source.replace(/\b([a-z])/g, (match) => match.toUpperCase()))
      .join(' • ')
  }, [entries])

  const handleConnectedChange = useCallback((connected: boolean) => {
    setIsWalletConnected(connected)
    if (!connected) {
      setEntries([])
      setProfile(null)
      setError(null)
    }
  }, [])

  const loadGraveyard = useCallback(async () => {
    if (!ordinalAddress) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('includeGraveyard', 'true')
      params.set('ordinalWallet', ordinalAddress)
      params.set('graveyardLimit', GRAVEYARD_LIMIT.toString())

      const response = await fetch(`/api/abyss/burns?${params.toString()}`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? `Failed to load graveyard (${response.status})`)
      }

      const recordsRaw = Array.isArray(payload?.graveyard) ? payload.graveyard : []
      const mapped = recordsRaw
        .map((item: Record<string, unknown>) => {
          const inscriptionId = (item?.inscriptionId ?? item?.inscription_id ?? '').toString().trim()
          const txId = (item?.txId ?? item?.tx_id ?? '').toString().trim()
          if (!inscriptionId || !txId) {
            return null
          }
          return {
            inscriptionId,
            txId,
            status: (item?.status ?? '').toString(),
            source: (item?.source ?? '').toString(),
            createdAt: (item?.createdAt ?? item?.created_at ?? null) as string | null | undefined,
            confirmedAt: (item?.confirmedAt ?? item?.confirmed_at ?? null) as string | null | undefined,
            updatedAt: (item?.updatedAt ?? item?.updated_at ?? null) as string | null | undefined,
          } satisfies GraveyardEntry
        })
        .filter((entry: GraveyardEntry | null): entry is GraveyardEntry => Boolean(entry))

      setEntries(mapped)
      setProfile(
        payload?.profile && typeof payload.profile === 'object' ? (payload.profile as WalletProfile) : null,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load graveyard.'
      setError(message)
      setEntries([])
      setProfile(null)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [ordinalAddress, toast])

  useEffect(() => {
    if (isWalletConnected && ordinalAddress) {
      void loadGraveyard()
    }
  }, [isWalletConnected, ordinalAddress, loadGraveyard])

  const handleRefresh = useCallback(() => {
    if (!ordinalAddress) {
      return
    }
    void loadGraveyard()
  }, [ordinalAddress, loadGraveyard])

  const powderAvailable = Math.max(0, Math.round(profile?.ascension_powder ?? 0))
  const hasPowder = powderAvailable > 0

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <Header connected={isWalletConnected} onConnectedChange={handleConnectedChange} showMusicControls={false} />

      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.15),_transparent_55%)]" />

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-8">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="flex items-center justify-center gap-3 text-3xl font-semibold uppercase tracking-[0.45em] text-red-300 md:text-4xl">
            <Skull className="h-7 w-7 text-red-400 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" aria-hidden="true" />
            Personal Graveyard
            <Skull className="h-7 w-7 text-red-400 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" aria-hidden="true" />
          </h1>
       
          {profile?.username && (
            <div className="mx-auto flex max-w-md items-center justify-center gap-3 rounded-full border border-red-600/40 bg-black/60 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-red-200/70">
              {profile.avatar_url && (
                <Image
                  src={profile.avatar_url}
                  alt={profile.username ?? 'Sacrificer avatar'}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full border border-red-500/60 object-cover"
                />
              )}
              <span>Offerings by {profile.username}</span>
            </div>
          )}
          {profile && (
            <p className="mx-auto max-w-2xl text-[10px] uppercase tracking-[0.3em] text-red-200/60">
              Ascension powder reserve: {powderAvailable.toLocaleString()}
            </p>
          )}
          {entries.length > 0 && (
            <p className="mx-auto max-w-2xl text-[11px] uppercase tracking-[0.3em] text-red-200/60">
              Fallen offerings from: {formattedSources || 'Unknown rites'}
            </p>
          )}
        </div>

        {!isWalletConnected || !ordinalAddress ? (
          <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-red-600/40 bg-black/80 px-6 py-16 text-center shadow-[0_0_35px_rgba(220,38,38,0.35)]">
            <div className="flex flex-col items-center gap-4">
              <AlertTriangle className="h-10 w-10 text-amber-400 drop-shadow-[0_0_18px_rgba(251,191,36,0.45)]" />
              <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-red-200">Connect Required</h2>
              <p className="max-w-sm text-xs uppercase tracking-[0.35em] text-red-200/70">
                Link your wallet to discover which sacrifices linger in the abyssal ledger.
              </p>
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-5">
            {error && (
              <div className="rounded-3xl border border-red-600/40 bg-red-950/40 px-4 py-3 text-sm text-red-200 shadow-[0_0_25px_rgba(220,38,38,0.25)]">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-3xl border border-red-600/40 bg-black/80 px-5 py-4 shadow-[0_0_35px_rgba(220,38,38,0.35)] md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-red-200/80">Total sacrifices</p>
                <p className="mt-1 text-3xl font-black uppercase tracking-[0.35em] text-red-100">{entries.length}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRefresh}
                  className="flex items-center gap-2 rounded-full border border-amber-500/60 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
                  disabled={loading}
                >
                  <Loader2 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-2 rounded-full border border-red-500/50 bg-black/30 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-100 transition hover:bg-red-600/25"
                >
                  Back to Profile
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-red-600/40 bg-black/80 px-6 py-16 text-center shadow-[0_0_35px_rgba(220,38,38,0.35)]">
                <Loader2 className="mb-4 h-10 w-10 animate-spin text-red-400" />
                <p className="text-xs uppercase tracking-[0.4em] text-red-200">Summoning your graveyard…</p>
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-red-500/40 bg-black/85 px-6 py-16 text-center shadow-[0_0_30px_rgba(220,38,38,0.3)]">
                <Skull className="h-10 w-10 text-red-400" />
                <p className="max-w-sm text-xs uppercase tracking-[0.35em] text-red-200/70">
                  No abyss offerings detected for this wallet yet. Cast something into the void to see it remembered here.
                </p>
              </div>
            ) : (
              <div className="max-h-[65vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {entries.map((entry: GraveyardEntry) => {
                    const imageUrl = `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(entry.inscriptionId)}`
                    const shortInscription =
                      entry.inscriptionId.length > 18
                        ? `${entry.inscriptionId.slice(0, 8)}…${entry.inscriptionId.slice(-6)}`
                        : entry.inscriptionId
                    const status = entry.status.toLowerCase()
                    const statusClasses =
                      status === 'confirmed'
                        ? 'border-emerald-400/50 bg-emerald-900/30 text-emerald-200'
                        : 'border-amber-400/40 bg-amber-900/30 text-amber-200'

                    const progressPercent = 0
                    const referenceInstant = entry.confirmedAt ?? entry.createdAt ?? entry.updatedAt ?? null
                    const timeInGraveyard = formatRelativeTime(referenceInstant)

                    return (
                      <article
                        key={`${entry.inscriptionId}-${entry.txId}`}
                        className="group relative flex flex-col overflow-hidden rounded-2xl border border-red-500/40 bg-black/70 shadow-[0_0_25px_rgba(220,38,38,0.35)] transition focus-within:outline-none focus-within:ring-2 focus-within:ring-red-400 focus-within:ring-offset-2 focus-within:ring-offset-black"
                      >
                        <Link
                          href={`/graveyard/${encodeURIComponent(entry.inscriptionId)}`}
                          className="block"
                          prefetch={false}
                        >
                          <div className="relative aspect-square">
                            <Image
                              src={imageUrl}
                              alt={entry.inscriptionId}
                              fill
                              sizes="(min-width: 1280px) 220px, (min-width: 768px) 25vw, 50vw"
                              className="object-cover transition duration-500 ease-out group-hover:scale-105"
                            />
                            <div className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-3">
                              <div className="rounded-lg border border-red-500/40 bg-black/45 px-3 py-2 shadow-[0_0_15px_rgba(220,38,38,0.3)] backdrop-blur-sm">
                                <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.35em] text-red-200/70">
                                  <span>Ascension</span>
                                  <span>{progressPercent}%</span>
                                </div>
                                <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-red-500/40 bg-black/50">
                                  <div
                                    className="h-full bg-gradient-to-r from-red-500/70 via-amber-400/80 to-emerald-400/80"
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 py-3">
                           
                              {timeInGraveyard && (
                                <div className="text-[9px] uppercase tracking-[0.3em] text-red-200/60">
                                  In pit {timeInGraveyard}
                                </div>
                              )}
                              <div className="text-[9px] uppercase tracking-[0.3em] text-red-200/60">
                                Source: {entry.source.replace(/_/g, ' ')}
                              </div>
                            </div>
                          </div>
                        </Link>
                        <div className="flex items-center justify-between border-t border-red-500/20 bg-black/60 px-3 py-3">
                          <div className="text-[9px] uppercase tracking-[0.3em] text-red-200/60">
                            Powder: {powderAvailable.toLocaleString()}
                          </div>
                          <Button
                            type="button"
                            disabled={!hasPowder}
                            className="rounded-full border border-red-500/60 bg-red-600/30 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100 transition hover:bg-red-600/45 disabled:cursor-not-allowed disabled:border-red-500/30 disabled:bg-black/40 disabled:text-red-200/40"
                          >
                            Use Powder
                          </Button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

export default function GraveyardPage() {
  return <GraveyardContent />
}


