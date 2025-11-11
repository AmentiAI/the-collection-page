'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Flame, Loader2, Sparkles, Trash2 } from 'lucide-react'

import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/Toast'
import { useWallet } from '@/lib/wallet/compatibility'

type SummonParticipant = {
  id: string
  wallet: string
  inscriptionId: string
  role: string
  image?: string | null
  joinedAt?: string | null
}

type SummonRecord = {
  id: string
  creatorWallet: string
  creatorInscriptionId: string
  status: string
  requiredParticipants: number
  lockedAt?: string | null
  completedAt?: string | null
  expiresAt?: string | null
  bonusGranted: boolean
  createdAt: string
  updatedAt: string
  participants: SummonParticipant[]
}

type DamnedOption = {
  inscriptionId: string
  name?: string | null
  image?: string | null
}

const ACTIVE_SUMMON_STATUSES = new Set(['open', 'filling', 'ready'])
const SUMMON_DURATION_MS = 30 * 60 * 1000
const SUMMON_COMPLETION_WINDOW_MS = 2 * 60 * 1000

function formatCountdown(ms: number) {
  if (ms <= 0) {
    return '00:00'
  }
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function AbyssSummonPage() {
  const wallet = useWallet()
  const toast = useToast()

  const ordinalAddress = wallet.currentAddress?.trim() ?? ''

  const [now, setNow] = useState(Date.now())
  const [summons, setSummons] = useState<SummonRecord[]>([])
  const [createdSummons, setCreatedSummons] = useState<SummonRecord[]>([])
  const [joinedSummons, setJoinedSummons] = useState<SummonRecord[]>([])
  const [summonsLoading, setSummonsLoading] = useState(false)
  const [bonusAllowance, setBonusAllowance] = useState(0)
  const [activeTab, setActiveTab] = useState<'active' | 'created' | 'joined'>('active')

  const [damnedOptions, setDamnedOptions] = useState<DamnedOption[]>([])
  const [damnedLoading, setDamnedLoading] = useState(false)
  const [damnedError, setDamnedError] = useState<string | null>(null)
  const [selectedInscriptionId, setSelectedInscriptionId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [joiningSummonId, setJoiningSummonId] = useState<string | null>(null)
  const [completingSummonId, setCompletingSummonId] = useState<string | null>(null)
  const [dismissingSummonId, setDismissingSummonId] = useState<string | null>(null)
  const [inscriptionImageCache, setInscriptionImageCache] = useState<Record<string, string>>({})

  const selectedOption = useMemo(
    () => damnedOptions.find((option) => option.inscriptionId === selectedInscriptionId) ?? null,
    [damnedOptions, selectedInscriptionId],
  )

  useEffect(() => {
    if (damnedOptions.length === 0) {
      return
    }
    setInscriptionImageCache((prev) => {
      let changed = false
      const next = { ...prev }
      for (const option of damnedOptions) {
        if (option.inscriptionId && option.image && !next[option.inscriptionId]) {
          next[option.inscriptionId] = option.image
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [damnedOptions])

  useEffect(() => {
    const updates: Record<string, string> = {}
    for (const list of [summons, createdSummons, joinedSummons]) {
      for (const summon of list) {
        for (const participant of summon.participants) {
          if (participant.inscriptionId && participant.image && !inscriptionImageCache[participant.inscriptionId]) {
            updates[participant.inscriptionId] = participant.image
          }
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      setInscriptionImageCache((prev) => ({ ...prev, ...updates }))
    }
  }, [summons, createdSummons, joinedSummons, inscriptionImageCache])
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  const activeSummons = useMemo(
    () => summons.filter((summon) => ACTIVE_SUMMON_STATUSES.has(summon.status)),
    [summons],
  )
  const createdActiveSummons = useMemo(
    () => createdSummons.filter((summon) => ACTIVE_SUMMON_STATUSES.has(summon.status)),
    [createdSummons],
  )
  const hasOwnActive = createdActiveSummons.length > 0
  const filteredActiveSummons = useMemo(() => {
    if (!ordinalAddress) return activeSummons
    const lowered = ordinalAddress.toLowerCase()
    return activeSummons.filter((summon) => summon.creatorWallet.toLowerCase() !== lowered)
  }, [activeSummons, ordinalAddress])

  const refreshSummons = useCallback(
    async (address: string) => {
      setSummonsLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('limit', '50')
        if (address) {
          params.set('wallet', address)
        }
        const response = await fetch(`/api/abyss/summons?${params.toString()}`, {
          headers: { 'Cache-Control': 'no-store' },
        })
        if (!response.ok) {
          throw new Error(`Summon fetch failed (${response.status})`)
        }
        const data = await response.json()
        const openSummons = Array.isArray(data?.summons) ? (data.summons as SummonRecord[]) : []
        const created = Array.isArray(data?.createdSummons) ? (data.createdSummons as SummonRecord[]) : []
        const joined = Array.isArray(data?.joinedSummons) ? (data.joinedSummons as SummonRecord[]) : []

        setSummons(openSummons)
        setCreatedSummons(created)
        setJoinedSummons(joined)
        setBonusAllowance(typeof data?.bonusAllowance === 'number' ? Number(data.bonusAllowance) : 0)
      } catch (error) {
        console.error('Failed to load summons', error)
        toast.error('Failed to load summons. Please try again.')
      } finally {
        setSummonsLoading(false)
      }
    },
    [toast],
  )

  const loadDamnedOptions = useCallback(
    async (address: string) => {
      if (!address) {
        setDamnedOptions([])
        setSelectedInscriptionId(null)
        return
      }
      setDamnedLoading(true)
      setDamnedError(null)
      try {
        const response = await fetch(
          `/api/magic-eden?ownerAddress=${encodeURIComponent(address)}&collectionSymbol=the-damned&fetchAll=true`,
          { headers: { Accept: 'application/json' }, cache: 'no-store' },
        )
        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || `Magic Eden request failed (${response.status})`)
        }
        const payload = await response.json().catch(() => ({ tokens: [] }))
        const rawTokens =
          Array.isArray(payload?.tokens) ? payload.tokens : Array.isArray(payload) ? payload : []

        const mapped: DamnedOption[] = rawTokens
          .map((token: Record<string, any>) => {
            const inscriptionId = (token?.id || token?.inscriptionId || '').toString().trim()
            if (!inscriptionId) {
              return null
            }
            const name =
              token?.meta?.name ??
              token?.name ??
              (typeof token?.tokenId === 'string' ? `Token ${token.tokenId}` : null)
            const image =
              typeof token?.contentURI === 'string'
                ? token.contentURI
                : typeof token?.image === 'string'
                ? token.image
                : null
            return {
              inscriptionId,
              name,
              image,
            } satisfies DamnedOption
          })
          .filter((option: DamnedOption | null): option is DamnedOption => option !== null)

        setDamnedOptions(mapped)
        setInscriptionImageCache((prev) => {
          const updated = { ...prev }
          for (const option of mapped) {
            if (option.image) {
              updated[option.inscriptionId] = option.image
            }
          }
          return updated
        })
        setSelectedInscriptionId(mapped.length > 0 ? mapped[0].inscriptionId : null)
      } catch (error) {
        console.error('Failed to load damned ordinals:', error)
        setDamnedError(error instanceof Error ? error.message : 'Failed to load ordinals.')
      } finally {
        setDamnedLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (ordinalAddress) {
      void refreshSummons(ordinalAddress)
      void loadDamnedOptions(ordinalAddress)
    } else {
      setSummons([])
      setCreatedSummons([])
      setJoinedSummons([])
      setBonusAllowance(0)
      setDamnedOptions([])
      setSelectedInscriptionId(null)
    }
  }, [ordinalAddress, refreshSummons, loadDamnedOptions])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (ordinalAddress) {
        void refreshSummons(ordinalAddress)
      }
    }, 20_000)
    return () => window.clearInterval(intervalId)
  }, [ordinalAddress, refreshSummons])

  useEffect(() => {
    if (!ordinalAddress) {
      return
    }
    const intervalId = window.setInterval(() => {
      void loadDamnedOptions(ordinalAddress)
    }, 30_000)
    return () => window.clearInterval(intervalId)
  }, [ordinalAddress, loadDamnedOptions])

  const handleCreateSummon = useCallback(async () => {
    if (!ordinalAddress) {
      toast.error('Connect your wallet to start a summoning circle.')
      return
    }
    if (!selectedOption) {
      toast.error('Select an ordinal from your inventory to continue.')
      return
    }
    if (selectedOption?.image) {
      setInscriptionImageCache((prev) => ({
        ...prev,
        [selectedOption.inscriptionId]: selectedOption.image as string,
      }))
    }
    setCreating(true)
    try {
      const response = await fetch('/api/abyss/summons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorWallet: ordinalAddress,
          inscriptionId: selectedOption.inscriptionId,
          inscriptionImage: selectedOption.image ?? null,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message = payload?.error ?? `Summon creation failed (${response.status})`
        throw new Error(message)
      }
      toast.success('Summoning circle created. Await three allies.')
      setDamnedOptions((prev) => prev.filter((option) => option.inscriptionId !== selectedOption.inscriptionId))
      setSelectedInscriptionId(null)
      if (ordinalAddress) {
        await refreshSummons(ordinalAddress)
      }
    } catch (error) {
      console.error('Create summon failed:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create summoning circle.')
    } finally {
      setCreating(false)
    }
  }, [ordinalAddress, selectedOption, refreshSummons, toast])

  const handleJoinSummon = useCallback(
    async (summon: SummonRecord) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to join a summoning circle.')
        return
      }
      if (!selectedOption) {
        toast.error('Select an ordinal from your inventory before joining.')
        return
      }
      if (summon.participants.some((participant) => participant.wallet?.toLowerCase() === ordinalAddress.toLowerCase())) {
        toast.error('You already joined this summoning circle.')
        return
      }
      if (!ACTIVE_SUMMON_STATUSES.has(summon.status)) {
        toast.error('This summoning circle is no longer accepting participants.')
        return
      }

      if (selectedOption?.image) {
        setInscriptionImageCache((prev) => ({
          ...prev,
          [selectedOption.inscriptionId]: selectedOption.image as string,
        }))
      }
      setJoiningSummonId(summon.id)
      try {
        const response = await fetch(`/api/abyss/summons/${summon.id}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: ordinalAddress,
            inscriptionId: selectedOption.inscriptionId,
          inscriptionImage: selectedOption.image ?? null,
          }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          const message = payload?.error ?? `Failed to join summon (${response.status})`
          throw new Error(message)
        }
        toast.success('You joined the summoning circle.')
        setDamnedOptions((prev) => prev.filter((option) => option.inscriptionId !== selectedOption.inscriptionId))
        setSelectedInscriptionId(null)
        if (ordinalAddress) {
          await refreshSummons(ordinalAddress)
        }
      } catch (error) {
        console.error('Join summon failed:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to join summoning circle.')
      } finally {
        setJoiningSummonId(null)
      }
    },
    [ordinalAddress, selectedOption, refreshSummons, toast],
  )

  const handleCompleteSummon = useCallback(
    async (summon: SummonRecord) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to complete the summoning.')
        return
      }
      setCompletingSummonId(summon.id)
      try {
        const response = await fetch(`/api/abyss/summons/${summon.id}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: ordinalAddress }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          const message = payload?.error ?? `Completion failed (${response.status})`
          throw new Error(message)
        }
        const payload = await response.json().catch(() => null)
        if (typeof payload?.bonusAllowance === 'number') {
          setBonusAllowance(Number(payload.bonusAllowance))
        }
        toast.success('Summoning circle completed. Bonus burn granted.')
        if (ordinalAddress) {
          await refreshSummons(ordinalAddress)
        }
      } catch (error) {
        console.error('Complete summon failed:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to complete summoning circle.')
      } finally {
        setCompletingSummonId(null)
      }
    },
    [ordinalAddress, refreshSummons, toast],
  )

  const handleDismissSummon = useCallback(
    async (summon: SummonRecord) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to dismiss the circle.')
        return
      }
      setDismissingSummonId(summon.id)
      try {
        const response = await fetch(`/api/abyss/summons/${summon.id}/dismiss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: ordinalAddress }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          const message = payload?.error ?? `Dismissal failed (${response.status})`
          throw new Error(message)
        }
        toast.success('Circle dissolved. Summon anew.')
        if (ordinalAddress) {
          await refreshSummons(ordinalAddress)
        }
      } catch (error) {
        console.error('Dismiss summon failed:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to dismiss circle.')
      } finally {
        setDismissingSummonId(null)
      }
    },
    [ordinalAddress, refreshSummons, toast],
  )

  const truncateWallet = useCallback((value: string) => {
    const normalized = value.trim()
    if (normalized.length <= 6) return normalized
    return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`
  }, [])

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <Image
          src="/abyssbg.png"
          alt="Abyss background"
          fill
          priority={false}
          className="object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/90" />
      </div>

      <Header connected={Boolean(ordinalAddress)} showMusicControls={false} />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 md:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-red-600/40 bg-black/75 p-8 shadow-[0_0_40px_rgba(220,38,38,0.45)] backdrop-blur">
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-600/40 bg-[radial-gradient(circle,_rgba(220,38,38,0.3)_0%,_rgba(10,0,0,0)_65%)] blur-xl" />
            <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-red-600/20" />
            <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rotate-12 border border-amber-500/20" />
          </div>
          <div className="relative flex flex-col gap-5 text-center">
            <div className="flex items-center justify-center gap-3">
              <Sparkles className="h-8 w-8 text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.65)]" />
              <h1 className="text-3xl font-black uppercase tracking-[0.4em] text-red-100 md:text-4xl">
                Summoning Circles
              </h1>
              <Sparkles className="h-8 w-8 text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.65)]" />
            </div>
            <p className="mx-auto max-w-3xl text-sm uppercase tracking-[0.35em] text-red-200/85">
              Gather four damned within thirty minutes. Complete the ritual to unlock a bonus burn that slips past the abyssal cap.
            </p>
            <div className="grid gap-4 text-xs uppercase tracking-[0.3em] text-red-200/80 md:grid-cols-3">
              <div className="rounded-2xl border border-red-600/40 bg-black/60 px-4 py-3 shadow-[0_0_20px_rgba(220,38,38,0.35)]">
                <span className="text-[11px] text-amber-300">Bonus Burns Awaiting</span>
                <div className="mt-1 text-2xl font-black text-amber-100 drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]">
                  {bonusAllowance}
                </div>
              </div>
              <div className="rounded-2xl border border-red-600/40 bg-black/60 px-4 py-3 shadow-[0_0_20px_rgba(220,38,38,0.35)]">
                <span className="text-[11px] text-red-400">Active Circles</span>
                <div className="mt-1 text-2xl font-black text-red-200 drop-shadow-[0_0_12px_rgba(220,38,38,0.45)]">
                  {activeSummons.length}
                </div>
              </div>
              <div className="rounded-2xl border border-red-600/40 bg-black/60 px-4 py-3 shadow-[0_0_20px_rgba(220,38,38,0.35)]">
                <span className="text-[11px] text-red-400">Circles Touched</span>
                <div className="mt-1 text-2xl font-black text-red-200 drop-shadow-[0_0_12px_rgba(220,38,38,0.45)]">
                  {createdSummons.length + joinedSummons.length}
                </div>
              </div>
            </div>
            {bonusAllowance > 0 && (
              <div className="mt-4 flex justify-center">
                <Link
                  href="/abyss"
                  className="inline-flex items-center gap-2 rounded-full border border-amber-400 bg-amber-500/20 px-6 py-2 text-[11px] font-mono uppercase tracking-[0.4em] text-amber-100 shadow-[0_0_22px_rgba(251,191,36,0.35)] transition hover:bg-amber-500/30"
                >
                  Spend Bonus Burn
                </Link>
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-2xl border border-red-600/40 bg-black/70 p-5 shadow-[0_0_20px_rgba(220,38,38,0.3)] backdrop-blur">
              <h2 className="flex items-center justify-between text-sm font-semibold uppercase tracking-[0.35em] text-red-200">
                <span>Your Summoning Stockpile</span>
                {damnedLoading && <Loader2 className="h-4 w-4 animate-spin text-red-300" />}
              </h2>
              {damnedError ? (
                <p className="mt-3 text-[11px] text-red-400/80">{damnedError}</p>
              ) : damnedOptions.length === 0 ? (
                <p className="mt-3 text-[11px] text-red-400/70">
                  No damned ordinals detected in this wallet. Acquire one to participate.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {damnedOptions.map((option: DamnedOption) => {
                    const isActive = selectedInscriptionId === option.inscriptionId
                    const buttonClass = [
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition',
                      isActive
                        ? 'border-red-500 bg-red-900/30 shadow-[0_0_20px_rgba(220,38,38,0.35)]'
                        : 'border-red-800/40 bg-black/50 hover:border-red-500/60',
                    ].join(' ')
                    return (
                      <button
                        key={option.inscriptionId}
                        type="button"
                        onClick={() => setSelectedInscriptionId(option.inscriptionId)}
                        className={buttonClass}
                      >
                        <div className="relative h-10 w-10 overflow-hidden rounded border border-red-700/40 bg-black/40">
                          {option.image ? (
                            <Image
                              src={option.image}
                              alt={option.name ?? option.inscriptionId}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[10px] font-mono uppercase tracking-[0.3em] text-red-300">
                              NO IMG
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col">
                          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-red-200">
                            {option.name ?? option.inscriptionId.slice(0, 12)}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.3em] text-red-300/70">
                            {option.inscriptionId.slice(0, 8)}…{option.inscriptionId.slice(-8)}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-red-600/40 bg-black/70 p-5 shadow-[0_0_20px_rgba(220,38,38,0.3)] backdrop-blur">
              <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-red-200">Bonus Burns</h2>
              <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-red-300/70">
                Completing a summoning circle rewards a single bonus burn that bypasses the abyssal cap. Bonuses stack and are consumed the next time you sacrifice an ordinal while the abyss is full.
              </p>
            </section>
          </aside>

          <div className="space-y-6">
            <section className="rounded-2xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.35)] backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold uppercase tracking-[0.35em] text-red-100">
                    <Flame className="h-5 w-5 text-red-400 drop-shadow-[0_0_12px_rgba(220,38,38,0.6)]" />
                    Start a Summon
                  </h2>
                  <p className="mt-2 max-w-xl text-[11px] uppercase tracking-[0.3em] text-red-300/70">
                    Select an ordinal from your inventory and gather three allies. The circle locks when four damned commit their relics.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleCreateSummon}
                  disabled={!selectedOption || creating}
                  className="border border-red-500 bg-red-700/80 px-5 py-3 text-[11px] font-mono uppercase tracking-[0.35em] text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.35)] transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Summoning…
                    </>
                  ) : (
                    'Initiate Circle'
                  )}
                </Button>
              </div>
              {!ordinalAddress && (
                <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-red-400/70">
                  Connect your ordinal wallet to begin a summoning circle.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.35)] backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: 'active', label: 'Active Circles' },
                  { key: 'created', label: 'Circles You Founded' },
                  { key: 'joined', label: "Circles You've Joined" },
                ].map((tab) => {
                  const isActive = activeTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key as typeof activeTab)}
                      className={`rounded-full border px-4 py-2 text-[11px] font-mono uppercase tracking-[0.35em] transition ${
                        isActive
                          ? 'border-red-500 bg-red-700/80 text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.45)]'
                          : 'border-red-700/50 bg-black/40 text-red-200/80 hover:border-red-500/70'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
              <div className="mt-6 space-y-4">
                {activeTab === 'active' && (
                  <>
                    <h3 className="text-xs uppercase tracking-[0.35em] text-red-200">Active Circles</h3>
                    {hasOwnActive ? (
                      <div className="rounded-xl border border-amber-500/40 bg-amber-900/20 px-4 py-4 text-[11px] uppercase tracking-[0.3em] text-amber-200">
                        You are already leading a summoning circle. Manage or complete it under “Circles You Founded” before joining another.
                      </div>
                    ) : (
                      <SummonList
                        summons={filteredActiveSummons}
                        ordinalAddress={ordinalAddress}
                        joiningSummonId={joiningSummonId}
                        completingSummonId={completingSummonId}
                        dismissingSummonId={dismissingSummonId}
                        onJoin={handleJoinSummon}
                        onComplete={handleCompleteSummon}
                        onDismiss={handleDismissSummon}
                        truncateWallet={truncateWallet}
                        assetMap={inscriptionImageCache}
                        loading={summonsLoading}
                        now={now}
                      emptyMessage="No active circles. Initiate one or await whispers from the damned."
                      />
                    )}
                  </>
                )}
                {activeTab === 'created' && (
                  <>
                    <h3 className="text-xs uppercase tracking-[0.35em] text-red-200">Circles You Founded</h3>
                    <SummonList
                      summons={createdSummons}
                      ordinalAddress={ordinalAddress}
                      joiningSummonId={joiningSummonId}
                      completingSummonId={completingSummonId}
                      dismissingSummonId={dismissingSummonId}
                      onJoin={handleJoinSummon}
                      onComplete={handleCompleteSummon}
                      onDismiss={handleDismissSummon}
                      truncateWallet={truncateWallet}
                      assetMap={inscriptionImageCache}
                      highlightCreator
                      now={now}
                      emptyMessage="You haven&rsquo;t founded a summoning circle yet."
                    />
                  </>
                )}
                {activeTab === 'joined' && (
                  <>
                    <h3 className="text-xs uppercase tracking-[0.35em] text-red-200">Circles You&apos;ve Joined</h3>
                    <SummonList
                      summons={joinedSummons}
                      ordinalAddress={ordinalAddress}
                      joiningSummonId={joiningSummonId}
                      completingSummonId={completingSummonId}
                      dismissingSummonId={dismissingSummonId}
                      onJoin={handleJoinSummon}
                      onComplete={handleCompleteSummon}
                      onDismiss={handleDismissSummon}
                      truncateWallet={truncateWallet}
                      assetMap={inscriptionImageCache}
                      now={now}
                      emptyMessage="You have not joined a summoning circle yet."
                    />
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

function SummonList({
  summons,
  ordinalAddress,
  joiningSummonId,
  completingSummonId,
  dismissingSummonId,
  onJoin,
  onComplete,
  onDismiss,
  truncateWallet,
  assetMap,
  highlightCreator = false,
  loading = false,
  now,
  emptyMessage,
}: {
  summons: SummonRecord[]
  ordinalAddress: string
  joiningSummonId: string | null
  completingSummonId: string | null
  dismissingSummonId: string | null
  onJoin: (summon: SummonRecord) => void
  onComplete: (summon: SummonRecord) => void
  onDismiss: (summon: SummonRecord) => void
  truncateWallet: (value: string) => string
  assetMap: Record<string, string>
  highlightCreator?: boolean
  loading?: boolean
  now: number
  emptyMessage?: string
}) {
  if (loading && summons.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-red-300">
        <Loader2 className="h-4 w-4 animate-spin" /> Summoning circles stirring…
      </div>
    )
  }

  if (summons.length === 0) {
    return emptyMessage ? (
      <p className="text-[11px] uppercase tracking-[0.3em] text-red-300/70">{emptyMessage}</p>
    ) : null
  }

  return (
    <div className="space-y-4">
      {summons.map((summon) => {
        const totalSlots = Math.max(summon.requiredParticipants, 4)
        const isCreator =
          ordinalAddress.length > 0 && summon.creatorWallet?.toLowerCase() === ordinalAddress.toLowerCase()
        const isParticipant = summon.participants.some(
          (participant) => participant.wallet?.toLowerCase() === ordinalAddress.toLowerCase(),
        )
        const ready = summon.status === 'ready'
        const createdAtMs = Number.isFinite(Date.parse(summon.createdAt ?? ''))
          ? Date.parse(summon.createdAt ?? '')
          : Date.now()
        const rawExpiryMs = summon.expiresAt && Number.isFinite(Date.parse(summon.expiresAt))
          ? Date.parse(summon.expiresAt)
          : Number.NaN
        const fallbackExpiryMs = createdAtMs + SUMMON_DURATION_MS
        const targetExpiryMs = Number.isFinite(rawExpiryMs)
          ? Math.min(rawExpiryMs, fallbackExpiryMs)
          : fallbackExpiryMs
        const timeRemainingMs = targetExpiryMs - now
        const isExpired = timeRemainingMs <= 0 && ACTIVE_SUMMON_STATUSES.has(summon.status)
        const statusLabel = (isExpired ? 'expired' : summon.status).replace(/_/g, ' ')
        const completionWindowOpen = timeRemainingMs <= SUMMON_COMPLETION_WINDOW_MS
        const unlockCountdown = Math.max(0, timeRemainingMs - SUMMON_COMPLETION_WINDOW_MS)
        const containerClass = [
          'rounded-xl border px-4 py-4 transition'
        ].join(' ')

        const summaryText = `${summon.participants.length}/${totalSlots}`
        const cannotJoin =
          ordinalAddress.length === 0 ||
          !ACTIVE_SUMMON_STATUSES.has(summon.status) ||
          isParticipant ||
          joiningSummonId === summon.id ||
          isExpired ||
          summon.participants.length >= totalSlots

        return (
          <div key={summon.id} className={containerClass}>
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="mx-auto flex w-full max-w-[220px] flex-col items-center gap-3 md:mx-0">
                <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] text-red-200/80">
                  <span className="rounded-full border border-red-600/50 bg-red-900/30 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    {statusLabel}
                  </span>
                  <span>{summaryText}</span>
                  <span className={isExpired ? 'text-red-400' : 'text-amber-200'}>
                    {formatCountdown(Math.max(0, timeRemainingMs))}
                  </span>
                </div>
                <SummoningCircleGraphic
                  participants={summon.participants}
                  totalSlots={totalSlots}
                  truncateWallet={truncateWallet}
                  currentWallet={ordinalAddress}
                  isCreator={isCreator}
                  assetMap={assetMap}
                />
                <span className="text-[10px] uppercase tracking-[0.3em] text-red-300/70">
                  {truncateWallet(summon.creatorWallet)}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {summon.participants.map((participant) => {
                    const pillClass = [
                      'rounded-full border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em]',
                      participant.role === 'creator'
                        ? 'border-red-500/60 text-red-200'
                        : 'border-red-400/40 text-red-200/80',
                    ].join(' ')
                    return (
                      <span key={participant.id} className={pillClass}>
                        {participant.role === 'creator' ? 'Host' : 'Ally'} · {truncateWallet(participant.wallet)}
                      </span>
                    )
                  })}
                  {summon.participants.length < totalSlots && (
                    <span className="rounded-full border border-dashed border-red-500/40 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-red-200/70">
                      Empty Seat
                    </span>
                  )}
                </div>
                {!isExpired ? (
                  <div className="text-[10px] uppercase tracking-[0.3em] text-red-300/60">
                    Ends {new Date(targetExpiryMs).toLocaleTimeString()}
                  </div>
                ) : (
                  <div className="text-[10px] uppercase tracking-[0.3em] text-red-400">
                    Circle expired — rally a new covenant.
                  </div>
                )}
              </div>
              <div className="flex min-w-[190px] flex-col items-stretch gap-2">
                {isCreator && highlightCreator && (
                  <span className="text-[10px] uppercase tracking-[0.3em] text-amber-200">Your circle</span>
                )}
                {ready && isCreator && !isExpired ? (
                  completionWindowOpen ? (
                    <Button
                      type="button"
                      onClick={() => onComplete(summon)}
                      disabled={completingSummonId === summon.id}
                      className="border border-amber-400 bg-amber-500/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:bg-amber-500/40"
                    >
                      {completingSummonId === summon.id ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Completing…
                        </>
                      ) : (
                        'Complete Circle'
                      )}
                    </Button>
                  ) : (
                    <div className="rounded border border-amber-400/40 bg-black/50 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-amber-200">
                      Finale unlocks in {formatCountdown(unlockCountdown)}
                    </div>
                  )
                ) : isExpired ? (
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      disabled
                      className="border border-red-800/60 bg-black/60 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-300"
                    >
                      Circle Expired
                    </Button>
                    {isCreator && (
                      <Button
                        type="button"
                        onClick={() => onDismiss(summon)}
                        disabled={dismissingSummonId === summon.id}
                        className="flex items-center justify-center gap-2 border border-red-600 bg-red-800/70 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {dismissingSummonId === summon.id ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" /> Dissolving…
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-3 w-3" /> Dissolve Circle
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button
                    type="button"
                    onClick={() => onJoin(summon)}
                    disabled={cannotJoin}
                    className="border border-red-500 bg-red-700/70 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.35)] hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {joiningSummonId === summon.id ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Joining…
                      </>
                    ) : isParticipant ? (
                      'Already Joined'
                    ) : isExpired ? (
                      'Expired'
                    ) : (
                      'Join Circle'
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SummoningCircleGraphic({
  participants,
  totalSlots,
  truncateWallet,
  currentWallet,
  isCreator,
  assetMap,
}: {
  participants: SummonParticipant[]
  totalSlots: number
  truncateWallet: (value: string) => string
  currentWallet: string
  isCreator: boolean
  assetMap: Record<string, string>
}) {
  const slots = Array.from({ length: totalSlots }, (_, index) => participants[index] ?? null)

  return (
    <div className="relative mx-auto h-44 w-44">
      <div className="absolute inset-0 rounded-full border border-red-600/50 bg-[radial-gradient(circle,_rgba(220,38,38,0.25)_0%,_rgba(0,0,0,0.05)_60%,_transparent_75%)] shadow-[0_0_25px_rgba(220,38,38,0.45)]" />
      <div className="absolute inset-5 rounded-full border border-amber-500/30 blur-sm" />
      <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-500/50 bg-red-900/40 text-center text-[12px] uppercase tracking-[0.3em] text-red-200 shadow-[0_0_18px_rgba(220,38,38,0.4)]">
        <span className="flex h-full w-full items-center justify-center">
          {isCreator ? 'Host' : 'Rite'}
        </span>
      </div>
      {slots.map((participant, index) => {
        const angle = (index / totalSlots) * Math.PI * 2 - Math.PI / 2
        const radius = 38
        const left = 50 + radius * Math.cos(angle)
        const top = 50 + radius * Math.sin(angle)
        const rune = ['✶', '✷', '✸', '✹', '✺', '✻'][index % 6]

        const isSelf =
          participant?.wallet && currentWallet && participant.wallet.toLowerCase() === currentWallet.toLowerCase()

        const slotClass = [
          'absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-red-700/40 bg-black/80 shadow-[0_0_14px_rgba(220,38,38,0.35)] backdrop-blur',
          participant
            ? isSelf
              ? 'border-amber-400/70'
              : participant.role === 'creator'
              ? 'border-red-500/60'
              : 'border-red-400/40'
            : 'border-red-700/30',
        ].join(' ')

        return (
          <div
            key={`${participant?.wallet ?? 'empty'}-${index}`}
            className={slotClass}
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            {participant ? (
              <SeatAvatar participant={participant} assetMap={assetMap} />
            ) : (
              <span className="text-[12px] text-red-200/70">{rune}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SeatAvatar({ participant, assetMap }: { participant: SummonParticipant; assetMap: Record<string, string> }) {
  const { wallet, inscriptionId } = participant
  const normalized = typeof wallet === 'string' ? wallet.trim() : ''
  const placeholderText = normalized.length > 10 ? `${normalized.slice(0, 4)}…${normalized.slice(-4)}` : normalized

  if (inscriptionId) {
    const preferredImage = participant.image ?? assetMap[inscriptionId]
    const imagePath =
      preferredImage ?? `/api/ordinals/content/${encodeURIComponent(inscriptionId)}`
    return (
      <div className="relative h-9 w-9 overflow-hidden rounded-full border border-red-700/50 bg-black/70">
        <Image src={imagePath} alt={inscriptionId} fill sizes="36px" className="object-cover" />
      </div>
    )
  }

  return <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-red-200">{placeholderText}</span>
}

