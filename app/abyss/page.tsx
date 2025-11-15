'use client'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/Toast'
import { InscriptionService } from '@/services/inscription-service'
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useWallet } from '@/lib/wallet/compatibility'
import type { BaseUtxo, InscriptionUtxo } from '@/lib/sandshrew'
import { Loader2, CheckCircle, Flame, Gift, Hammer, Trophy } from 'lucide-react'

type Walker = {
  key: string
  src: string
  duration: number
  flip?: boolean
}

type FallenCharacter = {
  id: string
  src: string
  top: number
  left: number
  rotation: number
}

type Placement = {
  left: number
  top: number
  rotation: number
}

type ActiveWalker = {
  id: string
  walker: Walker
  slashTimeoutId?: number
  burstTimeoutId?: number
  plannedPlacement?: Placement
  plannedIndex?: number
  burstTriggered?: boolean
}

type DamnedOption = InscriptionUtxo & {
  inscriptionId: string
  name?: string
  image?: string
  confirmed: boolean
}

type PendingBurnRecord = {
  txId: string
  inscriptionId: string
  ordinalWallet: string
  paymentWallet: string
  status: string
  updatedAt?: string | null
  confirmedAt?: string | null
}

type CooldownState = {
  active: boolean
  remainingMs: number
  nextEligibleAt: string | null
  lastEventAt: string | null
  source: 'ordinal' | 'payment' | 'either' | null
}

type ReservedUtxoEntry = {
  outpoint: string
  kind: 'ordinal' | 'payment'
  expiresAt: number
}

type PendingBurnData = {
  records: PendingBurnRecord[]
  cooldown: CooldownState | null
}

const walkers: Walker[] = [
  { key: 'damned-1', src: '/fullguy1.png', duration: 7.4 },
  { key: 'damned-2', src: '/fullguy2.png', duration: 7.8, flip: true },
  { key: 'damned-3', src: '/fullguy3.png', duration: 7.6, flip: true },
  { key: 'damned-4', src: '/fullguys4.png', duration: 7.5 },
  { key: 'damned-5', src: '/fallguy5.png', duration: 7.3 },
  { key: 'damned-6', src: '/fallguy6.png', duration: 7.7, flip: true },
  { key: 'damned-7', src: '/fullguy7.png', duration: 7.5 },
  { key: 'damned-8', src: '/fullguy8.png', duration: 7.5 },
  { key: 'damned-9', src: '/fullguy9.png', duration: 7.4 },
  { key: 'damned-10', src: '/fullguy10.png', duration: 7.1 },
  { key: 'damned-11', src: '/fullguy11.png', duration: 7.2, flip: true  },
  { key: 'damned-12', src: '/fullguy12.png', duration: 7.7, flip: true  },
  { key: 'damned-13', src: '/fullguy13.png', duration: 7.3, flip: true  },
]

const BASE_LEFT_PERCENT = 72
const BASE_TOP_PERCENT = 110
const HORIZONTAL_JITTER_PERCENT = 20
const HORIZONTAL_JITTER_FALLOFF_STEP = 20
const HORIZONTAL_JITTER_REDUCTION = 0.8
const MIN_HORIZONTAL_JITTER_PERCENT = 1
const VERTICAL_STEP_PERCENT = 0.35
const ROTATION_VARIANCE_DEGREES = 30
const TOTAL_ABYSS_CAP = 333
const ABYSS_DISABLED = true
const ABYSS_DISABLED_MESSAGE = 'The summoning has been completed. Thank you for your efforts!'
const CAP_REDUCTION_START_UTC = Date.parse('2025-11-11T02:00:00Z')
const FULL_ABYSS_MENU_OPTIONS = [
  {
    href: '/gatesofthedamned',
    label: 'Return to the Gates',
    description: 'Witness the barricaded inferno and heed the warnings from the front lines.',
    icon: Flame,
  },
  {
    href: '/tools',
    label: 'Visit the Workshop',
    description: 'Sharpen your rituals and keep busy while the abyss cools down.',
    icon: Hammer,
  },
] as const

function FullAbyssMenu({
  totalBurns,
  onOpenLeaderboard,
}: {
  totalBurns: number
  onOpenLeaderboard: () => void
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 px-6 py-12 backdrop-blur">
      <div className="w-full max-w-4xl space-y-8 text-center">
        <div className="space-y-3">
          <h2 className="text-3xl font-black uppercase tracking-[0.5em] text-red-400 drop-shadow-[0_0_25px_rgba(220,38,38,0.65)] md:text-5xl">
            The Abyss is Full
          </h2>
          <p className="text-sm uppercase tracking-[0.4em] text-red-200 md:text-base">
            Stop throwing your trash in here!
          </p>
          <p className="text-xs uppercase tracking-[0.35em] text-red-300/80">
            {totalBurns} sacrifices sealed beyond redemption.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <button
            onClick={onOpenLeaderboard}
            className="group relative overflow-hidden rounded-2xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.35)] transition duration-300 hover:-translate-y-1 hover:border-red-400"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-700/0 via-red-600/5 to-red-700/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative flex flex-col items-center gap-3 text-center">
              <Trophy className="h-10 w-10 text-red-400 drop-shadow-[0_0_20px_rgba(220,38,38,0.6)]" />
              <span className="text-lg font-semibold uppercase tracking-[0.35em] text-red-100">Leaderboard</span>
              <span className="text-sm text-red-200/75">Revel in the souls who already crossed the threshold.</span>
            </div>
          </button>
          {FULL_ABYSS_MENU_OPTIONS.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group relative overflow-hidden rounded-2xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.35)] transition duration-300 hover:-translate-y-1 hover:border-red-400"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-700/0 via-red-600/5 to-red-700/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex flex-col items-center gap-3 text-center">
                <Icon className="h-10 w-10 text-red-400 drop-shadow-[0_0_20px_rgba(220,38,38,0.6)]" />
                <span className="text-lg font-semibold uppercase tracking-[0.35em] text-red-100">{label}</span>
                <span className="text-sm text-red-200/75">{description}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
const BURN_STATUS_CHECK_INTERVAL_MS = 20_000
const BURN_COOLDOWN_MS = 30 * 60 * 1_000
const RESERVED_STORAGE_KEY = 'abyss-reserved-utxos'

const AVERAGE_TAPROOT_INPUT_VBYTES = 58
const AVERAGE_OUTPUT_VBYTES = 43
const TX_OVERHEAD_VBYTES = 10

function estimateVsize(inputCount: number, outputCount: number) {
  return inputCount * AVERAGE_TAPROOT_INPUT_VBYTES + outputCount * AVERAGE_OUTPUT_VBYTES + TX_OVERHEAD_VBYTES
}

const FEE_RATE_SAT_VB = 1
const FEE_BUFFER_SATS = 6
const DUST_THRESHOLD = 546
const MIN_PAYMENT_INPUT_SATS = 1100
const BURN_INPUT_COUNT = 2
const BURN_OUTPUT_COUNT = 2
const BURN_TX_VSIZE = estimateVsize(BURN_INPUT_COUNT, BURN_OUTPUT_COUNT)
const MIN_FEE_SATS = Math.ceil(BURN_TX_VSIZE * FEE_RATE_SAT_VB) + FEE_BUFFER_SATS

function readReservedUtxos(): ReservedUtxoEntry[] {
  if (typeof window === 'undefined') {
    return []
  }

  const raw = window.localStorage.getItem(RESERVED_STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null
        }
        const outpoint = typeof entry.outpoint === 'string' ? entry.outpoint : ''
        const kind = entry.kind === 'ordinal' || entry.kind === 'payment' ? entry.kind : null
        const expiresAt = typeof entry.expiresAt === 'number' ? entry.expiresAt : Number(entry.expiresAt ?? 0)
        if (!outpoint || !kind || !Number.isFinite(expiresAt)) {
          return null
        }
        return { outpoint, kind, expiresAt } satisfies ReservedUtxoEntry
      })
      .filter((entry): entry is ReservedUtxoEntry => Boolean(entry))
  } catch (error) {
    console.warn('Failed to parse reserved abyss UTXOs from storage:', error)
    window.localStorage.removeItem(RESERVED_STORAGE_KEY)
    return []
  }
}

function writeReservedUtxos(entries: ReservedUtxoEntry[]) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(RESERVED_STORAGE_KEY, JSON.stringify(entries))
  } catch (error) {
    console.warn('Failed to persist reserved abyss UTXOs to storage:', error)
  }
}

function pruneReservedUtxos(entries: ReservedUtxoEntry[], now: number): ReservedUtxoEntry[] {
  return entries.filter((entry) => entry.expiresAt > now)
}

function reserveUtxo(outpoint: string, kind: ReservedUtxoEntry['kind'], durationMs = BURN_COOLDOWN_MS) {
  if (typeof window === 'undefined' || !outpoint) {
    return
  }

  const now = Date.now()
  const expiresAt = now + durationMs
  const existing = pruneReservedUtxos(readReservedUtxos(), now).filter(
    (entry) => !(entry.outpoint === outpoint && entry.kind === kind),
  )
  existing.push({ outpoint, kind, expiresAt })
  writeReservedUtxos(existing)
}

function isUtxoReserved(outpoint: string, kind: ReservedUtxoEntry['kind'], now = Date.now()): boolean {
  if (!outpoint) {
    return false
  }
  const entries = pruneReservedUtxos(readReservedUtxos(), now)
  if (entries.length === 0) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(RESERVED_STORAGE_KEY)
    }
    return false
  }
  writeReservedUtxos(entries)
  return entries.some((entry) => entry.outpoint === outpoint && entry.kind === kind)
}

function getReservedUtxoSet(kind: ReservedUtxoEntry['kind'], now = Date.now()): Set<string> {
  const pruned = pruneReservedUtxos(readReservedUtxos(), now)
  if (typeof window !== 'undefined') {
    if (pruned.length === 0) {
      window.localStorage.removeItem(RESERVED_STORAGE_KEY)
    } else {
      writeReservedUtxos(pruned)
    }
  }
  return new Set(pruned.filter((entry) => entry.kind === kind).map((entry) => entry.outpoint))
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function AbyssContent() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const slashAudioRef = useRef<HTMLAudioElement>(null)
  const [showEntryModal, setShowEntryModal] = useState(true)
  const [volume, setVolume] = useState(25)
  const [isMuted, setIsMuted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [fallenPile, setFallenPile] = useState<FallenCharacter[]>([])
  const [activeWalkers, setActiveWalkers] = useState<ActiveWalker[]>([])
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [burnConfirmOpen, setBurnConfirmOpen] = useState(false)
  const audioSrc = '/music/abyss.mp3'
  const fallenPileRef = useRef(0)

  const searchParams = useSearchParams()
  const bypassDisabled = searchParams?.get('bygas') === '1'
  const [burnWindowActive, setBurnWindowActive] = useState(false)
  const [burnWindowExpiresAt, setBurnWindowExpiresAt] = useState<string | null>(null)
  
  // Check for active burn window
  useEffect(() => {
    async function checkBurnWindow() {
      try {
        const response = await fetch('/api/abyss/burn-window', {
          headers: { 'Cache-Control': 'no-store' },
        })
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setBurnWindowActive(data.active)
            setBurnWindowExpiresAt(data.expiresAt)
          }
        }
      } catch (error) {
        console.error('Failed to check burn window', error)
      }
    }
    checkBurnWindow()
    const interval = setInterval(checkBurnWindow, 10000) // Check every 10 seconds
    return () => clearInterval(interval)
  }, [])
  
  const abyssDisabled = ABYSS_DISABLED && !bypassDisabled && !burnWindowActive

  const calculatePlacement = useCallback((index: number): Placement => {
    const jitterReduction = Math.floor(index / HORIZONTAL_JITTER_FALLOFF_STEP) * HORIZONTAL_JITTER_REDUCTION
    const jitter = Math.max(MIN_HORIZONTAL_JITTER_PERCENT, HORIZONTAL_JITTER_PERCENT - jitterReduction)
    const left = BASE_LEFT_PERCENT + (Math.random() * 2 - 1) * jitter
    const top = BASE_TOP_PERCENT - index * VERTICAL_STEP_PERCENT
    const rotation = 84 + (Math.random() * 2 - 1) * ROTATION_VARIANCE_DEGREES
    return { left, top, rotation }
  }, [])

  const wallet = useWallet()
  const laserEyes = useLaserEyes() as Partial<{ paymentAddress: string; paymentPublicKey: string; publicKey: string }>
  const toast = useToast()
  const ordinalAddress = wallet.currentAddress?.trim() || ''

  const [damnedOptions, setDamnedOptions] = useState<DamnedOption[]>([])
  const [damnedLoading, setDamnedLoading] = useState(false)
  const [damnedError, setDamnedError] = useState<string | null>(null)
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [burnSummary, setBurnSummary] = useState<{ confirmed: number; total: number } | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [selectedInscriptionId, setSelectedInscriptionId] = useState<string | null>(null)
  const [paymentOptions, setPaymentOptions] = useState<BaseUtxo[]>([])
  const [selectedPaymentOutpoint, setSelectedPaymentOutpoint] = useState<string | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentScanInitiated, setPaymentScanInitiated] = useState(false)
  const [changeAddress, setChangeAddress] = useState('')
  const changeAddressRef = useRef('')
  const [burning, setBurning] = useState(false)
  const [burnError, setBurnError] = useState<string | null>(null)
  const [burnTxid, setBurnTxid] = useState<string | null>(null)
  const [pendingBurnRecords, setPendingBurnRecords] = useState<PendingBurnRecord[]>([])
  const [cooldownState, setCooldownState] = useState<CooldownState | null>(null)
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [leaderboard, setLeaderboard] = useState<
    Array<{ ordinalWallet: string; paymentWallet: string; total: number; confirmed: number }>
  >([])
  const [capDriftTimestamp, setCapDriftTimestamp] = useState(() => Date.now())
  const [bonusAllowance, setBonusAllowance] = useState(0)

  const summarizeOrdinal = useCallback((address: string) => {
    if (!address) return '—'
    const trimmed = address.trim()
    return trimmed.length <= 5 ? trimmed : trimmed.slice(-5)
  }, [])
  const selectedInscription = useMemo(
    () => damnedOptions.find((option) => option.inscriptionId === selectedInscriptionId) ?? null,
    [damnedOptions, selectedInscriptionId],
  )
  const selectedPayment = useMemo(
    () => paymentOptions.find((option) => option.outpoint === selectedPaymentOutpoint) ?? null,
    [paymentOptions, selectedPaymentOutpoint],
  )
  const burnStatusIntervalsRef = useRef<Map<string, number>>(new Map())
  const pendingFetchKeyRef = useRef<string | null>(null)
  const summaryPrefetchRef = useRef(false)

  const stopPollingTx = useCallback((txId: string) => {
    const normalized = txId.trim()
    if (!normalized) return
    const existing = burnStatusIntervalsRef.current.get(normalized)
    if (existing !== undefined) {
      window.clearInterval(existing)
      burnStatusIntervalsRef.current.delete(normalized)
    }
  }, [])

  const clearAllBurnPolling = useCallback(() => {
    burnStatusIntervalsRef.current.forEach((intervalId) => {
      window.clearInterval(intervalId)
    })
    burnStatusIntervalsRef.current.clear()
  }, [])

  useEffect(() => {
    changeAddressRef.current = changeAddress.trim()
  }, [changeAddress])

  useEffect(() => {
    const updateTimestamp = () => setCapDriftTimestamp(Date.now())
    const intervalId = window.setInterval(updateTimestamp, 60_000)
    updateTimestamp()
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const next = laserEyes.paymentAddress?.trim()
    if (next && !changeAddress) {
      setChangeAddress(next)
    }
  }, [laserEyes.paymentAddress, changeAddress])

  const handleHolderVerified = useCallback((holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }, [])

  const handleVerifyingStart = useCallback(() => {
    setIsVerifying(true)
  }, [])

  const handleConnectedChange = useCallback(
    (connected: boolean) => {
      setIsWalletConnected(connected)
      if (!connected) {
        setIsHolder(undefined)
        setIsVerifying(false)
        setDamnedOptions([])
        setPaymentOptions([])
        setSelectedInscriptionId(null)
        setSelectedPaymentOutpoint(null)
        setPaymentError(null)
        setAssetsLoaded(false)
        setPaymentScanInitiated(false)
        setPaymentLoading(false)
        setPendingBurnRecords([])
        setCooldownState(null)
        setCooldownRemainingMs(0)
        clearAllBurnPolling()
        setBurnConfirmOpen(false)
        setBonusAllowance(0)
      }
    },
    [clearAllBurnPolling],
  )

  const fetchBurnSummary = useCallback(async () => {
    try {
      const response = await fetch('/api/abyss/burns', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Summary request failed (${response.status})`)
      }
      const data = await response.json().catch(() => null)
      if (data?.summary) {
        setBurnSummary({
          confirmed: Number(data.summary.confirmed ?? 0),
          total: Number(data.summary.total ?? 0),
        })
      }
      if (Array.isArray(data?.leaderboard)) {
        const parsed = (data.leaderboard as Array<Record<string, unknown>>)
          .map((entry) => ({
            ordinalWallet: (entry?.ordinalWallet ?? '').toString(),
            paymentWallet: (entry?.paymentWallet ?? '').toString(),
            total: Number(entry?.total ?? 0),
            confirmed: Number(entry?.confirmed ?? 0),
            key: `${(entry?.ordinalWallet ?? '').toString()}|${(entry?.paymentWallet ?? '').toString()}`,
          }))
          .filter((entry) => entry.total > 0)
        parsed.sort((a, b) => {
          if (b.confirmed !== a.confirmed) return b.confirmed - a.confirmed
          return b.total - a.total
        })
        setLeaderboard(
          parsed.map(({ ordinalWallet, paymentWallet, total, confirmed }) => ({
            ordinalWallet,
            paymentWallet,
            total,
            confirmed,
          })),
        )
      } else {
        setLeaderboard([])
      }
    } catch (error) {
      console.error('Failed to fetch abyss burn summary:', error)
    }
  }, [])

  const fetchPendingBurnRecords = useCallback(async (): Promise<PendingBurnData> => {
    const ordinalWallet = ordinalAddress
    const paymentWalletCandidate =
      changeAddressRef.current?.trim() || laserEyes.paymentAddress?.trim() || ''

    if (!ordinalWallet && !paymentWalletCandidate) {
      return { records: [], cooldown: null }
    }

    const params = new URLSearchParams()
    params.set('includePending', 'true')
    params.set('includeCooldown', 'true')
    params.set('includeLeaderboard', 'true')
    if (ordinalWallet) {
      params.set('ordinalWallet', ordinalWallet)
    }
    if (paymentWalletCandidate) {
      params.set('paymentWallet', paymentWalletCandidate)
    }

    try {
      const response = await fetch(`/api/abyss/burns?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        if (response.status === 400) {
          return { records: [], cooldown: null }
        }
        throw new Error(`Pending burns request failed (${response.status})`)
      }

      const data = await response.json().catch(() => null)
      if (data?.summary) {
        setBurnSummary({
          confirmed: Number(data.summary.confirmed ?? 0),
          total: Number(data.summary.total ?? 0),
        })
      }
      if (Array.isArray(data?.leaderboard)) {
        const parsedLeaderboard = (data.leaderboard as Array<Record<string, unknown>>)
          .map((entry) => ({
            ordinalWallet: (entry?.ordinalWallet ?? entry?.ordinal_wallet ?? '').toString(),
            paymentWallet: (entry?.paymentWallet ?? entry?.payment_wallet ?? '').toString(),
            total: Number(entry?.total ?? 0),
            confirmed: Number(entry?.confirmed ?? 0),
          }))
          .filter((entry) => entry.total > 0)

        parsedLeaderboard.sort((a, b) => {
          if (b.confirmed !== a.confirmed) return b.confirmed - a.confirmed
          return b.total - a.total
        })

        setLeaderboard(parsedLeaderboard)
      }

      if (typeof data?.bonusAllowance === 'number') {
        setBonusAllowance(Number(data.bonusAllowance))
      }

      const pending = Array.isArray(data?.pending) ? data.pending : []

      const normalized = pending
        .map((entry: Record<string, unknown>) => {
          const txId = (entry?.txId ?? entry?.tx_id ?? '').toString().trim()
          const inscriptionId = (entry?.inscriptionId ?? entry?.inscription_id ?? '').toString().trim()
          if (!txId || !inscriptionId) {
            return null
          }

          return {
            txId,
            inscriptionId,
            ordinalWallet: (entry?.ordinalWallet ?? entry?.ordinal_wallet ?? '').toString(),
            paymentWallet: (entry?.paymentWallet ?? entry?.payment_wallet ?? '').toString(),
            status: (entry?.status ?? 'pending').toString(),
            updatedAt: (entry?.updatedAt ?? entry?.updated_at ?? null) as string | null | undefined,
            confirmedAt: (entry?.confirmedAt ?? entry?.confirmed_at ?? null) as string | null | undefined,
          } satisfies PendingBurnRecord
        })
        .filter((entry: PendingBurnRecord | null): entry is PendingBurnRecord => Boolean(entry))

      let cooldown: CooldownState | null = null
      if (data?.cooldown && typeof data.cooldown === 'object') {
        const rawRemaining = Number((data.cooldown as Record<string, unknown>)?.remainingMs ?? 0)
        const remainingMs = Number.isFinite(rawRemaining) ? rawRemaining : 0
        const active = remainingMs > 0 || Boolean((data.cooldown as Record<string, unknown>)?.active)
        cooldown = {
          active,
          remainingMs: active ? remainingMs : Math.max(0, remainingMs),
          nextEligibleAt:
            typeof (data.cooldown as Record<string, unknown>)?.nextEligibleAt === 'string'
              ? ((data.cooldown as Record<string, unknown>).nextEligibleAt as string)
              : null,
          lastEventAt:
            typeof (data.cooldown as Record<string, unknown>)?.lastEventAt === 'string'
              ? ((data.cooldown as Record<string, unknown>).lastEventAt as string)
              : null,
          source:
            (data.cooldown as Record<string, unknown>)?.source === 'ordinal' ||
            (data.cooldown as Record<string, unknown>)?.source === 'payment' ||
            (data.cooldown as Record<string, unknown>)?.source === 'either'
              ? ((data.cooldown as Record<string, unknown>).source as CooldownState['source'])
              : null,
        }
      }

      return { records: normalized, cooldown }
    } catch (error) {
      console.error('Failed to fetch pending abyss burns:', error)
      return { records: [], cooldown: null }
    }
  }, [ordinalAddress, laserEyes.paymentAddress])

  const loadDamnedOptions = useCallback(async () => {
    if (!ordinalAddress) return
    setDamnedLoading(true)  
    setDamnedError(null)
    setAssetsLoaded(false)
    try {
      const reservedOrdinalSet = getReservedUtxoSet('ordinal')
      const tokensRes = await fetch(
        `/api/magic-eden?ownerAddress=${encodeURIComponent(ordinalAddress)}&collectionSymbol=the-damned&fetchAll=true`,
        { headers: { Accept: 'application/json' } },
      )

      if (!tokensRes.ok) {
        const errorText = await tokensRes.text()
        throw new Error(errorText || 'Failed to load ordinals from Magic Eden')
      }

      const tokensPayload = await tokensRes.json().catch(() => ({ tokens: [] }))
      const rawTokenList =
        Array.isArray(tokensPayload?.tokens) ? tokensPayload.tokens : Array.isArray(tokensPayload) ? tokensPayload : []

      const filteredOptions: DamnedOption[] = []
      for (const token of rawTokenList as Array<Record<string, any>>) {
        const inscriptionId = (token?.id || token?.inscriptionId)?.toString().trim()
        if (!inscriptionId) continue

        const blockHeight = Number(token?.locationBlockHeight ?? token?.genesisTransactionBlockHeight ?? 0)

        const rawOutput = typeof token?.output === 'string' && token.output.includes(':')
          ? token.output
          : typeof token?.location === 'string' && token.location.includes(':')
            ? token.location.split(':').slice(0, 2).join(':')
            : undefined
        if (!rawOutput) continue

        const [txid, voutStr] = rawOutput.split(':')
        const vout = Number.parseInt(voutStr ?? '0', 10)
        if (!txid || Number.isNaN(vout)) continue

        const outpoint = `${txid}:${vout}`
        if (reservedOrdinalSet.has(outpoint)) {
          continue
        }

        const outputValue = Number(token?.outputValue ?? 0)
        if (!Number.isFinite(outputValue) || outputValue <= 0) continue

        const contentType = typeof token?.contentType === 'string' ? token.contentType.toLowerCase() : ''
        const isImage = contentType.startsWith('image/')
        const imageUrl = isImage
          ? token?.contentURI ?? token?.contentPreviewURI ?? token?.meta?.image ?? undefined
          : token?.contentPreviewURI ?? token?.contentURI ?? token?.meta?.image ?? undefined

        filteredOptions.push({
          outpoint,
          txid,
          vout,
          value: outputValue,
          height: blockHeight > 0 ? blockHeight : null,
          inscriptions: [inscriptionId],
          inscriptionId,
          name: token?.meta?.name ?? token?.displayName ?? undefined,
          image: imageUrl,
          confirmed: false,
        })
      }

      const txids = Array.from(new Set(filteredOptions.map((option) => option.txid)))
      if (txids.length > 0) {
        const statusResults = await Promise.allSettled(
          txids.map((txid) =>
            fetch(`https://mempool.space/api/tx/${txid}`)
              .then((res) => (res.ok ? res.json() : Promise.reject()))
              .then((data) => ({
                txid,
                confirmed: data?.status?.confirmed === true,
              })),
          ),
        )
        const statusMap = new Map<string, boolean>()
        for (const result of statusResults) {
          if (result.status === 'fulfilled') {
            statusMap.set(result.value.txid, result.value.confirmed)
          }
        }
        filteredOptions.forEach((option) => {
          const confirmed =
            statusMap.has(option.txid) ? statusMap.get(option.txid)! : option.height !== null && option.height > 0
          option.confirmed = confirmed
          if (!confirmed) {
            option.height = null
          }
        })
      }

      const pendingInscriptionIds =
        pendingBurnRecords.length > 0
          ? new Set(pendingBurnRecords.map((record) => record.inscriptionId))
          : null
      if (pendingInscriptionIds && pendingInscriptionIds.size > 0) {
        filteredOptions.forEach((option) => {
          if (pendingInscriptionIds.has(option.inscriptionId)) {
            option.confirmed = false
          }
        })
      }

      filteredOptions.sort((a, b) => {
        if (a.confirmed === b.confirmed) {
          return (a.name ?? a.inscriptionId).localeCompare(b.name ?? b.inscriptionId)
        }
        return a.confirmed ? -1 : 1
      })

      setDamnedOptions(filteredOptions)
      const firstConfirmed = filteredOptions.find((option) => option.confirmed)
      if (firstConfirmed) {
        setDamnedError(null)
        setSelectedInscriptionId((prev) => {
          if (prev && filteredOptions.some((entry) => entry.inscriptionId === prev && entry.confirmed)) {
            return prev
          }
          return firstConfirmed.inscriptionId
        })
      } else {
        setDamnedError('No confirmed ordinals available.')
        setSelectedInscriptionId(null)
      }

      setDamnedLoading(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load abyss assets'
      setDamnedOptions([])
      setDamnedError(message)
      toast.error(message)
    } finally {
      setDamnedLoading(false)
      setAssetsLoaded(true)
    }
  }, [ordinalAddress, toast, pendingBurnRecords])

  const loadPaymentAssets = useCallback(async () => {
    setPaymentScanInitiated(true)
    const paymentAddress = laserEyes.paymentAddress?.trim() || changeAddressRef.current || ''
    if (!paymentAddress) {
      setPaymentError('No payment wallet connected.')
      setPaymentOptions([])
      setSelectedPaymentOutpoint(null)
      return
    }

    setPaymentLoading(true)
    setPaymentError(null)
    try {
      const reservedPaymentSet = getReservedUtxoSet('payment')
      const paymentRes = await fetch('/api/wallet/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: paymentAddress }),
      })

      const paymentJson = await paymentRes.json()
      if (!paymentRes.ok || !paymentJson.success) {
        throw new Error(paymentJson.error || 'Failed to load payment wallet assets')
      }

      const spendableSource = ((paymentJson.data?.spendable ?? []) as BaseUtxo[])
        .map((entry) => ({ ...entry }))
        .filter((entry) => entry.height !== null && !reservedPaymentSet.has(entry.outpoint))
      const spendable = spendableSource.filter((entry) => entry.value > MIN_PAYMENT_INPUT_SATS)
      const sortedSpendable = [...spendable].sort((a, b) => a.value - b.value)

      if (sortedSpendable.length === 0) {
        setPaymentOptions([])
        setSelectedPaymentOutpoint(null)
        setPaymentError('No confirmed payment UTXO available.')
      } else {
        setPaymentOptions(sortedSpendable)
        setSelectedPaymentOutpoint((prev) => {
          if (prev && sortedSpendable.some((entry) => entry.outpoint === prev)) {
            return prev
          }
          const suitable = sortedSpendable.find((entry) => entry.value - MIN_FEE_SATS > DUST_THRESHOLD)
          return suitable?.outpoint ?? sortedSpendable[0].outpoint
        })
        setPaymentError(null)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load payment wallet assets'
      setPaymentOptions([])
      setSelectedPaymentOutpoint(null)
      setPaymentError(message)
      toast.error(message)
    } finally {
      setPaymentLoading(false)
    }
  }, [laserEyes.paymentAddress, toast])

  const pollBurnStatus = useCallback(
    (txId: string) => {
      const normalized = txId.trim()
      if (!normalized) return

      const checkStatus = async () => {
        try {
          const response = await fetch('/api/abyss/burns/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txId: normalized }),
          })

          if (!response.ok) {
            if (response.status === 404) {
              stopPollingTx(normalized)
              setPendingBurnRecords((prev) => prev.filter((record) => record.txId !== normalized))
            }
            return
          }

          const data = await response.json().catch(() => null)
          if (data?.summary) {
            setBurnSummary({
              confirmed: Number(data.summary.confirmed ?? 0),
              total: Number(data.summary.total ?? 0),
            })
          }

          if (data?.record) {
            setPendingBurnRecords((prev) => {
              if (prev.length === 0) {
                return prev
              }
              let mutated = false
              const next = prev.map((record) => {
                if (record.txId !== normalized) {
                  return record
                }
                mutated = true
                return {
                  ...record,
                  status: (data.record.status ?? record.status) as string,
                  updatedAt: (data.record.updatedAt ?? data.record.updated_at ?? record.updatedAt) as
                    | string
                    | null
                    | undefined,
                  confirmedAt: (data.record.confirmedAt ?? data.record.confirmed_at ?? record.confirmedAt) as
                    | string
                    | null
                    | undefined,
                }
              })
              return mutated ? next : prev
            })
          }

          if (data?.confirmed) {
            stopPollingTx(normalized)
            setPendingBurnRecords((prev) => prev.filter((record) => record.txId !== normalized))
            await loadDamnedOptions()
          }
        } catch (error) {
          console.error('Failed to check burn status:', error)
        }
      }

      void checkStatus()
      const existingInterval = burnStatusIntervalsRef.current.get(normalized)
      if (existingInterval !== undefined) {
        window.clearInterval(existingInterval)
      }
      const intervalId = window.setInterval(() => {
        void checkStatus()
      }, BURN_STATUS_CHECK_INTERVAL_MS)
      burnStatusIntervalsRef.current.set(normalized, intervalId)
    },
    [loadDamnedOptions, stopPollingTx],
  )

  useEffect(() => {
    if (isHolder && isWalletConnected && ordinalAddress) {
      void loadDamnedOptions()
    }
  }, [isHolder, isWalletConnected, ordinalAddress, loadDamnedOptions])

  useEffect(() => {
    if (isWalletConnected) {
      summaryPrefetchRef.current = false
      return
    }
    if (summaryPrefetchRef.current) {
      return
    }
    summaryPrefetchRef.current = true
    void fetchBurnSummary()
  }, [isWalletConnected, fetchBurnSummary])

  const updatePendingData = useCallback(async () => {
    const { records, cooldown } = await fetchPendingBurnRecords()
    setPendingBurnRecords(records)
    setCooldownState(cooldown)
    setCooldownRemainingMs(Math.max(0, cooldown?.remainingMs ?? 0))
  }, [fetchPendingBurnRecords])

  useEffect(() => {
    if (!isWalletConnected) {
      pendingFetchKeyRef.current = null
      return
    }

    const normalizedOrdinal = ordinalAddress.trim().toLowerCase()
    const normalizedPayment =
      (changeAddressRef.current?.trim() || laserEyes.paymentAddress?.trim() || '').toLowerCase()
    const fetchKey = `${normalizedOrdinal}|${normalizedPayment}`

    if (pendingFetchKeyRef.current === fetchKey) {
      return
    }
    pendingFetchKeyRef.current = fetchKey

    if (!normalizedOrdinal && !normalizedPayment) {
      if (!summaryPrefetchRef.current) {
        summaryPrefetchRef.current = true
        void fetchBurnSummary()
      }
      return
    }

    let cancelled = false
    const syncPending = async () => {
      const { records, cooldown } = await fetchPendingBurnRecords()
      if (!cancelled) {
        setPendingBurnRecords(records)
        setCooldownState(cooldown)
        setCooldownRemainingMs(Math.max(0, cooldown?.remainingMs ?? 0))
      }
    }

    void syncPending()

    return () => {
      cancelled = true
    }
  }, [
    isWalletConnected,
    ordinalAddress,
    changeAddress,
    laserEyes.paymentAddress,
    fetchPendingBurnRecords,
    fetchBurnSummary,
  ])

  useEffect(() => {
    if (pendingBurnRecords.length === 0) {
      if (burnStatusIntervalsRef.current.size > 0) {
        clearAllBurnPolling()
      }
      return
    }

    const pendingSet = new Set<string>()
    for (const record of pendingBurnRecords) {
      const txId = record.txId?.trim()
      if (!txId) continue
      pendingSet.add(txId)
      if (!burnStatusIntervalsRef.current.has(txId)) {
        pollBurnStatus(txId)
      }
    }

    for (const tracked of Array.from(burnStatusIntervalsRef.current.keys())) {
      if (!pendingSet.has(tracked)) {
        stopPollingTx(tracked)
      }
    }
  }, [pendingBurnRecords, pollBurnStatus, stopPollingTx, clearAllBurnPolling])

  useEffect(() => {
    if (pendingBurnRecords.length === 0) {
      return
    }

    setDamnedOptions((prev) => {
      if (prev.length === 0) {
        return prev
      }

      const pendingSet = new Set(pendingBurnRecords.map((record) => record.inscriptionId))
      if (pendingSet.size === 0) {
        return prev
      }

      let mutated = false
      const next = prev.map((option) => {
        if (pendingSet.has(option.inscriptionId) && option.confirmed) {
          mutated = true
          return { ...option, confirmed: false }
        }
        return option
      })

      return mutated ? next : prev
    })
  }, [pendingBurnRecords])

  useEffect(() => {
    return () => {
      clearAllBurnPolling()
    }
  }, [clearAllBurnPolling])

  useEffect(() => {
    if (!cooldownState?.active) {
      setCooldownRemainingMs(0)
      return
    }

    const target = cooldownState.nextEligibleAt ? new Date(cooldownState.nextEligibleAt).getTime() : NaN
    const initialRemaining = Number.isFinite(target) ? Math.max(0, target - Date.now()) : cooldownState.remainingMs
    setCooldownRemainingMs(Math.max(0, initialRemaining))

    const update = () => {
      if (!cooldownState?.active) {
        setCooldownRemainingMs(0)
        return
      }
      const base = Number.isFinite(target) ? target : Date.now() + cooldownState.remainingMs
      const remaining = Math.max(0, base - Date.now())
      setCooldownRemainingMs(remaining)
      if (remaining === 0) {
        setCooldownState((prev) => (prev ? { ...prev, active: false, remainingMs: 0 } : prev))
      }
    }

    const intervalId = window.setInterval(update, 1_000)
    return () => window.clearInterval(intervalId)
  }, [cooldownState])

  const handleEnter = () => {
    setShowEntryModal(false)
    setTimeout(() => {
      if (audioRef.current) {
        if (audioRef.current.readyState === 0) {
          audioRef.current.load()
        }

        const playAudio = () => {
          audioRef.current
            ?.play()
            .then(() => setIsPlaying(true))
            .catch((error) => {
              console.error('Audio playback failed:', error)
              setTimeout(() => {
                audioRef.current
                  ?.play()
                  .then(() => setIsPlaying(true))
                  .catch((err) => console.error('Retry audio playback failed:', err))
              }, 400)
            })
        }

        if (audioRef.current.readyState >= 2) {
          playAudio()
        } else {
          audioRef.current.addEventListener('canplay', playAudio, { once: true })
        }
      }
    }, 120)
  }

  useEffect(() => {
    if (!audioRef.current) return
    const audio = audioRef.current
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [])

  useEffect(() => {
    const main = audioRef.current
    const slash = slashAudioRef.current
    const level = isMuted ? 0 : volume / 100
    if (main) {
      main.volume = level
    }
    if (slash) {
      slash.volume = level
    }
  }, [volume, isMuted])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let isMobile = window.innerWidth < 768
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      isMobile = window.innerWidth < 768
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    class Particle {
      x: number
      y: number
      vx: number
      vy: number
      life: number
      maxLife: number
      color: string
      size: number

      constructor(canvasWidth: number, canvasHeight: number, options?: { x?: number; y?: number; burst?: boolean }) {
        const isBurst = Boolean(options?.burst)
        this.x = options?.x ?? Math.random() * canvasWidth
        const defaultGroundY = canvasHeight + 8
        this.y = options?.y ?? defaultGroundY
        if (isBurst) {
          const angle = (Math.random() - 0.5) * (Math.PI / 4)
          const speed = Math.random() * 5 + 9
          this.vx = Math.sin(angle) * speed * 0.25
          this.vy = -Math.abs(Math.cos(angle) * speed)
          this.maxLife = Math.random() * 35 + 45
        } else {
          this.vx = (Math.random() - 0.5) * 2
          this.vy = -Math.random() * 6 - 3
          this.maxLife = Math.random() * 100 + 60
        }
        this.life = 0
        this.size = isBurst ? Math.random() * 1.4 + 0.8 : Math.random() * 1.4 + 0.6

        const colors = [
          'rgba(255, 120, 0, ',
          'rgba(255, 160, 0, ',
          'rgba(255, 200, 40, ',
          'rgba(255, 255, 120, ',
          'rgba(255, 80, 0, ',
        ]
        this.color = colors[Math.floor(Math.random() * colors.length)]
      }

      update() {
        this.x += this.vx
        this.y += this.vy
        this.life++
        this.vy *= 0.98
        this.vx *= 0.7
      }

      draw(context: CanvasRenderingContext2D) {
        const opacity = Math.max(0, 1 - this.life / this.maxLife)
        context.fillStyle = this.color + opacity + ')'
        context.beginPath()
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        context.fill()
      }

      isDead() {
        return this.life >= this.maxLife
      }
    }

    const particles: Particle[] = []
    const maxParticles = 520

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (particles.length < maxParticles) {
        for (let i = 0; i < 10; i++) {
          particles.push(new Particle(canvas.width, canvas.height))
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update()
        particles[i].draw(ctx)

        if (particles[i].isDead()) {
          particles.splice(i, 1)
        }
      }

      requestAnimationFrame(animate)
    }

    animate()

    const emitBurst = (options?: { leftPercent?: number; topPercent?: number; axisLeftPercent?: number }) => {
      const requestedLeft = options?.leftPercent ?? BASE_LEFT_PERCENT
      const axisLeftPercent = options?.axisLeftPercent ?? BASE_LEFT_PERCENT
      const originTopPercent = options?.topPercent ?? BASE_TOP_PERCENT
      const axisCenterX = (axisLeftPercent / 100) * canvas.width
      const driftOffsetPx = ((requestedLeft - axisLeftPercent) / 100) * canvas.width
      const targetCenterX = axisCenterX + driftOffsetPx * 0.35
      const rawOriginY = (originTopPercent / 100) * canvas.height
      const mobileOffset = Math.max(28, Math.min(48, canvas.height * 0.05))
      const desktopOffset = Math.max(48, Math.min(80, canvas.height * 0.08))
      const burstGround = canvas.height - (isMobile ? mobileOffset : desktopOffset)
      const verticalSpread = Math.max(canvas.height * 0.06, 60)
      const baseBurstY = Math.min(rawOriginY + verticalSpread * 0.25, burstGround)
      const horizontalSpread = Math.max(canvas.width * 0.085, 90)
      const burstCount = 200
      for (let i = 0; i < burstCount; i++) {
        particles.push(
          new Particle(canvas.width, canvas.height, {
            x: targetCenterX + (Math.random() - 0.5) * horizontalSpread,
            y: baseBurstY - Math.random() * verticalSpread,
            burst: true,
          }),
        )
      }
    }

    emitBurstRef.current = emitBurst

    return () => {
      emitBurstRef.current = undefined
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  const emitBurstRef = useRef<
    (options?: { leftPercent?: number; topPercent?: number; axisLeftPercent?: number }) => void
  >()

  const playSlash = useCallback(() => {
    const slash = slashAudioRef.current
    if (slash) {
      if (slash.readyState === 0) {
        slash.load()
      }
      slash.currentTime = 0
      const promise = slash.play()
      if (promise && typeof promise.catch === 'function') {
        promise.catch((error) => console.error('Slash audio play failed:', error))
      }
    }
  }, [])

  const handleVolumeAdjust = useCallback((delta: number) => {
    setVolume((prev) => {
      const next = Math.min(100, Math.max(0, prev + delta))
      return next
    })
  }, [])

  const handleBurn = useCallback(async () => {
    if (abyssDisabled) {
      toast.error(ABYSS_DISABLED_MESSAGE)
      return
    }
    if (burning) return
    if (!selectedInscription) {
      toast.error('Select a damned inscription to burn.')
      return
    }
    if (!selectedInscription.confirmed) {
      toast.error('Selected ordinal is still pending confirmation.')
      return
    }
    if (!changeAddress.trim()) {
      toast.error('Enter a change address for your payment wallet.')
      return
    }
    if (!paymentScanInitiated) {
      toast.error('Scan your payment wallet before burning.')
      return
    }
    if (!wallet.client) {
      toast.error('Connect a compatible wallet before burning.')
      return
    }

    setBurning(true)
    setBurnError(null)
    setBurnTxid(null)

    try {
      const inscriptionInput = selectedInscription

      let paymentCandidate =
        selectedPayment ?? paymentOptions.find((entry) => entry.value - MIN_FEE_SATS > DUST_THRESHOLD)
      if (!paymentCandidate) {
        throw new Error('No spendable payment UTXO available to cover fees.')
      }
      let resolvedPayment: BaseUtxo = paymentCandidate
      if (!selectedPayment || selectedPayment.outpoint !== resolvedPayment.outpoint) {
        setSelectedPaymentOutpoint(resolvedPayment.outpoint)
      }

      let changeAmount = resolvedPayment.value - MIN_FEE_SATS
      if (changeAmount <= DUST_THRESHOLD) {
        const fallback = paymentOptions.find(
          (entry) => entry.outpoint !== resolvedPayment.outpoint && entry.value - MIN_FEE_SATS > DUST_THRESHOLD,
        )
        if (fallback) {
          resolvedPayment = fallback
          setSelectedPaymentOutpoint(fallback.outpoint)
          changeAmount = fallback.value - MIN_FEE_SATS
        }
      }

      if (changeAmount <= DUST_THRESHOLD) {
        throw new Error('No payment UTXO with sufficient sats to cover fees without creating dust.')
      }

      const inputs = [
        { txid: inscriptionInput.txid, vout: inscriptionInput.vout, value: inscriptionInput.value },
        { txid: resolvedPayment.txid, vout: resolvedPayment.vout, value: resolvedPayment.value },
      ]

      const ordinalOutpoint = `${inscriptionInput.txid}:${inscriptionInput.vout}`
      const paymentOutpoint = `${resolvedPayment.txid}:${resolvedPayment.vout}`

      const burnDestinationAddress = 'bc1qyqqn49zuz6amnpd07zezs6ph2xujk6ezr4uvns'

      const outputs = [{ address: burnDestinationAddress, amount: inscriptionInput.value }]
      const changeOutput = { address: changeAddress.trim(), amount: changeAmount }

      const psbtResponse = await fetch('/api/wallet/psbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs,
          outputs,
          changeOutput,
          paymentAddress: changeAddress.trim(),
          paymentPublicKey: laserEyes.paymentPublicKey ?? null,
          taprootPublicKey: laserEyes.publicKey ?? null,
          fee: MIN_FEE_SATS,
          vsize: BURN_TX_VSIZE,
        }),
      })

      const psbtJson = await psbtResponse.json()
      if (!psbtResponse.ok || !psbtJson.success) {
        throw new Error(psbtJson.error || 'Failed to construct burn transaction.')
      }

      let psbtBase64 = psbtJson.psbt as string
      const signed = await wallet.client.signPsbt(psbtBase64, true, false)

      if (typeof signed === 'string') {
        psbtBase64 = signed
      } else if (signed && typeof signed === 'object') {
        if ('signedPsbtBase64' in signed) {
          psbtBase64 = signed.signedPsbtBase64 as string
        } else if ('signedPsbtHex' in signed) {
          psbtBase64 = Buffer.from((signed as { signedPsbtHex: string }).signedPsbtHex, 'hex').toString('base64')
        } else if (typeof (signed as any).toString === 'function') {
          psbtBase64 = (signed as any).toString()
        }
      }

      const bitcoin = await import('bitcoinjs-lib')
      const eccModule = await import('@bitcoinerlab/secp256k1')
      if (typeof bitcoin.initEccLib === 'function') {
        try {
          bitcoin.initEccLib((eccModule as any).default ?? eccModule)
        } catch (eccError) {
          console.warn('Failed to initialize ECC library', eccError)
        }
      }
      const finalPsbt = bitcoin.Psbt.fromBase64(psbtBase64)
      const requiresFinalization = finalPsbt.data.inputs.some(
        (input) => !input.finalScriptSig && !input.finalScriptWitness,
      )
      if (requiresFinalization) {
        try {
          finalPsbt.finalizeAllInputs()
        } catch (finalizeError) {
          console.error('Failed to finalize PSBT', finalizeError)
          throw new Error('Unable to finalize PSBT returned by wallet.')
        }
      }

      const signedTxHex = finalPsbt.extractTransaction().toHex()

      const txid = await InscriptionService.broadcastTransaction(signedTxHex, FEE_RATE_SAT_VB)
      setBurnTxid(txid)
      toast.success(`Burn complete. TXID ${txid.slice(0, 6)}…${txid.slice(-6)}`)

      reserveUtxo(ordinalOutpoint, 'ordinal')
      reserveUtxo(paymentOutpoint, 'payment')

      try {
        const recordResponse = await fetch('/api/abyss/burns', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inscriptionId: inscriptionInput.inscriptionId,
            txId: txid,
            ordinalWallet: ordinalAddress,
            paymentWallet: changeAddressRef.current || laserEyes.paymentAddress?.trim() || '',
          }),
        })
        if (!recordResponse.ok) {
          let errorMessage = 'Failed to record abyss burn.'
          try {
            const payload = await recordResponse.json()
            if (payload?.summary) {
              setBurnSummary({
                confirmed: Number(payload.summary.confirmed ?? 0),
                total: Number(payload.summary.total ?? 0),
              })
            }
            if (payload?.error) {
              errorMessage = payload.error
            }
          } catch {
            // ignore parse errors
          }
          throw new Error(errorMessage)
        } else {
          const payload = await recordResponse.json().catch(() => null)
          if (payload?.summary) {
            setBurnSummary({
              confirmed: Number(payload.summary.confirmed ?? 0),
              total: Number(payload.summary.total ?? 0),
            })
          }
          if (typeof payload?.bonusAllowance === 'number') {
            setBonusAllowance(Number(payload.bonusAllowance))
          } else {
            await fetchBurnSummary()
          }
        }

        setDamnedOptions((prev) =>
          prev.map((option) =>
            option.inscriptionId === inscriptionInput.inscriptionId ? { ...option, confirmed: false } : option,
          ),
        )

        const pendingRecord: PendingBurnRecord = {
          txId: txid,
          inscriptionId: inscriptionInput.inscriptionId,
          ordinalWallet: ordinalAddress,
          paymentWallet: changeAddressRef.current || laserEyes.paymentAddress?.trim() || '',
          status: 'pending',
          updatedAt: new Date().toISOString(),
          confirmedAt: null,
        }

        setPendingBurnRecords((prev) => {
          const filtered = prev.filter((record) => record.txId !== pendingRecord.txId)
          return [pendingRecord, ...filtered]
        })

        pollBurnStatus(txid)
        setSelectedInscriptionId(null)
        setSelectedPaymentOutpoint(null)

        void fetchPendingBurnRecords()
          .then(({ records, cooldown }) => {
            setPendingBurnRecords(records)
            setCooldownState(cooldown)
            setCooldownRemainingMs(Math.max(0, cooldown?.remainingMs ?? 0))
          })
          .catch((error) => {
            console.warn('Failed to refresh pending burns after broadcast:', error)
          })
      } catch (recordError) {
        console.error('Failed to record abyss burn:', recordError)
      }
    } catch (error) {
      console.error('Burn failed', error)
      const message = error instanceof Error ? error.message : 'Failed to burn inscription.'
      setBurnError(message)
      toast.error(message)
    } finally {
      setBurning(false)
    }
  }, [
    burning,
    abyssDisabled,
    selectedInscription,
    selectedPayment,
    paymentOptions,
    changeAddress,
    paymentScanInitiated,
    wallet.client,
    laserEyes.paymentPublicKey,
    laserEyes.publicKey,
    laserEyes.paymentAddress,
    toast,
    pollBurnStatus,
    fetchBurnSummary,
    fetchPendingBurnRecords,
    ordinalAddress,
  ])

  const handleConfirmBurn = useCallback(() => {
    setBurnConfirmOpen(false)
    void handleBurn()
  }, [handleBurn])

  const handleCancelBurn = useCallback(() => {
    setBurnConfirmOpen(false)
  }, [])

  const handleWalkerFall = useCallback(
    (active: ActiveWalker) => {
      let impactLeft = BASE_LEFT_PERCENT
      let impactTop = BASE_TOP_PERCENT
      setFallenPile((prev) => {
        const index = prev.length
        let placement = active.plannedPlacement
        if (!placement || active.plannedIndex !== index) {
          placement = calculatePlacement(index)
        }
        impactLeft = placement.left
        impactTop = placement.top

        const entry: FallenCharacter = {
          id: `${active.walker.key}-${Date.now()}-${index}`,
          src: active.walker.src,
          top: placement.top,
          left: placement.left,
          rotation: placement.rotation,
        }

        return [...prev, entry]
      })
      if (!active.burstTriggered) {
        emitBurstRef.current?.({
          leftPercent: impactLeft,
          topPercent: impactTop,
          axisLeftPercent: BASE_LEFT_PERCENT,
        })
      }
    },
    [calculatePlacement],
  )

  const walkerIndexRef = useRef(0)
  const SPAWN_SLASH_RATIO = 0.92

  const spawnWalker = useCallback(() => {
    const walker = walkers[walkerIndexRef.current % walkers.length]
    walkerIndexRef.current = (walkerIndexRef.current + 1) % walkers.length
    const id = `${walker.key}-${Date.now()}-${Math.random()}`
    const impactDelayMs = Math.max(0, walker.duration * SPAWN_SLASH_RATIO * 1000)
    const slashTimeoutId = window.setTimeout(() => playSlash(), impactDelayMs)
    const burstDelayMs = Math.max(0, impactDelayMs - 500)
    const burstTimeoutId = window.setTimeout(() => {
      const index = fallenPileRef.current
      const placement = calculatePlacement(index)
      emitBurstRef.current?.({
        leftPercent: placement.left,
        topPercent: placement.top,
        axisLeftPercent: BASE_LEFT_PERCENT,
      })
      setActiveWalkers((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                plannedPlacement: placement,
                plannedIndex: index,
                burstTriggered: true,
              }
            : entry,
        ),
      )
    }, burstDelayMs)
    setActiveWalkers((prev) => [...prev, { id, walker, slashTimeoutId, burstTimeoutId }])
  }, [calculatePlacement, playSlash])

  const handleAnimationEnd = useCallback(
    (active: ActiveWalker) => {
      if (typeof active.slashTimeoutId === 'number') {
        window.clearTimeout(active.slashTimeoutId)
      }
      if (typeof active.burstTimeoutId === 'number') {
        window.clearTimeout(active.burstTimeoutId)
      }
      handleWalkerFall(active)
      setActiveWalkers((prev) => prev.filter((entry) => entry.id !== active.id))
    },
    [handleWalkerFall],
  )

  useEffect(() => {
    if (showEntryModal) return

    spawnWalker()
    const SPAWN_INTERVAL_MS = 2400
    const intervalId = window.setInterval(spawnWalker, SPAWN_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [showEntryModal, spawnWalker])

  const totalBurns = burnSummary?.total ?? 0
  const minutesSinceReductionStart = useMemo(() => {
    if (Number.isNaN(CAP_REDUCTION_START_UTC)) return 0
    if (capDriftTimestamp < CAP_REDUCTION_START_UTC) return 0
    return Math.max(0, Math.floor((capDriftTimestamp - CAP_REDUCTION_START_UTC) / 60_000))
  }, [capDriftTimestamp])
  const dynamicCap = useMemo(() => {
    const raw = TOTAL_ABYSS_CAP - minutesSinceReductionStart
    const reduced = Math.max(raw, 0)
    const bonusCap = !abyssDisabled && bonusAllowance > 0 ? bonusAllowance : 0
    return Math.max(totalBurns, reduced + bonusCap)
  }, [minutesSinceReductionStart, totalBurns, bonusAllowance, abyssDisabled])
  const progressPercent = dynamicCap > 0 ? Math.min(100, (totalBurns / dynamicCap) * 100) : 100
  const globalCapReached = dynamicCap <= totalBurns && dynamicCap !== 0
  const bonusBurnsRemain = bonusAllowance > 0
  const bonusBurnAvailable = !abyssDisabled && bonusBurnsRemain
  const userCapReached = abyssDisabled || (globalCapReached && !bonusBurnAvailable)
  const showHolderBlock = isWalletConnected && isHolder === false && !isVerifying
  const holderAllowed = isHolder === true
  const hasPendingBurn = pendingBurnRecords.length > 0
  const fallbackCooldownMs = Math.max(0, cooldownState?.remainingMs ?? 0)
  const cooldownDisplayMs = cooldownRemainingMs > 0 ? cooldownRemainingMs : fallbackCooldownMs
  const cooldownLabel = formatCountdown(cooldownDisplayMs)
  const cooldownActive = cooldownDisplayMs > 0 || Boolean(cooldownState?.active)
  const burnLocked = hasPendingBurn || cooldownActive
  const canBurn = holderAllowed && !isVerifying && isWalletConnected && !userCapReached && !burnLocked
  useEffect(() => {
    fallenPileRef.current = fallenPile.length
  }, [fallenPile.length])

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      <audio
        ref={audioRef}
        src={audioSrc}
        loop
        preload="auto"
        onError={(e) => {
          console.error('Audio load error:', e)
          if (e.currentTarget.error) {
            console.error('Error code:', e.currentTarget.error.code)
            console.error('Error message:', e.currentTarget.error.message)
          }
        }}
      />
      <audio
        ref={slashAudioRef}
        preload="auto"
        onError={(event) => {
          const error = event.currentTarget.error
          console.error('Slash audio failed to load', error)
        }}
      >
        <source src="/music/slash.mp3" type="audio/mpeg" />
      </audio>

      <Header
        isHolder={isHolder}
        isVerifying={isVerifying}
        connected={isWalletConnected}
        onHolderVerified={handleHolderVerified}
        onVerifyingStart={handleVerifyingStart}
        onConnectedChange={handleConnectedChange}
        showMusicControls={false}
      />

      {/* Burn Counter + Warnings + Controls */}
      {globalCapReached && !bonusBurnAvailable ? (
        <FullAbyssMenu totalBurns={totalBurns} onOpenLeaderboard={() => setLeaderboardOpen(true)} />
      ) : null}

      <div className="absolute bottom-10 left-6 z-30 flex w-[21rem] flex-col gap-4">
        <div className="rounded-lg border border-red-700 bg-black/40 p-4 shadow-[0_0_25px_rgba(220,38,38,0.35)]">
          <div className="font-mono text-xs uppercase tracking-[0.4em] text-red-600">Abyssal Burn</div>
          <div className="mt-2 flex items-end gap-3">
            <div className="text-2xl font-black text-red-500">{totalBurns}</div>
            <div className="pb-[6px] text-sm text-gray-400">/ {dynamicCap}</div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded bg-red-900/50">
            <div
              className="h-full rounded bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 transition-[width] duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-red-600/40 bg-black/30 px-3 py-3">
          {burnWindowActive && burnWindowExpiresAt && (
            <div className="mb-3 rounded border border-emerald-500/40 bg-emerald-900/20 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-emerald-200">
              DAMNED POOL COMPLETE! Burn window active until {new Date(burnWindowExpiresAt).toLocaleTimeString()}
            </div>
          )}
          {abyssDisabled && !burnWindowActive && (
            <div className="mt-3 rounded border border-amber-500/40 bg-amber-900/20 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200">
              {ABYSS_DISABLED_MESSAGE}
            </div>
          )}
          {userCapReached && (
            <div className="mt-3 rounded border border-green-500/40 bg-green-900/20 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-green-300">
              Abyss satiated. Further burns disabled.
            </div>
          )}
          {globalCapReached && bonusBurnAvailable && (
            <div className="mt-3 rounded border border-amber-500/40 bg-amber-900/20 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200">
              Summoning bonus active — {bonusAllowance} bonus burn
              {bonusAllowance === 1 ? '' : 's'} available despite the cap.
            </div>
          )}
          {holderAllowed && !userCapReached ? (
            <div className="mt-3 space-y-3 font-mono text-[11px] uppercase tracking-[0.3em] text-red-400">
              {damnedError ? (
                <div className="rounded border border-red-600/40 bg-red-950/30 px-3 py-2 text-red-200">{damnedError}</div>
              ) : null}

              <div className="space-y-2 rounded border border-red-700/40 bg-black/25 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>Sacrifice:</span> 
                  <Button
                    type="button"
                    variant="outline"
                    className="border-2 border-red-500 bg-red-700/80 px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.35em] text-red-100 shadow-[0_0_20px_rgba(220,38,38,0.55)] transition-all hover:bg-red-600 animate-pulse"
                    onClick={() => setSelectorOpen(true)}
                    disabled={damnedLoading || burning || userCapReached}
                  >
                    Select
                  </Button>
                </div>
                {damnedLoading ? (
                  <div className="flex items-center gap-2 text-red-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading ordinals…</span>
                  </div>
                ) : selectedInscription ? (
                  <div className="space-y-2 text-left text-red-200">
                    <div className="text-xs uppercase tracking-[0.25em] text-red-300">
                      {selectedInscription.name ?? 'Unnamed Inscription'}
                    </div>
                    {selectedInscription.image ? (
                      <div className="relative h-28 w-full overflow-hidden rounded border border-red-700/40 bg-black/30">
                        <Image src={selectedInscription.image} alt={selectedInscription.name ?? 'Selected inscription'} fill className="object-contain" />
                      </div>
                    ) : null}
                    <div className={`text-[10px] tracking-[0.3em] ${selectedInscription.confirmed ? 'text-green-400' : 'text-amber-400'}`}>
                      {selectedInscription.confirmed ? 'Confirmed' : 'Pending confirmation'}
                    </div>
                  </div>
                ) : (
                  <p className="text-left text-[10px] tracking-[0.3em] text-red-400/60">None selected</p>
                )}
              </div>

              <div className="space-y-2 rounded border border-red-700/40 bg-black/25 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-red-300">Payment UTXO</span>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-2 border-amber-400/80 bg-amber-500/20 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.35)] transition-all hover:-translate-y-0.5 hover:bg-amber-400/25"
                    onClick={() => {
                      setPaymentScanInitiated(true)
                      void loadPaymentAssets()
                    }}
                    disabled={paymentLoading || !isWalletConnected || userCapReached}
                  >
                    {paymentLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Scan'}
                  </Button>
                </div>
                {!paymentScanInitiated ? (
                  <p className="text-left text-[10px] tracking-[0.3em] text-red-400/60">
                    Scan your payment wallet to load confirmed UTXOs.
                  </p>
                ) : paymentLoading ? (
                  <div className="flex items-center gap-2 text-red-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Scanning wallet…</span>
                  </div>
                ) : paymentError ? (
                  <p className="text-left text-[10px] tracking-[0.3em] text-red-400/60">{paymentError}</p>
                ) : selectedPayment ? (
                  <div className="space-y-1 text-left text-red-200">
                    <div className="flex items-center gap-1 text-[10px] tracking-[0.3em] text-green-400">
                      <CheckCircle className="h-3 w-3" aria-hidden="true" />
                      <span>{selectedPayment.value.toLocaleString()} sats</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-left text-[10px] tracking-[0.3em] text-red-400/60">
                    No confirmed payment UTXO available.
                  </p>
                )}
              </div>

              {!userCapReached && (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  className="w-full border border-red-500 bg-red-700/70 text-xs font-mono uppercase tracking-[0.4em] text-red-50 hover:bg-red-600"
                  disabled={
                    !canBurn ||
                    !selectedInscription ||
                    !selectedInscription.confirmed ||
                    !selectedPayment ||
                    !paymentScanInitiated ||
                    burning
                  }
                  onClick={() => setBurnConfirmOpen(true)}
                >
                  {burning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Burning…
                    </>
                  ) : cooldownActive ? (
                    <>Cooldown {cooldownLabel}</>
                  ) : (
                    'Send to the Abyss'
                  )}
                </Button>
              </div>
              )}

              {hasPendingBurn ? (
                <div className="rounded border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-[10px] tracking-[0.25em] text-amber-200">
                  <div>
                    Wait for confirm:                   
                    {pendingBurnRecords.map((record) => (
                      <a
                        key={record.txId}
                        href={`https://mempool.space/tx/${record.txId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-amber-100 underline decoration-amber-500/70 decoration-dotted underline-offset-4 transition-colors hover:text-amber-200"
                      >
                        {record.txId.slice(0, 8)}…{record.txId.slice(-8)}
                      </a>
                    ))}
                  </div>
                    </div>
              ) : null}

              {burnError ? (
                <div className="rounded border border-red-600/40 bg-red-950/30 px-3 py-2 text-[10px] tracking-[0.25em] text-red-200">
                  {burnError}
                </div>
              ) : null}
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full border border-red-500/60 bg-black/40 text-[10px] font-mono uppercase tracking-[0.35em] text-red-200 hover:bg-red-700/20"
            onClick={() => {
              void updatePendingData()
              setLeaderboardOpen(true)
            }}
          >
            Leaderboard
          </Button>
        </div>

        <div className="flex flex-col items-start gap-3 rounded-lg border border-red-600/50 bg-black/40 px-3 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (!audioRef.current) return
                if (audioRef.current.paused) {
                  audioRef.current
                    .play()
                    .then(() => setIsPlaying(true))
                    .catch((error) => console.error('Audio play failed:', error))
                } else {
                  audioRef.current.pause()
                  setIsPlaying(false)
                }
              }}
              className="text-red-500 transition-colors hover:text-red-400"
              aria-label="Play/Pause"
            >
              {!isPlaying ? (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="text-red-500 transition-colors hover:text-red-400"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
       
            <button
              onClick={() => handleVolumeAdjust(-5)}
              className="rounded border border-red-600 px-2 py-0.5 text-red-500 transition-colors hover:bg-red-600/20"
              disabled={isMuted}
            >
              −
            </button>
            <span className="min-w-[52px] text-center text-red-400">{isMuted ? 'MUTED' : `${volume}%`}</span>
            <button
              onClick={() => handleVolumeAdjust(5)}
              className="rounded border border-red-600 px-2 py-0.5 text-red-500 transition-colors hover:bg-red-600/20"
              disabled={isMuted}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Inscription Selector */}
      {selectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="relative w-full max-w-3xl max-h-[75vh] overflow-y-auto rounded-xl border border-red-600/40 bg-black/80 p-6 shadow-[0_0_35px_rgba(220,38,38,0.4)]">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-sm uppercase tracking-[0.4em] text-red-400">Select Damn Ordinal</h3>
              <Button
                type="button"
                variant="outline"
                className="border-red-700/50 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.3em] text-red-300 hover:bg-red-800/30"
                onClick={() => setSelectorOpen(false)}
              >
                Close
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {damnedLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-red-200">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading damned ordinals…</span>
                </div>
              ) : damnedOptions.length === 0 ? (
                <div className="rounded border border-red-600/40 bg-red-950/20 px-4 py-6 text-center font-mono text-[12px] uppercase tracking-[0.3em] text-red-200">
                  No ordinals from THE-DAMNED detected in this wallet.
                </div>
              ) : (
                <div className="grid gap-3">
                  {damnedOptions.map((option) => {
                    const isActive = selectedInscriptionId === option.inscriptionId
                    const isDisabled = !option.confirmed || userCapReached
                    const buttonClass = [
                      'flex items-center gap-4 rounded-lg border px-4 py-3 text-left transition',
                      isDisabled
                        ? 'cursor-not-allowed border-red-900/60 bg-black/25 opacity-50'
                        : isActive
                        ? 'border-red-500 bg-red-900/30 shadow-[0_0_20px_rgba(220,38,38,0.25)]'
                        : 'border-red-800/40 bg-black/25 hover:border-red-500/70',
                    ].join(' ')
                    return (
                    <button
                      key={option.outpoint}
                      type="button"
                      onClick={() => {
                        if (!option.confirmed || userCapReached) return
                        setSelectedInscriptionId(option.inscriptionId)
                        setSelectorOpen(false)
                      }}
                      className={buttonClass}
                      disabled={isDisabled}
                      aria-disabled={isDisabled}
                    >
                      <div className="relative h-16 w-16 overflow-hidden rounded border border-red-700/60 bg-black/40">
                        {option.image ? (
                          <Image src={option.image} alt={option.name ?? 'Damned'} fill className="object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[10px] font-mono uppercase tracking-[0.3em] text-red-300">
                            NO IMG
                          </span>
                        )}
                      </div>
                      <div className="flex-1 space-y-1 text-sm font-mono text-red-100">
                        <div className="text-xs uppercase tracking-[0.3em]">
                          {option.name ?? option.inscriptionId.slice(0, 12)}
                        </div>
                        <div className="text-[10px] tracking-[0.3em] text-red-300/80">
                          {option.inscriptionId.slice(0, 8)}…{option.inscriptionId.slice(-8)}
                        </div>
                        <div className="text-[10px] tracking-[0.3em] text-red-300/80">
                          {option.value.toLocaleString()} sats · {option.outpoint.slice(0, 12)}…
                        </div>
                        <div
                          className={`text-[10px] tracking-[0.3em] ${
                            option.confirmed ? 'text-green-400' : 'text-amber-400'
                          }`}
                        >
                          {option.confirmed ? 'Confirmed' : 'Pending'}
                        </div>
                      </div>
                    </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {burnConfirmOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-6 rounded-lg border-2 border-red-600/50 bg-black/90 p-6 text-center shadow-[0_0_35px_rgba(220,38,38,0.45)]">
            <div className="space-y-3">
              <h3 className="font-mono text-sm uppercase tracking-[0.4em] text-red-400">Final Warning</h3>
              <p className="font-mono text-base tracking-[0.3em] text-red-100">
                Your damned ordinal will be gone forever!
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-red-700/60 bg-transparent text-red-300 hover:bg-red-800/20"
                onClick={handleCancelBurn}
                disabled={burning}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 border border-red-500 bg-red-700/80 font-mono text-sm tracking-[0.3em] text-white hover:bg-red-600"
                onClick={handleConfirmBurn}
                disabled={burning}
              >
                Fuck it!
              </Button>
            </div>
          </div>
        </div>
      )}

      {leaderboardOpen && (
        <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl space-y-6 rounded-lg border-2 border-red-600/50 bg-black/92 p-6 shadow-[0_0_35px_rgba(220,38,38,0.5)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-left">
                <h3 className="font-mono text-base uppercase tracking-[0.35em] text-red-300">Abyss Leaderboards</h3>
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-red-500/80">
                  Sacrifices ranked by confirmed burns
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <a
                  href={`https://twitter.com/intent/tweet?${new URLSearchParams({
                    text: "Oh my, I just burned my damned in the abyss! It's gone forever!",
                    url: typeof window !== 'undefined' ? 'https://www.thedamned.xyz/abyss' : 'https://www.thedamned.xyz/abyss',
                  }).toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center border border-red-500 bg-red-700/80 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.3em] text-white shadow-[0_0_18px_rgba(220,38,38,0.45)] transition-colors hover:bg-red-600"
                >
                  Share the Burn
                </a>
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-700/60 bg-transparent px-3 py-1 text-[11px] font-mono uppercase tracking-[0.3em] text-red-300 hover:bg-red-800/20"
                  onClick={() => setLeaderboardOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded border border-red-700/40 bg-black/40">
              <div className="grid grid-cols-[auto,1fr,auto] gap-3 border-b border-red-700/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.25em] text-red-400">
                <span>#</span>
                <span>Addr</span>
                <span>Burns</span>
              </div>
              {leaderboard.length === 0 ? (
                <div className="px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-red-400/70">
                  No sacrifices recorded yet.
                </div>
              ) : (
                leaderboard.map((entry, index) => {
                  const normalizedOrdinal = entry.ordinalWallet.trim().toLowerCase()
                  const isSelf =
                    ordinalAddress.trim().length > 0 &&
                    normalizedOrdinal === ordinalAddress.trim().toLowerCase()
                  const baseClasses =
                    'grid grid-cols-[auto,1fr,auto] items-center gap-3 border-b border-red-700/20 px-4 py-2 text-[11px] font-mono tracking-[0.25em]'
                  const rowClasses = isSelf
                    ? `${baseClasses} bg-red-900/40 text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.35)]`
                    : `${baseClasses} text-red-200`

                  return (
                  <div
                    key={`${entry.ordinalWallet}|${entry.paymentWallet}|${index}`}
                      className={rowClasses}
                  >
                    <span className="text-red-500">{String(index + 1).padStart(2, '0')}</span>
                      <span className="text-red-200/90">bc1p...{summarizeOrdinal(entry.ordinalWallet)}</span>
                    <span className="text-green-400">{entry.confirmed}</span>
                      </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}


      {/* Entry Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md">
          <div className="mx-4 w-full max-w-md rounded-lg border-2 border-red-600/50 bg-black/85 p-8">
            <div className="space-y-4 text-center">
              <h2 className="text-3xl font-bold font-mono">
                <span className="bg-gradient-to-r from-red-600 via-orange-500 to-red-600 bg-clip-text text-transparent">
                  DESCEND INTO THE ABYSS
                </span>
              </h2>
              <div className="space-y-4 pt-1 font-mono text-gray-400">
                <div className="text-lg">The cliff edge beckons the damned.</div>
           
                <div className="text-xs italic text-red-600/70">&quot;Gravity claims all souls in time.&quot;</div>
              </div>
            </div>
            <div className="flex justify-center pt-4">
              <button
                onClick={handleEnter}
                className="w-full rounded border-2 border-red-600/50 bg-red-600 px-6 py-3 text-xl font-mono tracking-wider text-white transition-colors hover:bg-red-700"
              >
                Redemption
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background */}
      <div
        className="absolute inset-0 z-0 bg-left-top bg-no-repeat"
        style={{ backgroundImage: "url('/abyssbg.png')", backgroundSize: '100% 100%' }}
      />

      {/* Ember Canvas */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-40" />

      {/* Characters marching and falling */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <div className="absolute left-[58%] top-[68%] h-40 w-40 rounded-full bg-red-900/25 blur-3xl" />
        <div className="relative h-full w-full translate-y-[15vh] md:translate-y-[10vh]">
          {fallenPile.map((fallen) => (
            <div
              className="pointer-events-none absolute z-30"
              style={{
                width: 'clamp(6rem, 8vw, 9rem)',
                height: 'clamp(10rem, 14vw, 16rem)',
                top: `${fallen.top}%`,
                left: `${fallen.left}%`,
                transform: `translateX(-50%) rotate(${fallen.rotation}deg)`,
              }}
              key={fallen.id}
            >
              <div className="relative h-full w-full">
                <Image
                  src={fallen.src}
                  alt="Fallen damned soul"
                  fill
                  sizes="(max-width: 768px) 96px, 128px"
                  className="object-contain opacity-95"
                  priority={false}
                />
              </div>
            </div>
          ))}
          {activeWalkers.map((active) => (
            <div
              key={active.id}
              className={`abyss-character ${active.walker.flip ? 'abyss-character--flipped' : ''}`}
              onAnimationEnd={() => handleAnimationEnd(active)}
              style={
                {
                  '--delay': '0s',
                  '--duration': `${active.walker.duration}s`,
                  animationIterationCount: 1,
                  animationFillMode: 'forwards',
                } as CSSProperties
              }
            >
              <div className="abyss-character-inner animate-tilt-run" style={{ transform: 'scaleX(1)', position: 'relative' }}>
                <Image
                  src={active.walker.src}
                  alt="Damned soul marching"
                  fill
                  sizes="(max-width: 768px) 96px, 140px"
                  className="object-contain"
                  priority={false}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {isWalletConnected && isVerifying && (
        <div className="absolute inset-x-0 top-24 bottom-0 z-40 flex items-center justify-center">
          <div className="rounded-lg border border-red-500 bg-black/65 px-6 py-4 text-center font-mono text-sm uppercase tracking-[0.4em] text-red-300 shadow-[0_0_25px_rgba(220,38,38,0.35)]">
            Verifying holder status…
          </div>
        </div>
      )}

 
      
    </div>
  )
}

const LaserEyesWrapper = dynamic(() => import('@/components/LaserEyesWrapper'), {
  ssr: false,
  loading: () => null,
})

export default function AbyssPage() {
  return (
    <LaserEyesWrapper>
      <AbyssContent />
    </LaserEyesWrapper>
  )
}

