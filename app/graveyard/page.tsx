'use client'

import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
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

const LaserEyesWrapper = dynamic(() => import('@/components/LaserEyesWrapper'), {
  ssr: false,
  loading: () => null,
})

const GRAVEYARD_LIMIT = 180

function GraveyardContent() {
  const wallet = useWallet()
  const toast = useToast()

  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [entries, setEntries] = useState<GraveyardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eligible, setEligible] = useState(false)
  const [checkedEligibility, setCheckedEligibility] = useState(false)

  const ordinalAddress = wallet.currentAddress?.trim() || ''

  const formattedEligibleSources = useMemo(() => {
    const sources = new Set(entries.map((entry) => entry.source.replace(/_/g, ' ')))
    return Array.from(sources)
      .map((source) => source.replace(/\b([a-z])/g, (match) => match.toUpperCase()))
      .join(' • ')
  }, [entries])

  const handleHolderVerified = useCallback((holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
    if (holder) {
      setEligible(true)
    }
  }, [])

  const handleVerifyingStart = useCallback(() => {
    setIsVerifying(true)
  }, [])

  const handleConnectedChange = useCallback(
    (connected: boolean) => {
      setIsWalletConnected(connected)
      if (!connected) {
        setEntries([])
        setEligible(false)
        setError(null)
        setCheckedEligibility(false)
        setIsHolder(undefined)
        setIsVerifying(false)
      }
    },
    [],
  )

  const checkHolderStatus = useCallback(async (address: string) => {
    try {
      const response = await fetch(
        `/api/magic-eden?ownerAddress=${encodeURIComponent(address)}&collectionSymbol=the-damned&fetchAll=false`,
        { headers: { Accept: 'application/json' }, cache: 'no-store' },
      )
      if (!response.ok) {
        return false
      }
      const payload = await response.json().catch(() => null)
      if (!payload) {
        return false
      }

      if (typeof payload.total === 'number') {
        return payload.total > 0
      }

      const tokens = Array.isArray(payload.tokens) ? payload.tokens : Array.isArray(payload) ? payload : []
      return tokens.length > 0
    } catch (err) {
      console.warn('Failed to verify holder status for graveyard access:', err)
      return false
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

      const hasRecords = mapped.length > 0
      let holderEligible = false

      if (!hasRecords) {
        holderEligible = await checkHolderStatus(ordinalAddress)
      }

      const isEligible = hasRecords || holderEligible || isHolder === true
      setEligible(isEligible)

      if (!isEligible) {
        setError('Only holders or proven sacrifice survivors may enter the graveyard.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load graveyard.'
      setError(message)
      setEntries([])
      setEligible(false)
      toast.error(message)
    } finally {
      setLoading(false)
      setCheckedEligibility(true)
    }
  }, [ordinalAddress, checkHolderStatus, isHolder, toast])

  useEffect(() => {
    if (!isWalletConnected || !ordinalAddress) {
      return
    }
    void loadGraveyard()
  }, [isWalletConnected, ordinalAddress, loadGraveyard])

  const handleRefresh = useCallback(() => {
    if (!ordinalAddress) {
      return
    }
    void loadGraveyard()
  }, [ordinalAddress, loadGraveyard])

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <Header
        isHolder={isHolder}
        isVerifying={isVerifying}
        connected={isWalletConnected}
        onHolderVerified={handleHolderVerified}
        onVerifyingStart={handleVerifyingStart}
        onConnectedChange={handleConnectedChange}
        showMusicControls={false}
      />

      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.15),_transparent_55%)]" />

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-8">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="flex items-center justify-center gap-3 text-3xl font-semibold uppercase tracking-[0.45em] text-red-300 md:text-4xl">
            <Skull className="h-7 w-7 text-red-400 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" aria-hidden="true" />
            Personal Graveyard
            <Skull className="h-7 w-7 text-red-400 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" aria-hidden="true" />
          </h1>
          <p className="mx-auto max-w-xl text-xs uppercase tracking-[0.35em] text-red-200/70 md:text-sm">
            {ordinalAddress
              ? `Wallet ${ordinalAddress.slice(0, 4)}…${ordinalAddress.slice(-6)}`
              : 'Connect wallet to proceed'}
          </p>
          {entries.length > 0 && (
            <p className="mx-auto max-w-2xl text-[11px] uppercase tracking-[0.3em] text-red-200/60">
              Fallen offerings from: {formattedEligibleSources || 'Unknown rites'}
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
        ) : loading && !checkedEligibility ? (
          <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-red-600/40 bg-black/80 px-6 py-16 text-center shadow-[0_0_35px_rgba(220,38,38,0.35)]">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-red-400" />
            <p className="text-xs uppercase tracking-[0.4em] text-red-200">Summoning your graveyard…</p>
          </section>
        ) : !eligible ? (
          <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-red-600/40 bg-black/85 px-6 py-16 text-center shadow-[0_0_35px_rgba(220,38,38,0.35)]">
            <AlertTriangle className="mb-4 h-11 w-11 text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]" />
            <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-red-200">Access Denied</h2>
            <p className="mt-3 max-w-md text-xs uppercase tracking-[0.35em] text-red-200/70">
              Only The Damned holders or those with recorded abyss burns may traverse the graveyard.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/gatesofthedamned"
                className="inline-flex items-center gap-2 rounded-full border border-red-500/60 bg-red-600/30 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-100 transition hover:bg-red-600/45"
              >
                Seek the Gates
              </Link>
              <Link
                href="/abyss"
                className="inline-flex items-center gap-2 rounded-full border border-amber-500/60 bg-amber-500/20 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200 transition hover:bg-amber-500/35"
              >
                Offer a Sacrifice
              </Link>
            </div>
            {error && <p className="mt-6 max-w-md text-[11px] uppercase tracking-[0.3em] text-red-300/60">{error}</p>}
          </section>
        ) : (
          <section className="flex flex-col gap-5">
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

            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-red-500/40 bg-black/85 px-6 py-16 text-center shadow-[0_0_30px_rgba(220,38,38,0.3)]">
                <Skull className="h-10 w-10 text-red-400" />
                <p className="max-w-sm text-xs uppercase tracking-[0.35em] text-red-200/70">
                  No abyss offerings detected for this wallet yet. Cast something into the void to see it remembered here.
                </p>
              </div>
            ) : (
              <div className="max-h-[65vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {entries.map((entry) => {
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

                    return (
                      <div
                        key={`${entry.inscriptionId}-${entry.txId}`}
                        className="group relative overflow-hidden rounded-2xl border border-red-500/40 bg-black/70 shadow-[0_0_25px_rgba(220,38,38,0.35)]"
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
                            <div
                              className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.35em] ${statusClasses}`}
                            >
                              {status === 'confirmed' ? 'Purged' : status}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.3em] text-red-200/80">{shortInscription}</div>
                            <div className="text-[9px] uppercase tracking-[0.3em] text-red-200/60">
                              Source: {entry.source.replace(/_/g, ' ')}
                            </div>
                          </div>
                        </div>
                      </div>
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
  return (
    <LaserEyesWrapper>
      <GraveyardContent />
    </LaserEyesWrapper>
  )
}


