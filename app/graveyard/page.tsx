'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Skull, AlertTriangle, Sparkles, FlaskConical } from 'lucide-react'

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
  ascensionPowder: number
  imageBlobUrl?: string | null
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
  const [powderSpending, setPowderSpending] = useState<string | null>(null)
  const [ascending, setAscending] = useState<string | null>(null)
  const [limboImages, setLimboImages] = useState<Array<{ id: string; imageUrl: string; sourceInscriptionId: string }>>([])
  const [mintQueueImages, setMintQueueImages] = useState<Array<{ id: string; imageUrl: string; sourceInscriptionId: string }>>([])
  const [selectedLimbo, setSelectedLimbo] = useState<{ id: string; imageUrl: string; sourceInscriptionId: string } | null>(null)
  const [choosingLimbo, setChoosingLimbo] = useState(false)
  const powderRequestInProgress = useRef<string | null>(null)

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
            ascensionPowder:
              typeof item?.ascensionPowder === 'number'
                ? Math.max(0, Number(item.ascensionPowder))
                : Math.max(
                    0,
                    Number.parseInt((item?.ascensionPowder ?? item?.ascension_powder ?? '0').toString(), 10) || 0,
                  ),
            imageBlobUrl: (item?.imageBlobUrl ?? item?.image_blob_url ?? null) as string | null | undefined,
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
  }, [ordinalAddress])

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
  const MAX_POWDER_PER_USE = 20
  const powderToUse = Math.min(MAX_POWDER_PER_USE, powderAvailable)

  const loadLimboAndMintQueue = useCallback(async () => {
    if (!ordinalAddress) return

    try {
      const response = await fetch(`/api/abyss/ascended/limbo?wallet=${encodeURIComponent(ordinalAddress)}`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      const payload = await response.json().catch(() => null)

      if (response.ok && payload?.success) {
        const limbo = payload.limbo || []
        setLimboImages(limbo)
        setMintQueueImages(payload.mintQueue || [])
        
        // Auto-open modal if there's a pending limbo entry and no modal is currently open
        // Use functional update to check current state
        setSelectedLimbo((current) => {
          if (limbo.length > 0 && !current) {
            return limbo[0]
          }
          return current
        })
      }
    } catch (err) {
      console.error('Failed to load limbo and mint queue:', err)
    }
  }, [ordinalAddress])

  const handleFinalAscend = useCallback(
    async (entry: GraveyardEntry) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to ascend.')
        return
      }

      if (ascending) {
        return
      }

      // Prevent starting new ascension if there's a pending limbo choice
      // Check current state using functional updates to avoid stale closures
      let hasPendingLimbo = false
      setLimboImages((current) => {
        hasPendingLimbo = current.length > 0
        return current
      })
      
      if (hasPendingLimbo || selectedLimbo) {
        toast.error('You have a pending ascension choice. Please complete it first.')
        return
      }

      if (entry.ascensionPowder < 500) {
        toast.error('This offering has not reached full ascension yet.')
        return
      }

      setAscending(entry.inscriptionId)
      try {
        const response = await fetch(
          `/api/abyss/burns/${encodeURIComponent(entry.inscriptionId)}/final-ascend`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: ordinalAddress }),
          },
        )

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to ascend.')
        }

        // Show limbo modal with generated image
        setSelectedLimbo({
          id: payload.limboId,
          imageUrl: payload.imageUrl,
          sourceInscriptionId: entry.inscriptionId,
        })

        // Reload graveyard to show updated powder (should be 0 now)
        await loadGraveyard()
        await loadLimboAndMintQueue()

        toast.success('Mutant monster generated! Choose its fate.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to ascend.'
        toast.error(message)
      } finally {
        setAscending(null)
      }
    },
    [ordinalAddress, toast, ascending, limboImages, selectedLimbo, loadGraveyard, loadLimboAndMintQueue],
  )

  const handleUsePowder = useCallback(
    async (entry: GraveyardEntry) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to channel ascension powder.')
        return
      }

      // Prevent multiple simultaneous requests using ref (more reliable than state)
      if (powderRequestInProgress.current) {
        return
      }

      if (!hasPowder) {
        toast.error('No ascension powder available to spend.')
        return
      }

      if (entry.ascensionPowder >= 500) {
        toast.error('This offering has already reached full ascension.')
        return
      }

      // Calculate how much powder is needed to reach 500
      const powderNeeded = 500 - entry.ascensionPowder
      // Use the minimum of: max per use, available powder, and what's needed
      const amountToUse = Math.min(MAX_POWDER_PER_USE, powderAvailable, powderNeeded)

      if (amountToUse <= 0) {
        toast.error('Cannot use powder. Either none available or already at max.')
        return
      }

      // Set both ref and state for UI updates
      powderRequestInProgress.current = entry.inscriptionId
      setPowderSpending(entry.inscriptionId)

      try {
        const response = await fetch(
          `/api/abyss/burns/${encodeURIComponent(entry.inscriptionId)}/ascend`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: ordinalAddress, amount: amountToUse }),
          },
        )

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to channel ascension powder.')
        }

        const updatedOrdinalPowder = Math.max(0, Number(payload?.ordinalPowder ?? entry.ascensionPowder))
        const updatedProfilePowder = Math.max(0, Number(payload?.profilePowder ?? 0))

        // Update state with functional updates to ensure we have latest values
        setProfile((prev) =>
          prev ? { ...prev, ascension_powder: updatedProfilePowder } : prev,
        )
        setEntries((prev) =>
          prev.map((item) =>
            item.inscriptionId === entry.inscriptionId
              ? { ...item, ascensionPowder: updatedOrdinalPowder }
              : item,
          ),
        )

        const spent = Math.max(0, Number(payload?.spent ?? amountToUse))
        const completed = Boolean(payload?.completed)
        if (completed) {
          toast.success(`${spent} powder channeled. Ascension complete! Click "Ascend" to proceed.`)
        } else {
          toast.success(`${spent} powder channeled successfully.`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to channel ascension powder.'
        toast.error(message)
      } finally {
        powderRequestInProgress.current = null
        setPowderSpending(null)
      }
    },
    [ordinalAddress, toast, hasPowder, powderAvailable, MAX_POWDER_PER_USE, handleFinalAscend],
  )

  const handleLimboChoice = useCallback(
    async (choice: 'mint' | 'abyss') => {
      if (!selectedLimbo || !ordinalAddress || choosingLimbo) {
        return
      }

      setChoosingLimbo(true)
      try {
        const response = await fetch(
          `/api/abyss/ascended/limbo/${encodeURIComponent(selectedLimbo.id)}/choose`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ choice, walletAddress: ordinalAddress }),
          },
        )

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to process choice.')
        }

        setSelectedLimbo(null)
        await loadGraveyard()
        await loadLimboAndMintQueue()

        toast.success(payload.message || 'Choice processed successfully.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to process choice.'
        toast.error(message)
      } finally {
        setChoosingLimbo(false)
      }
    },
    [selectedLimbo, ordinalAddress, choosingLimbo, loadGraveyard, loadLimboAndMintQueue, toast],
  )

  useEffect(() => {
    if (isWalletConnected && ordinalAddress) {
      void loadLimboAndMintQueue()
    }
  }, [isWalletConnected, ordinalAddress, loadLimboAndMintQueue])

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
                    const imageUrl = entry.imageBlobUrl || `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(entry.inscriptionId)}`
                    const shortInscription =
                      entry.inscriptionId.length > 18
                        ? `${entry.inscriptionId.slice(0, 8)}…${entry.inscriptionId.slice(-6)}`
                        : entry.inscriptionId
                    const status = entry.status.toLowerCase()
                    const statusClasses =
                      status === 'confirmed'
                        ? 'border-emerald-400/50 bg-emerald-900/30 text-emerald-200'
                        : 'border-amber-400/40 bg-amber-900/30 text-amber-200'

                    const progressPercent = Math.min(
                      100,
                      Math.round((Math.max(0, entry.ascensionPowder) / 500) * 100),
                    )
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
                              unoptimized={imageUrl.includes('blob.vercel-storage.com')}
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
                        <div className="space-y-2 border-t border-red-500/20 bg-black/60 px-3 py-3">
                          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-red-200/60">
                            <span className="flex items-center gap-1">
                              <FlaskConical className="h-3 w-3 text-amber-300" /> Reserve
                            </span>
                            <span className="font-mono text-[10px] text-red-100">{powderAvailable.toLocaleString()}</span>
                          </div>
                          {hasPowder && entry.ascensionPowder < 500 && (
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-amber-200/70">
                              <span>Use</span>
                              <span className="font-mono text-[10px] text-amber-100">
                                {Math.min(MAX_POWDER_PER_USE, powderAvailable, 500 - entry.ascensionPowder)} Powder
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-amber-200/80">
                            <span className="flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-amber-400" /> Ascension
                            </span>
                            <span className="font-mono text-[10px] text-amber-100">
                              {Math.min(500, entry.ascensionPowder).toLocaleString()} / 500
                            </span>
                          </div>
                          {entry.ascensionPowder >= 500 ? (
                            <Button
                              type="button"
                              disabled={
                                ascending === entry.inscriptionId ||
                                Boolean(ascending) ||
                                limboImages.length > 0 ||
                                Boolean(selectedLimbo)
                              }
                              onClick={() => handleFinalAscend(entry)}
                              className="flex w-full items-center justify-center gap-2 rounded-full border border-amber-500/60 bg-amber-600/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-amber-100 transition hover:bg-amber-600/45 disabled:cursor-not-allowed disabled:border-amber-500/30 disabled:bg-black/40 disabled:text-amber-200/40"
                            >
                              {ascending === entry.inscriptionId ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Summoning...
                                </>
                              ) : limboImages.length > 0 || selectedLimbo ? (
                                'Pending Choice'
                              ) : (
                                'Ascend'
                              )}
                            </Button>
                          ) : (
                          <Button
                            type="button"
                              disabled={!hasPowder || powderSpending === entry.inscriptionId}
                            onClick={() => handleUsePowder(entry)}
                            className="flex w-full items-center justify-center gap-2 rounded-full border border-red-500/60 bg-red-600/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100 transition hover:bg-red-600/45 disabled:cursor-not-allowed disabled:border-red-500/30 disabled:bg-black/40 disabled:text-red-200/40"
                          >
                            {powderSpending === entry.inscriptionId ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Use Powder'
                            )}
                          </Button>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Limbo Modal */}
        {selectedLimbo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="relative max-w-2xl rounded-3xl border border-amber-500/60 bg-black/95 p-6 shadow-[0_0_50px_rgba(251,191,36,0.5)]">
              <h2 className="mb-4 text-center text-xl font-mono uppercase tracking-[0.3em] text-amber-200">
                Mutant Monster Generated
              </h2>
              <div className="mb-4 aspect-square overflow-hidden rounded-2xl border border-amber-500/40">
                <Image
                  src={selectedLimbo.imageUrl}
                  alt="Generated mutant monster"
                  width={512}
                  height={512}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              </div>
              <p className="mb-6 text-center text-sm uppercase tracking-[0.3em] text-red-200/80">
                Choose the fate of this ascended creature:
              </p>
              <div className="flex gap-4">
                <Button
                  type="button"
                  disabled={choosingLimbo}
                  onClick={() => handleLimboChoice('mint')}
                  className="flex-1 rounded-full border border-emerald-500/60 bg-emerald-600/30 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-emerald-100 transition hover:bg-emerald-600/45 disabled:opacity-50"
                >
                  {choosingLimbo ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    'Save for Mint'
                  )}
                </Button>
                <Button
                  type="button"
                  disabled={choosingLimbo}
                  onClick={() => handleLimboChoice('abyss')}
                  className="flex-1 rounded-full border border-red-500/60 bg-red-600/30 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-red-100 transition hover:bg-red-600/45 disabled:opacity-50"
                >
                  {choosingLimbo ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    'Throw in Abyss'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Limbo Section */}
        {limboImages.length > 0 && (
          <section className="flex flex-col gap-5">
            <h2 className="text-xl font-mono uppercase tracking-[0.4em] text-amber-300">
              Awaiting Choice
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {limboImages.map((limbo) => (
                <article
                  key={limbo.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-amber-500/40 bg-black/70 shadow-[0_0_25px_rgba(251,191,36,0.35)]"
                >
                  <div className="relative aspect-square">
                    <Image
                      src={limbo.imageUrl}
                      alt="Limbo mutant monster"
                      fill
                      sizes="(min-width: 1280px) 220px, (min-width: 768px) 25vw, 50vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="border-t border-amber-500/20 bg-black/60 px-3 py-3">
                    <Button
                      type="button"
                      onClick={() => setSelectedLimbo(limbo)}
                      className="w-full rounded-full border border-amber-500/60 bg-amber-600/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-amber-100 transition hover:bg-amber-600/45"
                    >
                      Choose Fate
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Mint Queue Section */}
        {mintQueueImages.length > 0 && (
          <section className="flex flex-col gap-5">
            <h2 className="text-xl font-mono uppercase tracking-[0.4em] text-emerald-300">
              Waiting Release (Mint)
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {mintQueueImages.map((mint) => (
                <article
                  key={mint.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-emerald-500/40 bg-black/70 shadow-[0_0_25px_rgba(16,185,129,0.35)]"
                >
                  <div className="relative aspect-square">
                    <Image
                      src={mint.imageUrl}
                      alt="Mint queue mutant monster"
                      fill
                      sizes="(min-width: 1280px) 220px, (min-width: 768px) 25vw, 50vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="border-t border-emerald-500/20 bg-black/60 px-3 py-3">
                    <p className="text-center text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-200/70">
                      Awaiting Mint
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default function GraveyardPage() {
  return <GraveyardContent />
}


