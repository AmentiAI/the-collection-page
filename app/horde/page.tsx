'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Skull, AlertTriangle, Sparkles, FlaskConical, X, AlertCircle, Sword } from 'lucide-react'

import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/Toast'
import { useWallet } from '@/lib/wallet/compatibility'

type ChamberEntry = {
  id: string
  inscriptionId: string
  enteredAt: string
  ascensionPowderUsed: number
  imageUrl?: string
}

type WalletProfile = {
  username?: string | null
  avatar_url?: string | null
  ascension_powder?: number | null
}

type DamnedOption = {
  inscriptionId: string
  imageUrl: string
  listed: boolean
}

const ASCENSION_TARGET = 25000
const MAX_POWDER_PER_USE = 20

function HordeChamberContent() {
  const wallet = useWallet()
  const toast = useToast()

  const [entries, setEntries] = useState<ChamberEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<WalletProfile | null>(null)
  const [isHolder, setIsHolder] = useState<boolean | null>(null)
  const [checkingHolder, setCheckingHolder] = useState(false)
  const [powderSpending, setPowderSpending] = useState<string | null>(null)
  const [availableOrdinals, setAvailableOrdinals] = useState<DamnedOption[]>([])
  const [loadingOrdinals, setLoadingOrdinals] = useState(false)
  const [enteringChamber, setEnteringChamber] = useState<string | null>(null)
  const [exitingChamber, setExitingChamber] = useState<string | null>(null)
  const [destroying, setDestroying] = useState<string | null>(null)
  const [ascensionReached, setAscensionReached] = useState<string | null>(null)

  const ordinalAddress = wallet.currentAddress?.trim() || ''
  const isWalletConnected = wallet.isConnected || false

  // Check holder status
  useEffect(() => {
    if (!ordinalAddress) {
      setIsHolder(null)
      return
    }

    let cancelled = false
    setCheckingHolder(true)
    
    Promise.all([
      fetch(`/api/magic-eden?ownerAddress=${encodeURIComponent(ordinalAddress)}&collectionSymbol=the-damned&fetchAll=true`).then(async (res) => {
        if (!res.ok) return { tokens: [] }
        return res.json()
      }).catch(() => ({ tokens: [] })),
      fetch(`/api/holders/check-access?walletAddress=${encodeURIComponent(ordinalAddress)}`).then(async (res) => {
        if (!res.ok) return { success: false, hasBurns: false }
        return res.json()
      }).catch(() => ({ success: false, hasBurns: false }))
    ]).then(([ordinalsData, burnsData]) => {
      if (cancelled) return
      const tokens = Array.isArray(ordinalsData.tokens) ? ordinalsData.tokens : (Array.isArray(ordinalsData) ? ordinalsData : [])
      const hasUnlisted = tokens.some((token: { listed?: boolean }) => token.listed === false)
      const hasAnyListed = tokens.some((token: { listed?: boolean }) => token.listed === true)
      const hasUnlistedOrdinals = hasUnlisted && !hasAnyListed
      const hasBurns = burnsData.success && burnsData.hasBurns
      setIsHolder(hasUnlistedOrdinals || hasBurns)
    }).catch(() => {
      if (!cancelled) setIsHolder(false)
    }).finally(() => {
      if (!cancelled) setCheckingHolder(false)
    })

    return () => {
      cancelled = true
    }
  }, [ordinalAddress])

  const handleConnectedChange = useCallback((connected: boolean) => {
    if (!connected) {
      setEntries([])
      setProfile(null)
      setError(null)
      setAvailableOrdinals([])
    }
  }, [])

  const loadChamber = useCallback(async () => {
    if (!ordinalAddress) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Load chamber status
      const chamberResponse = await fetch(`/api/horde/chamber/status?walletAddress=${encodeURIComponent(ordinalAddress)}`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      const chamberData = await chamberResponse.json().catch(() => null)

      if (chamberResponse.ok && chamberData?.success) {
        const records = chamberData.records || []
        
        // Fetch images for each entry
        const entriesWithImages = await Promise.all(
          records.map(async (record: any) => {
            const imageUrl = `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(record.inscriptionId)}`
            return {
              id: record.id,
              inscriptionId: record.inscriptionId,
              enteredAt: record.enteredAt,
              ascensionPowderUsed: record.ascensionPowderUsed,
              imageUrl,
            }
          })
        )
        
        setEntries(entriesWithImages)
      }

      // Load profile
      const profileResponse = await fetch(`/api/profile-with-data?walletAddress=${encodeURIComponent(ordinalAddress)}`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      const profileData = await profileResponse.json().catch(() => null)

      if (profileResponse.ok && profileData?.profile) {
        setProfile(profileData.profile as WalletProfile)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load chamber.'
      setError(message)
      setEntries([])
      setProfile(null)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [ordinalAddress, toast])

  const loadAvailableOrdinals = useCallback(async (chamberInscriptionIds: Set<string> = new Set()) => {
    if (!ordinalAddress) return

    setLoadingOrdinals(true)
    try {
      const response = await fetch(`/api/magic-eden?ownerAddress=${encodeURIComponent(ordinalAddress)}&collectionSymbol=the-damned&fetchAll=true`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      const data = await response.json().catch(() => ({ tokens: [] }))
      const tokens = Array.isArray(data.tokens) ? data.tokens : (Array.isArray(data) ? data : [])

      // Filter for original damned (not ascended, not horde)
      const originalOrdinals: DamnedOption[] = []

      for (const token of tokens as Array<Record<string, any>>) {
        const inscriptionId = (token?.id || token?.inscriptionId)?.toString().trim()
        if (!inscriptionId || chamberInscriptionIds.has(inscriptionId)) continue

        // Check if listed - skip listed ordinals
        if (token.listed === true) continue

        // Get attributes
        let attributes: Array<{ trait_type?: string; traitType?: string; value?: string }> = []
        if (token?.meta?.attributes && Array.isArray(token.meta.attributes)) {
          attributes = token.meta.attributes
        } else if (token?.metadata?.attributes && Array.isArray(token.metadata.attributes)) {
          attributes = token.metadata.attributes
        } else if (token?.attributes && Array.isArray(token.attributes)) {
          attributes = token.attributes
        }

        // Check for Ascended trait (Angelic or Demonic) - exclude
        const ascendedTrait = attributes.find(
          (attr) =>
            (attr.trait_type === 'Ascended' || attr.traitType === 'Ascended') &&
            (attr.value === 'Angelic' || attr.value === 'Demonic')
        )

        if (ascendedTrait) continue

        // Check for Horde trait - exclude
        const hordeTrait = attributes.find(
          (attr) =>
            (attr.trait_type === 'Ascension' || attr.traitType === 'Ascension') &&
            attr.value === 'Horde'
        )

        if (hordeTrait) continue

        // Original damned - add to list
        const imageUrl = token.contentURI || token.imageURI || `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(inscriptionId)}`
        originalOrdinals.push({
          inscriptionId,
          imageUrl,
          listed: token.listed === true,
        })
      }

      setAvailableOrdinals(originalOrdinals)
    } catch (err) {
      console.error('Error loading available ordinals:', err)
    } finally {
      setLoadingOrdinals(false)
    }
  }, [ordinalAddress])

  useEffect(() => {
    if (isWalletConnected && ordinalAddress) {
      void loadChamber()
    }
  }, [isWalletConnected, ordinalAddress, loadChamber])

  // Load available ordinals after chamber loads, using current entries
  useEffect(() => {
    if (isWalletConnected && ordinalAddress && entries.length >= 0) {
      const chamberInscriptionIds = new Set(entries.map(e => e.inscriptionId))
      void loadAvailableOrdinals(chamberInscriptionIds)
    }
  }, [isWalletConnected, ordinalAddress, entries.length, loadAvailableOrdinals])

  const handleRefresh = useCallback(() => {
    if (!ordinalAddress) {
      return
    }
    void loadChamber()
  }, [ordinalAddress, loadChamber])

  const powderAvailable = Math.max(0, Math.round(profile?.ascension_powder ?? 0))
  const hasPowder = powderAvailable > 0

  const handleEnterChamber = useCallback(
    async (inscriptionId: string) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to enter the chamber.')
        return
      }

      if (enteringChamber) {
        return
      }

      setEnteringChamber(inscriptionId)
      try {
        const response = await fetch('/api/horde/chamber/enter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: ordinalAddress, inscriptionId }),
        })

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to enter chamber.')
        }

        await loadChamber()
        toast.success('Ordinal entered the chamber.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to enter chamber.'
        toast.error(message)
      } finally {
        setEnteringChamber(null)
      }
    },
    [ordinalAddress, toast, enteringChamber, loadChamber, loadAvailableOrdinals],
  )

  const handleUsePowder = useCallback(
    async (entry: ChamberEntry) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to use powder.')
        return
      }

      if (powderSpending === entry.inscriptionId) {
        return
      }

      if (!hasPowder) {
        toast.error('No ascension powder available to spend.')
        return
      }

      if (entry.ascensionPowderUsed >= ASCENSION_TARGET) {
        toast.error('This ordinal has already reached the ascension target.')
        return
      }

      const powderNeeded = ASCENSION_TARGET - entry.ascensionPowderUsed
      const amountToUse = Math.min(MAX_POWDER_PER_USE, powderAvailable, powderNeeded)

      if (amountToUse <= 0) {
        toast.error('Cannot use powder. Either none available or already at max.')
        return
      }

      setPowderSpending(entry.inscriptionId)

      try {
        const response = await fetch('/api/horde/chamber/use-powder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: ordinalAddress, inscriptionId: entry.inscriptionId, amount: amountToUse }),
        })

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to use powder.')
        }

        const updatedPowderUsed = payload.powderUsed || entry.ascensionPowderUsed
        const updatedProfilePowder = payload.powderRemaining || 0

        setProfile((prev) =>
          prev ? { ...prev, ascension_powder: updatedProfilePowder } : prev,
        )
        setEntries((prev) =>
          prev.map((item) =>
            item.inscriptionId === entry.inscriptionId
              ? { ...item, ascensionPowderUsed: updatedPowderUsed }
              : item,
          ),
        )

        if (payload.reachedTarget) {
          setAscensionReached(entry.inscriptionId)
          toast.success(`+${amountToUse} powder ✓ Ascension target reached!`)
        } else {
          toast.success(`+${amountToUse} powder`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to use powder.'
        toast.error(message)
      } finally {
        setPowderSpending(null)
      }
    },
    [ordinalAddress, toast, hasPowder, powderAvailable, powderSpending],
  )

  const handleDestroy = useCallback(
    async (entry: ChamberEntry) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to destroy ordinal.')
        return
      }

      if (destroying === entry.inscriptionId) {
        return
      }

      if (!confirm('Are you sure you want to destroy this ordinal? This will remove it from the chamber and return ascension powder.')) {
        return
      }

      setDestroying(entry.inscriptionId)
      try {
        const response = await fetch('/api/horde/chamber/destroy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: ordinalAddress, inscriptionId: entry.inscriptionId }),
        })

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to destroy ordinal.')
        }

        const updatedProfilePowder = payload.newBalance || 0
        setProfile((prev) =>
          prev ? { ...prev, ascension_powder: updatedProfilePowder } : prev,
        )

        await loadChamber()
        toast.success(payload.message || 'Ordinal destroyed and powder returned.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to destroy ordinal.'
        toast.error(message)
      } finally {
        setDestroying(null)
      }
    },
    [ordinalAddress, toast, destroying, loadChamber, loadAvailableOrdinals],
  )

  const handleExitChamber = useCallback(
    async (entry: ChamberEntry) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to exit chamber.')
        return
      }

      if (exitingChamber === entry.inscriptionId) {
        return
      }

      setExitingChamber(entry.inscriptionId)
      try {
        const response = await fetch('/api/horde/chamber/exit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: ordinalAddress, inscriptionId: entry.inscriptionId }),
        })

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to exit chamber.')
        }

        await loadChamber()
        toast.success('Ordinal exited the chamber.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to exit chamber.'
        toast.error(message)
      } finally {
        setExitingChamber(null)
      }
    },
    [ordinalAddress, toast, exitingChamber, loadChamber, loadAvailableOrdinals],
  )

  // Show locked page if not a holder
  if (checkingHolder) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
        <Header connected={isWalletConnected} onConnectedChange={handleConnectedChange} showMusicControls={false} />
        <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center justify-center px-4 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-red-400" />
        </main>
      </div>
    )
  }

  if (isHolder === false) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
        <Header connected={isWalletConnected} onConnectedChange={handleConnectedChange} showMusicControls={false} />
        <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-6 rounded-3xl border border-red-500/40 bg-red-950/20 p-10 text-center px-4 py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-900/30 px-4 py-1 text-[11px] font-mono uppercase tracking-[0.4em] text-red-200">
            <AlertTriangle className="h-3.5 w-3.5 text-emerald-400" />
            Holder Access Only
          </div>
          <h1 className="text-2xl font-black uppercase tracking-[0.45em] text-red-100">Chamber Locked</h1>
          <p className="max-w-2xl text-sm uppercase tracking-[0.3em] text-red-200/80">
            You must have at least one unlisted Damned ordinal in your wallet to access the chamber.
          </p>
        </main>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <Header connected={isWalletConnected} onConnectedChange={handleConnectedChange} showMusicControls={false} />

      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.15),_transparent_55%)]" />

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-8">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="flex items-center justify-center gap-3 text-3xl font-semibold uppercase tracking-[0.45em] text-red-300 md:text-4xl">
            <Skull className="h-7 w-7 text-red-400 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" aria-hidden="true" />
            Horde Chamber
            <Skull className="h-7 w-7 text-red-400 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" aria-hidden="true" />
          </h1>
       
          {profile?.username && (
            <div className="mx-auto flex max-w-md items-center justify-center gap-3 rounded-full border border-red-600/40 bg-black/60 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-red-200/70">
              {profile.avatar_url && (
                <Image
                  src={profile.avatar_url}
                  alt={profile.username ?? 'Chamber user avatar'}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full border border-red-500/60 object-cover"
                />
              )}
              <span>Chamber of {profile.username}</span>
            </div>
          )}
          {profile && (
            <p className="mx-auto max-w-2xl text-[10px] uppercase tracking-[0.3em] text-red-200/60">
              Ascension powder reserve: {powderAvailable.toLocaleString()}
            </p>
          )}
          <p className="mx-auto max-w-2xl text-[11px] uppercase tracking-[0.3em] text-red-200/60">
            Place original Damned ordinals in the chamber. Use 25,000 ascension powder to reach ascension.
          </p>
        </div>

        {!isWalletConnected || !ordinalAddress ? (
          <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-red-600/40 bg-black/80 px-6 py-16 text-center shadow-[0_0_35px_rgba(220,38,38,0.35)]">
            <div className="flex flex-col items-center gap-4">
              <AlertTriangle className="h-10 w-10 text-amber-400 drop-shadow-[0_0_18px_rgba(251,191,36,0.45)]" />
              <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-red-200">Connect Required</h2>
              <p className="max-w-sm text-xs uppercase tracking-[0.35em] text-red-200/70">
                Link your wallet to access the chamber.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-5">
              {error && (
                <div className="rounded-3xl border border-red-600/40 bg-red-950/40 px-4 py-3 text-sm text-red-200 shadow-[0_0_25px_rgba(220,38,38,0.25)]">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-3xl border border-red-600/40 bg-black/80 px-5 py-4 shadow-[0_0_35px_rgba(220,38,38,0.35)] md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-red-200/80">Ordinals in chamber</p>
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
                    No ordinals in the chamber yet. Select an original Damned ordinal to enter.
                  </p>
                </div>
              ) : (
                <div className="max-h-[65vh] overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {entries.map((entry: ChamberEntry) => {
                      const imageUrl = entry.imageUrl || `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(entry.inscriptionId)}`
                      const shortInscription =
                        entry.inscriptionId.length > 18
                          ? `${entry.inscriptionId.slice(0, 8)}…${entry.inscriptionId.slice(-6)}`
                          : entry.inscriptionId
                      const progressPercent = Math.min(
                        100,
                        Math.round((Math.max(0, entry.ascensionPowderUsed) / ASCENSION_TARGET) * 100),
                      )
                      const reachedTarget = entry.ascensionPowderUsed >= ASCENSION_TARGET
                      
                      return (
                        <article
                          key={entry.id}
                          data-inscription-id={entry.inscriptionId}
                          className="group relative flex flex-col overflow-hidden rounded-2xl border border-red-500/40 bg-black/70 shadow-[0_0_25px_rgba(220,38,38,0.35)] transition"
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
                          </div>
                          <div className="space-y-2 border-t border-red-500/20 bg-black/60 px-3 py-3">
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-red-200/60">
                              <span className="flex items-center gap-1">
                                <FlaskConical className="h-3 w-3 text-amber-300" /> Reserve
                              </span>
                              <span className="font-mono text-[10px] text-red-100">{powderAvailable.toLocaleString()}</span>
                            </div>
                            {hasPowder && !reachedTarget && (
                              <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-amber-200/70">
                                <span>Use</span>
                                <span className="font-mono text-[10px] text-amber-100">
                                  {Math.min(MAX_POWDER_PER_USE, powderAvailable, ASCENSION_TARGET - entry.ascensionPowderUsed)} Powder
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-amber-200/80">
                              <span className="flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-amber-400" /> Ascension
                              </span>
                              <span className="font-mono text-[10px] text-amber-100">
                                {Math.min(ASCENSION_TARGET, entry.ascensionPowderUsed).toLocaleString()} / {ASCENSION_TARGET.toLocaleString()}
                              </span>
                            </div>
                            {reachedTarget ? (
                              <div className="flex flex-col items-center gap-1">
                                <div className="w-full rounded-full border border-emerald-500/60 bg-emerald-600/30 px-3 py-2 text-center text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-100">
                                  Target Reached!
                                </div>
                              </div>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  disabled={!hasPowder || powderSpending === entry.inscriptionId}
                                  onClick={() => handleUsePowder(entry)}
                                  className="flex w-full items-center justify-center gap-2 rounded-full border border-red-500/60 bg-red-600/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100 transition hover:bg-red-600/45 disabled:cursor-not-allowed disabled:border-red-500/30 disabled:bg-black/40 disabled:text-red-200/40"
                                >
                                  {powderSpending === entry.inscriptionId && (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  )}
                                  Use Powder
                                </Button>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    disabled={destroying === entry.inscriptionId}
                                    onClick={() => handleDestroy(entry)}
                                    className="flex-1 items-center justify-center rounded-full border border-red-500/60 bg-red-700/40 px-2 py-1.5 text-[9px] font-mono uppercase tracking-[0.3em] text-red-100 transition hover:bg-red-700/60 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {destroying === entry.inscriptionId ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      'Destroy'
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    disabled={exitingChamber === entry.inscriptionId}
                                    onClick={() => handleExitChamber(entry)}
                                    className="flex-1 items-center justify-center rounded-full border border-gray-500/60 bg-gray-700/40 px-2 py-1.5 text-[9px] font-mono uppercase tracking-[0.3em] text-gray-100 transition hover:bg-gray-700/60 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {exitingChamber === entry.inscriptionId ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      'Exit'
                                    )}
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Available Ordinals Section */}
            <section className="flex flex-col gap-5">
              <h2 className="text-xl font-mono uppercase tracking-[0.4em] text-red-300">
                Available Original Damned
              </h2>
              {loadingOrdinals ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-red-400" />
                </div>
              ) : availableOrdinals.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-red-500/40 bg-black/85 px-6 py-16 text-center shadow-[0_0_30px_rgba(220,38,38,0.3)]">
                  <p className="max-w-sm text-xs uppercase tracking-[0.35em] text-red-200/70">
                    No available original Damned ordinals. Only original ordinals (not ascended demons/angels, not horde) can enter the chamber.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {availableOrdinals.map((ordinal) => (
                    <article
                      key={ordinal.inscriptionId}
                      className="group relative flex flex-col overflow-hidden rounded-2xl border border-amber-500/40 bg-black/70 shadow-[0_0_25px_rgba(251,191,36,0.35)] transition"
                    >
                      <div className="relative aspect-square">
                        <Image
                          src={ordinal.imageUrl}
                          alt={ordinal.inscriptionId}
                          fill
                          sizes="(min-width: 1280px) 220px, (min-width: 768px) 25vw, 50vw"
                          className="object-cover transition duration-500 ease-out group-hover:scale-105"
                        />
                      </div>
                      <div className="border-t border-amber-500/20 bg-black/60 px-3 py-3">
                        <Button
                          type="button"
                          disabled={enteringChamber === ordinal.inscriptionId}
                          onClick={() => handleEnterChamber(ordinal.inscriptionId)}
                          className="flex w-full items-center justify-center gap-2 rounded-full border border-amber-500/60 bg-amber-600/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-amber-100 transition hover:bg-amber-600/45 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {enteringChamber === ordinal.inscriptionId ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Entering...
                            </>
                          ) : (
                            'Enter Chamber'
                          )}
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* Ascension Reached Modal */}
        {ascensionReached && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <div className="relative max-w-2xl w-full rounded-3xl border-2 border-emerald-600/80 bg-black/98 p-8 shadow-[0_0_80px_rgba(16,185,129,0.8)]">
              <div className="mb-6 text-center">
                <AlertCircle className="mx-auto mb-4 h-16 w-16 text-emerald-500" />
                <h2 className="mb-3 text-2xl font-mono uppercase tracking-[0.3em] text-emerald-400">
                  ASCENSION TARGET REACHED!
                </h2>
                <p className="mb-6 text-sm leading-relaxed text-emerald-200/80">
                  You have reached 25,000 ascension powder on this ordinal. The ascension process is ready to begin.
                </p>
                <p className="text-xs text-emerald-300/60">
                  (This is a placeholder alert. Full ascension functionality coming soon.)
                </p>
              </div>
              <div className="flex justify-center">
                <Button
                  type="button"
                  onClick={() => setAscensionReached(null)}
                  className="rounded-full border border-emerald-500/80 bg-emerald-700/40 px-6 py-3 text-sm font-mono uppercase tracking-[0.3em] text-emerald-200 transition hover:bg-emerald-700/60"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

interface MegaMonster {
  id: string
  name: string | null
  prompt: string
  imageUrl: string | null
  fullBodyImageUrl: string | null
  createdAt: string
  updatedAt: string
  totalFights: number
  health: number
  killedBy: string | null
  killerUsername: string | null
}

function HordeMonstersContent() {
  const [monsters, setMonsters] = useState<MegaMonster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/horde/monsters')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.monsters) {
          setMonsters(data.monsters)
        } else {
          setError(data.error || 'Failed to load monsters')
        }
      })
      .catch(err => {
        console.error('Error loading horde:', err)
        setError('Failed to load the horde')
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-black text-white">
      <Header connected={false} showMusicControls={true} />
      
      <main className="max-w-7xl mx-auto px-4 py-8 md:px-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Skull className="h-12 w-12 md:h-16 md:w-16 text-red-500" />
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-wider text-red-500">
              The Horde
            </h1>
            <Skull className="h-12 w-12 md:h-16 md:w-16 text-red-500" />
          </div>
          <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto">
             These abominations attack all armies every hour.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-red-500" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-xl">{error}</p>
          </div>
        ) : monsters.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-xl">No monsters in the horde yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {monsters.map((monster) => (
              <div
                key={monster.id}
                className="relative bg-black/60 border-2 border-red-500/50 rounded-lg overflow-visible hover:border-red-500 transition-all hover:shadow-[0_0_20px_rgba(220,38,38,0.5)] group"
              >
                <div className="overflow-hidden rounded-t-lg">
                  {monster.imageUrl ? (
                    <div className="relative w-full aspect-square bg-black">
                      <Image
                        src={monster.imageUrl}
                        alt={monster.name || monster.prompt}
                        fill
                        className="object-cover"
                        unoptimized={monster.imageUrl.startsWith('data:')}
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-square bg-gray-900 flex items-center justify-center">
                      <Skull className="h-16 w-16 text-gray-600" />
                    </div>
                  )}
                </div>
                {/* Full body image on hover - positioned outside the card */}
                {monster.fullBodyImageUrl && (
                  <div className="absolute left-full top-0 ml-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-50 w-64 h-96">
                    <div className="bg-black/95 border-2 border-red-500/80 rounded-lg p-2 shadow-2xl w-full h-full">
                      <Image
                        src={monster.fullBodyImageUrl}
                        alt={`${monster.name || 'Monster'} - Full Body`}
                        width={256}
                        height={384}
                        className="w-full h-full object-contain"
                        unoptimized
                      />
                    </div>
                  </div>
                )}
                
                <div className="p-4">
                  {monster.name && (
                    <h3 className="text-lg font-bold text-red-400 mb-2">{monster.name}</h3>
                  )}
                  
                  {/* Health Bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Health</span>
                      <span className="text-sm font-bold text-red-400">
                        {monster.health.toLocaleString()} / 15,000
                      </span>
                    </div>
                    <div className="w-full h-4 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                      <div
                        className="h-full bg-gradient-to-r from-red-600 via-red-500 to-red-400 transition-all duration-300"
                        style={{
                          width: `${Math.min(100, (monster.health / 15000) * 100)}%`
                        }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1 text-right">
                      {Math.round((monster.health / 15000) * 100)}%
                    </div>
                    {monster.health === 0 && monster.killedBy && (
                      <div className="mt-2 p-2 bg-red-950/50 border border-red-500/30 rounded">
                        <p className="text-xs text-red-300 font-semibold mb-1">SLAIN BY:</p>
                        <p className="text-sm text-red-400 font-bold">
                          {monster.killerUsername || monster.killedBy}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <Sword className="h-4 w-4 text-red-400" />
                    <span className="text-sm font-bold text-red-400">
                      {monster.totalFights.toLocaleString()} Fights
                    </span>
                  </div>
                
                  <p className="text-xs text-gray-500 mt-2">
                    Joined: {new Date(monster.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {monsters.length > 0 && (
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-4 bg-black/60 border-2 border-red-500/50 rounded-lg px-6 py-4">
              <div className="text-center">
                <div className="text-3xl font-black text-red-500">
                  {monsters.length}
                </div>
                <div className="text-sm text-gray-400 uppercase tracking-wider">
                  Monsters
                </div>
              </div>
              <div className="h-12 w-px bg-red-500/50" />
              <div className="text-center">
                <div className="text-3xl font-black text-red-500">
                  {monsters.reduce((sum, m) => sum + m.totalFights, 0).toLocaleString()}
                </div>
                <div className="text-sm text-gray-400 uppercase tracking-wider">
                  Total Fights
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function HordePage() {
  const searchParams = useSearchParams()
  const showChamber = searchParams.get('chamber') === '1'

  if (showChamber) {
    return <HordeChamberContent />
  }

  return <HordeMonstersContent />
}
