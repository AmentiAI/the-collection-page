'use client'

import Image from 'next/image'
import type { ComponentType, SVGProps } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'
import { BadgeCheck, Copy, FileImage, FileText, Flame, Grid3X3, Layers3, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'

import BackgroundMusic from '@/components/BackgroundMusic'
import Header from '@/components/Header'
import LaserEyesWrapper from '@/components/LaserEyesWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/Toast'
import { useWallet } from '@/lib/wallet/compatibility'
import type {
  CategorisedWalletAssets,
  InscriptionUtxo,
  ProcessedRuneBalance,
  RuneBearingUtxo,
} from '@/lib/sandshrew'
import { InscriptionService } from '@/services/inscription-service'

type AssetTabKey = 'inscriptions' | 'spendable' | 'runes' | 'alkanes'

const ASSET_TABS: Array<{ key: AssetTabKey; label: string; icon: ComponentType<any> }> = [
  { key: 'inscriptions', label: 'Inscriptions', icon: FileText },
  { key: 'spendable', label: 'Payment UTXOs', icon: Layers3 },
  { key: 'runes', label: 'Runes', icon: Sparkles },
  { key: 'alkanes', label: 'Alkanes', icon: Flame },
]

interface SelectedAsset {
  outpoint: string
  txid: string
  vout: number
  category: AssetTabKey
  value: number
  height: number | null
  inscriptions?: string[]
  runeBalances?: ProcessedRuneBalance[]
  autoPayment?: boolean
}

interface MagicEdenMetadata {
  name?: string | null
  collectionSymbol?: string | null
  collectionName?: string | null
  contentUri?: string | null
}

interface OrdinalContentMetadata {
  inscriptionId: string
  endpoint: string
  contentType?: string | null
  contentLength?: number | null
  acceptsRanges?: boolean
}

const formatSats = (value: number) => `${value.toLocaleString()} sats`

const formatBtc = (value: number) => {
  const btc = value / 100_000_000
  if (!Number.isFinite(btc)) return '--'
  return `${btc.toFixed(8).replace(/\.?0+$/, '')} BTC`
}

const truncateMiddle = (value: string, size = 12) => {
  if (value.length <= size) return value
  const half = Math.floor(size / 2)
  return `${value.slice(0, half)}…${value.slice(-half)}`
}

const DUST_THRESHOLD = 546
const MEMPOOL_API_BASE = (process.env.NEXT_PUBLIC_MEMPOOL_API_URL || 'https://mempool.space/api').replace(/\/+$/, '')
const AVERAGE_TAPROOT_INPUT_VBYTES = 68
const AVERAGE_OUTPUT_VBYTES = 43
const TX_OVERHEAD_VBYTES = 10
const PICKER_PAGE_SIZE = 10
const MAX_INSCRIPTION_SELECTION = 20

type MempoolRecommendedFees = {
  fastestFee: number
  halfHourFee: number
  hourFee: number
  economyFee: number
  minimumFee: number
}

interface TransactionPlan {
  inputs: SelectedAsset[]
  outputs: Array<{ address: string; amount: number }>
  changeOutput?: { address: string; amount: number }
  feeRate: number
  fee: number
  vsize: number
  paymentInputs: SelectedAsset[]
}

function estimateVsize(inputCount: number, outputCount: number) {
  return inputCount * AVERAGE_TAPROOT_INPUT_VBYTES + outputCount * AVERAGE_OUTPUT_VBYTES + TX_OVERHEAD_VBYTES
}

function RuneBalancePill({ balance }: { balance: ProcessedRuneBalance }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-900/20 px-3 py-1 text-xs font-mono text-sky-200">
      <Sparkles className="h-3 w-3 text-sky-300" />
      <span className="uppercase tracking-[0.3em]">{balance.symbol || balance.name || 'RUNE'}</span>
      <span>{balance.balanceFormatted}</span>
    </div>
  )
}

function InscriptionChip({
  inscriptionId,
  onPreview,
}: {
  inscriptionId: string
  onPreview: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPreview(inscriptionId)}
      className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-900/20 px-3 py-1 text-xs font-mono uppercase tracking-[0.25em] text-amber-100 transition hover:border-amber-300 hover:bg-amber-800/30"
    >
      <FileImage className="h-3 w-3" />
      {truncateMiddle(inscriptionId, 18)}
    </button>
  )
}

function AssetRow({
  children,
  checked,
  onToggle,
  className,
  selectable = true,
}: {
  children: React.ReactNode
  checked: boolean
  onToggle?: () => void
  className?: string
  selectable?: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-white/10 bg-black/40 p-4 transition ${
        checked ? 'border-red-400/60 bg-red-950/20 shadow-[0_0_25px_rgba(248,113,113,0.25)]' : ''
      } ${className ?? ''}`}
    >
      <div className="flex items-start gap-3">
        {selectable ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={() => {
              if (onToggle) {
                onToggle()
              }
            }}
            className="mt-1 h-4 w-4 cursor-pointer rounded border-red-400/60 bg-black text-red-500 focus:ring-red-500"
          />
        ) : (
          <div className="mt-1 h-4 w-4" />
        )}
        <div className="flex-1 space-y-3">{children}</div>
      </div>
    </div>
  )
}

export default function AssetsPage() {
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)
  const [startMusic, setStartMusic] = useState(false)
  const [musicVolume, setMusicVolume] = useState(30)
  const [isMusicMuted, setIsMusicMuted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setStartMusic(true), 500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <LaserEyesWrapper>
      <Header
        isHolder={isHolder}
        isVerifying={isVerifying}
        connected={connected}
        onHolderVerified={(holder) => {
          setIsHolder(holder)
          setIsVerifying(false)
        }}
        onVerifyingStart={() => setIsVerifying(true)}
        onConnectedChange={setConnected}
        musicVolume={musicVolume}
        onMusicVolumeChange={setMusicVolume}
        isMusicMuted={isMusicMuted}
        onMusicMutedChange={setIsMusicMuted}
      />
      <BackgroundMusic shouldPlay={startMusic} volume={musicVolume} isMuted={isMusicMuted} />
      <AssetsPageContent isHolder={isHolder} />
    </LaserEyesWrapper>
  )
}

interface AssetsPageContentProps {
  isHolder?: boolean
}

function AssetsPageContent({ isHolder }: AssetsPageContentProps) {
  const toast = useToast()
  const { isConnected, currentAddress, client } = useWallet()
  const laserEyes = useLaserEyes() as Partial<{
    paymentAddress: string
    paymentPublicKey: string
    publicKey: string
  }>

  const ordinalAddress = currentAddress?.trim() || ''
  const paymentAddress = laserEyes.paymentAddress?.trim() || ''

  const [ordinalAssets, setOrdinalAssets] = useState<CategorisedWalletAssets | null>(null)
  const [paymentAssets, setPaymentAssets] = useState<CategorisedWalletAssets | null>(null)
  const [ordinalLoading, setOrdinalLoading] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [ordinalError, setOrdinalError] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const [selectedMap, setSelectedMap] = useState<Record<string, SelectedAsset>>({})
  const [destinationMap, setDestinationMap] = useState<Record<string, { address: string; amount: string }>>({})

  const [inscriptionMetadataMap, setInscriptionMetadataMap] = useState<Record<string, MagicEdenMetadata>>({})
  const [magicEdenLoading, setMagicEdenLoading] = useState(false)

  const [pickerType, setPickerType] = useState<AssetTabKey | null>(null)
  const [pickerPage, setPickerPage] = useState<Record<AssetTabKey, number>>({
    inscriptions: 0,
    spendable: 0,
    runes: 0,
    alkanes: 0,
  })

  const [previewInscription, setPreviewInscription] = useState<string | null>(null)
  const [previewMetadata, setPreviewMetadata] = useState<OrdinalContentMetadata | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const lastFetchedRef = useRef<{ ordinal: string | null; payment: string | null }>({
    ordinal: null,
    payment: null,
  })

  const [copiedAddress, setCopiedAddress] = useState(false)
  const [feeRate, setFeeRate] = useState<string>('12')
  const [feeRateEdited, setFeeRateEdited] = useState(false)
  const [feeRecommendations, setFeeRecommendations] = useState<MempoolRecommendedFees | null>(null)
  const [feeFetchStatus, setFeeFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [feeFetchedAt, setFeeFetchedAt] = useState<number | null>(null)
  const [transferState, setTransferState] = useState<'idle' | 'working' | 'success'>('idle')
  const [transferError, setTransferError] = useState<string | null>(null)
  const [transferTxid, setTransferTxid] = useState<string | null>(null)
  const [pendingSelectedMap, setPendingSelectedMap] = useState<Record<string, boolean>>({})
  const [pendingSelectedStatus, setPendingSelectedStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle')
  const [pendingSelectedError, setPendingSelectedError] = useState<string | null>(null)

  useEffect(() => {
    if (!copiedAddress) return
    const timeout = setTimeout(() => setCopiedAddress(false), 2000)
    return () => clearTimeout(timeout)
  }, [copiedAddress])

  useEffect(() => {
    let cancelled = false
    let intervalId: number | undefined

    const fetchRecommendedFees = async () => {
      try {
        if (!cancelled) {
          setFeeFetchStatus((prev) => (prev === 'success' ? prev : 'loading'))
        }

        const response = await fetch(`${MEMPOOL_API_BASE}/v1/fees/recommended`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch mempool fees (${response.status})`)
        }

        const data = (await response.json()) as MempoolRecommendedFees
        if (cancelled) {
          return
        }

        setFeeRecommendations(data)
        setFeeFetchedAt(Date.now())
        setFeeFetchStatus('success')

        if (!feeRateEdited) {
          const suggested =
            data.hourFee ??
            data.halfHourFee ??
            data.economyFee ??
            data.fastestFee ??
            data.minimumFee ??
            1
          setFeeRate(String(Math.max(1, Math.round(suggested))))
        }
      } catch (error) {
        if (cancelled) {
          return
        }
        console.error('Failed to fetch mempool fee recommendations', error)
        setFeeFetchStatus('error')
      }
    }

    const initialize = () => {
      void fetchRecommendedFees()
      if (typeof window !== 'undefined') {
        intervalId = window.setInterval(() => {
          void fetchRecommendedFees()
        }, 60_000)
      }
    }

    initialize()

    return () => {
      cancelled = true
      if (intervalId !== undefined) {
        clearInterval(intervalId)
      }
    }
  }, [feeRateEdited])

  const fetchAssets = useCallback(
    async (address: string, kind: 'ordinal' | 'payment') => {
      const normalized = address.trim()
      if (!normalized) {
        if (kind === 'ordinal') {
          setOrdinalError('A Bitcoin address is required')
        } else {
          setPaymentError('A Bitcoin address is required')
        }
        return
      }

      const setLoading = kind === 'ordinal' ? setOrdinalLoading : setPaymentLoading
      const setError = kind === 'ordinal' ? setOrdinalError : setPaymentError
      const setAssets = kind === 'ordinal' ? setOrdinalAssets : setPaymentAssets
      const refKey = kind === 'ordinal' ? 'ordinal' : 'payment'

      try {
        setLoading(true)
        setError(null)
        const response = await fetch('/api/wallet/assets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ address: normalized }),
        })

        const payload = await response.json()

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Failed to load wallet assets')
        }

        setAssets(payload.data as CategorisedWalletAssets)
        lastFetchedRef.current[refKey] = normalized
      } catch (err) {
        console.error('Failed to fetch wallet assets', err)
        const message = err instanceof Error ? err.message : 'Unknown error fetching assets'
        setError(message)
        toast.error(`Asset fetch failed: ${message}`)
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    if (ordinalAddress && ordinalAddress !== lastFetchedRef.current.ordinal) {
      fetchAssets(ordinalAddress, 'ordinal')
    }
  }, [ordinalAddress, fetchAssets])

  useEffect(() => {
    if (paymentAddress && paymentAddress !== lastFetchedRef.current.payment) {
      fetchAssets(paymentAddress, 'payment')
    }
  }, [paymentAddress, fetchAssets])

  const handleRefresh = useCallback(() => {
    const promises: Promise<void>[] = []

    if (ordinalAddress) {
      promises.push(fetchAssets(ordinalAddress, 'ordinal'))
    }
    if (paymentAddress) {
      promises.push(fetchAssets(paymentAddress, 'payment'))
    }
    if (!promises.length) {
      setOrdinalError('Connect a wallet to sync assets')
      return
    }
    void Promise.allSettled(promises)
  }, [fetchAssets, ordinalAddress, paymentAddress])

  const toggleSelection = useCallback((asset: SelectedAsset) => {
    setSelectedMap((current) => {
      const exists = !!current[asset.outpoint]
      const next = { ...current }
      if (exists) {
        delete next[asset.outpoint]
      } else {
        if (asset.category === 'inscriptions') {
          const currentInscriptionCount = Object.values(current).filter((item) => item.category === 'inscriptions').length
          if (currentInscriptionCount >= MAX_INSCRIPTION_SELECTION) {
            toast.error(`Limit ${MAX_INSCRIPTION_SELECTION} inscriptions per transfer. Remove one before adding another.`)
            return current
          }
        }
        next[asset.outpoint] = asset
      }
      setDestinationMap((prev) => {
        const updated = { ...prev }
        if (exists) {
          delete updated[asset.outpoint]
        } else if (!updated[asset.outpoint]) {
          const defaultAmount = asset.category === 'spendable' ? '' : String(asset.value ?? 0)
          updated[asset.outpoint] = {
            address: '',
            amount: defaultAmount,
          }
        }
        return updated
      })
      return next
    })
  }, [toast])

  const updateDestination = useCallback((outpoint: string, key: 'address' | 'amount', value: string) => {
    setDestinationMap((prev) => {
      const current = prev[outpoint] ?? { address: '', amount: '' }
      return {
        ...prev,
        [outpoint]: {
          address: key === 'address' ? value : current.address,
          amount: key === 'amount' ? value : current.amount,
        },
      }
    })
  }, [])

  const selectedAssets = Object.values(selectedMap)
  const totalSelectedValue = selectedAssets.reduce((sum, asset) => sum + asset.value, 0)

  const destinationDrafts = useMemo(() => {
    return selectedAssets.map((asset) => {
      const override = destinationMap[asset.outpoint] || { address: '', amount: '' }
      const address = override.address.trim()
      const required = asset.category !== 'spendable'
      const valid = !required || address.length > 0
      const pending = pendingSelectedMap[asset.outpoint] ?? false
      return {
        asset,
        address,
        required,
        valid,
        pending,
      }
    })
  }, [destinationMap, pendingSelectedMap, selectedAssets])

  const parsedOutputDrafts = useMemo(
    () =>
      destinationDrafts
        .filter((draft) => draft.asset.category !== 'spendable' && draft.address.length > 0)
        .map((draft) => ({
          address: draft.address,
          amount: draft.asset.value,
        })),
    [destinationDrafts],
  )

  const requiredOutputsSatisfied = destinationDrafts.every((draft) => draft.valid)
  const hasTransferableAssets = destinationDrafts.some((draft) => draft.asset.category !== 'spendable')
  const pendingSelectedCount = useMemo(
    () => Object.values(pendingSelectedMap).filter(Boolean).length,
    [pendingSelectedMap],
  )
  const hasPendingSelected = pendingSelectedCount > 0
  const baseReadyForTransfer = hasTransferableAssets && requiredOutputsSatisfied && parsedOutputDrafts.length > 0
  const readyForTransfer = baseReadyForTransfer && !hasPendingSelected && pendingSelectedStatus !== 'checking'

  const tabCounts = useMemo(
    () => ({
      inscriptions: ordinalAssets?.inscriptions.length ?? 0,
      runes: ordinalAssets?.runes.length ?? 0,
      alkanes: ordinalAssets?.alkanes.length ?? 0,
      spendable: paymentAssets?.spendable.length ?? 0,
    }),
    [ordinalAssets, paymentAssets],
  )

  const ordinalAssetCount = tabCounts.inscriptions + tabCounts.runes + tabCounts.alkanes
  const paymentUtxoCount = tabCounts.spendable

  const ordHeights = useMemo(
    () => ({
      ord: ordinalAssets?.ordHeight ?? paymentAssets?.ordHeight ?? null,
      metashrew: ordinalAssets?.metashrewHeight ?? paymentAssets?.metashrewHeight ?? null,
    }),
    [ordinalAssets, paymentAssets],
  )

  const ordinalInscriptionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const utxo of ordinalAssets?.inscriptions ?? []) {
      for (const inscriptionId of utxo.inscriptions ?? []) {
        if (inscriptionId) {
          ids.add(inscriptionId)
        }
      }
    }
    return Array.from(ids)
  }, [ordinalAssets?.inscriptions])

  useEffect(() => {
    if (!ordinalAddress) {
      setInscriptionMetadataMap({})
      setMagicEdenLoading(false)
      return
    }

    if (ordinalInscriptionIds.length === 0) {
      setInscriptionMetadataMap({})
      setMagicEdenLoading(false)
      return
    }

    let cancelled = false

    async function loadMagicEdenMetadata() {
      setMagicEdenLoading(true)
      setInscriptionMetadataMap({})
      try {
        const response = await fetch(
          `/api/magic-eden?ownerAddress=${encodeURIComponent(ordinalAddress)}&fetchAll=true`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          },
        )

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || `Magic Eden request failed (${response.status})`)
        }

        const payload = await response.json()
        const tokens = Array.isArray(payload?.tokens)
          ? payload.tokens
          : Array.isArray(payload)
            ? payload
            : []

        const targetIds = new Set(ordinalInscriptionIds)
        const nextMap: Record<string, MagicEdenMetadata> = {}

        for (const token of tokens as Array<Record<string, any>>) {
          const inscriptionId = (token?.inscriptionId || token?.id) as string | undefined
          if (!inscriptionId || !targetIds.has(inscriptionId)) {
            continue
          }

          const meta = token?.meta ?? {}
          const collection = token?.collection ?? meta?.collection ?? {}

          nextMap[inscriptionId] = {
            name: meta?.name ?? token?.name ?? null,
            collectionSymbol: collection?.symbol ?? token?.collectionSymbol ?? null,
            collectionName: collection?.name ?? token?.collectionName ?? null,
            contentUri: token?.contentURI ?? meta?.content?.uri ?? null,
          }
        }

        if (!cancelled) {
          setInscriptionMetadataMap(nextMap)
        }

        console.debug('[MagicEden] Metadata fetched', {
          address: ordinalAddress,
          requestedIds: ordinalInscriptionIds.length,
          matched: tokens.length,
          totalReported: payload?.total ?? null,
        })
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch Magic Eden metadata', error)
        }
      } finally {
        if (!cancelled) {
          setMagicEdenLoading(false)
        }
      }
    }

    loadMagicEdenMetadata()

    return () => {
      cancelled = true
    }
  }, [ordinalAddress, ordinalInscriptionIds])

  const handlePreview = useCallback((inscriptionId: string) => {
    setPreviewInscription(inscriptionId)
    setPreviewMetadata(null)
    setPreviewError(null)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadMetadata(inscriptionId: string) {
      try {
        setPreviewLoading(true)
        const response = await fetch(`/api/ordinals/content/${encodeURIComponent(inscriptionId)}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        })

        const payload = await response.json()

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Unable to load content metadata')
        }

        setPreviewMetadata(payload.data as OrdinalContentMetadata)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        console.error('Failed to fetch ordinals metadata', err)
        setPreviewError(err instanceof Error ? err.message : 'Failed to load content metadata')
      } finally {
        setPreviewLoading(false)
      }
    }

    if (previewInscription) {
      loadMetadata(previewInscription)
    }

    return () => controller.abort()
  }, [previewInscription])

  const closePreview = useCallback(() => {
    setPreviewInscription(null)
    setPreviewMetadata(null)
    setPreviewError(null)
  }, [])

  const handleCopyPaymentAddress = useCallback(async () => {
    if (!paymentAddress || typeof navigator === 'undefined' || !navigator.clipboard) {
      return
    }
    try {
      await navigator.clipboard.writeText(paymentAddress)
      setCopiedAddress(true)
    } catch (error) {
      console.error('Failed to copy wallet address', error)
    }
  }, [paymentAddress])

  const handleFeeRateChange = useCallback((value: string) => {
    setFeeRate(value)
    setFeeRateEdited(true)
  }, [])

  const applyFeeShortcut = useCallback(
    (value: number) => {
      const normalized = Math.max(1, Math.round(value))
      handleFeeRateChange(String(normalized))
    },
    [handleFeeRateChange],
  )

  const signAndBroadcastPsbt = useCallback(
    async (psbt: string, feeRateValue?: number) => {
      if (!client) {
        throw new Error('Connect a compatible wallet before signing.')
      }

      let psbtToSign = psbt
      const signed = await client.signPsbt(psbt, true, false)

      if (typeof signed === 'object' && signed !== null) {
        if ('signedPsbtBase64' in signed) {
          psbtToSign = signed.signedPsbtBase64 as string
        } else if ('signedPsbtHex' in signed) {
          psbtToSign = Buffer.from((signed as any).signedPsbtHex, 'hex').toString('base64')
        } else if (typeof (signed as any).toString === 'function') {
          psbtToSign = (signed as any).toString()
        }
      } else if (typeof signed === 'string') {
        psbtToSign = signed
      }

      const bitcoin = await import('bitcoinjs-lib')
      const finalPsbt = bitcoin.Psbt.fromBase64(psbtToSign)
      const signedTxHex = finalPsbt.extractTransaction().toHex()

      const txid = await InscriptionService.broadcastTransaction(signedTxHex, feeRateValue)
      return { txid, signedPsbt: psbtToSign }
    },
    [client],
  )

  const spendableSorted = useMemo(() => {
    return [...(paymentAssets?.spendable ?? [])]
      .filter((utxo) => utxo.value > DUST_THRESHOLD)
      .sort((a, b) => b.value - a.value)
  }, [paymentAssets?.spendable])

  useEffect(() => {
    let cancelled = false
    let intervalId: number | undefined

    const evaluateSelections = async () => {
      const assets = Object.values(selectedMap)

      if (cancelled) {
        return
      }

      if (!assets.length) {
        setPendingSelectedMap({})
        setPendingSelectedStatus('idle')
        setPendingSelectedError(null)
        return
      }

      setPendingSelectedStatus('checking')
      setPendingSelectedError(null)

      const uniqueTxids = Array.from(new Set(assets.map((asset) => asset.txid)))

      const results = await Promise.all(
        uniqueTxids.map(async (txid) => {
          try {
            const response = await fetch(`${MEMPOOL_API_BASE}/tx/${txid}`, {
              method: 'GET',
              cache: 'no-store',
            })

            if (response.status === 404) {
              return { txid, pending: true, error: null }
            }

            if (!response.ok) {
              throw new Error(`Failed to inspect transaction ${txid.slice(0, 6)}…`)
            }

            const payload = await response.json()
            const confirmed = Boolean(payload?.status?.confirmed)
            return { txid, pending: !confirmed, error: null }
          } catch (error) {
            console.error(`Failed to inspect transaction ${txid}`, error)
            const message = error instanceof Error ? error.message : 'Unknown mempool status error'
            return { txid, pending: true, error: message }
          }
        }),
      )

      if (cancelled) {
        return
      }

      const txPendingMap = new Map(results.map((result) => [result.txid, result.pending]))
      const nextMap: Record<string, boolean> = {}
      for (const asset of assets) {
        nextMap[asset.outpoint] = txPendingMap.get(asset.txid) ?? false
      }

      setPendingSelectedMap(nextMap)

      const errors = results.filter((result) => result.error)
      if (errors.length > 0) {
        setPendingSelectedStatus('error')
        setPendingSelectedError(errors[0]?.error ?? 'Failed to verify transaction status')
      } else {
        setPendingSelectedStatus('success')
        setPendingSelectedError(null)
      }
    }

    void evaluateSelections()

    if (typeof window !== 'undefined') {
      intervalId = window.setInterval(() => {
        void evaluateSelections()
      }, 30_000)
    }

    return () => {
      cancelled = true
      if (intervalId !== undefined) {
        clearInterval(intervalId)
      }
    }
  }, [selectedMap])

  const computePlan = useCallback(
    (
      inputs: SelectedAsset[],
      outputs: Array<{ address: string; amount: number }>,
      feeRateValue: number,
    ): { plan?: TransactionPlan; error?: string } => {
      if (!outputs.length) {
        return { error: 'Provide at least one valid output (address and sats).' }
      }

      if (!Number.isFinite(feeRateValue) || feeRateValue <= 0) {
        return { error: 'Enter a valid sat/vB fee rate.' }
      }

      const paymentSpendable = spendableSorted
      const manualInputs = inputs.map((input) => ({ ...input, autoPayment: input.autoPayment ?? false }))
      const spendableManualIds = new Set(
        manualInputs.filter((input) => input.category === 'spendable').map((input) => input.outpoint),
      )
      const availablePaymentUtxos = [...paymentSpendable]
        .filter((utxo) => !spendableManualIds.has(utxo.outpoint))
        .sort((a, b) => b.value - a.value)

      const candidateInputs: SelectedAsset[] = manualInputs.map((input) => ({ ...input }))
      let totalInputValue = candidateInputs.reduce((sum, asset) => sum + asset.value, 0)
      let changeOutput: { address: string; amount: number } | undefined
      let finalVsize = 0
      let finalFee = 0
      const destinationTotal = outputs.reduce((sum, output) => sum + output.amount, 0)

      const convertSpendableToSelected = (
        utxo: CategorisedWalletAssets['spendable'][number],
        autoPayment = false,
      ): SelectedAsset => ({
        category: 'spendable',
        outpoint: utxo.outpoint,
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        height: utxo.height,
        autoPayment,
      })

      while (true) {
        const outputCount = outputs.length + (changeOutput ? 1 : 0)
        finalVsize = estimateVsize(candidateInputs.length, outputCount)
        finalFee = Math.ceil(finalVsize * feeRateValue)
        const remaining = totalInputValue - destinationTotal - finalFee

        if (remaining < 0) {
          const nextPayment = availablePaymentUtxos.shift()
          if (!nextPayment) {
            return { error: 'Insufficient payment UTXOs to fund this transaction.' }
          }
          const paymentInput = convertSpendableToSelected(nextPayment, true)
          candidateInputs.push(paymentInput)
          totalInputValue += paymentInput.value
          changeOutput = undefined
          continue
        }

        if (remaining >= DUST_THRESHOLD) {
          if (!paymentAddress) {
            return { error: 'Payment address required to return change.' }
          }
          if (changeOutput && Math.abs(changeOutput.amount - remaining) < 1) {
            changeOutput = { ...changeOutput, amount: remaining }
            break
          }
          changeOutput = { address: paymentAddress, amount: remaining }
          continue
        }

        changeOutput = undefined
        break
      }

      const paymentInputs = candidateInputs.filter((input) => input.category === 'spendable')
      const plan: TransactionPlan = {
        inputs: candidateInputs,
        outputs: outputs.map((output) => ({ ...output })),
        changeOutput,
        feeRate: feeRateValue,
        fee: finalFee,
        vsize: finalVsize,
        paymentInputs,
      }

      return { plan }
  },
    [paymentAddress, spendableSorted],
  )

  const planPreview = useMemo(() => {
    if (!selectedAssets.length) {
      return { status: 'info', message: 'Select assets to preview funding.' as const }
    }

    if (!parsedOutputDrafts.length) {
      return { status: 'info', message: 'Enter destination addresses to prepare funding.' as const }
    }

    const feeRateValue = Number.parseFloat(feeRate)
    if (!Number.isFinite(feeRateValue) || feeRateValue <= 0) {
      return { status: 'info', message: 'Enter a valid sat/vB fee rate.' as const }
    }

    const normalizedInputs = selectedAssets.map((input) => ({ ...input, autoPayment: input.autoPayment ?? false }))
    const result = computePlan(normalizedInputs, parsedOutputDrafts, feeRateValue)
    if (result.error || !result.plan) {
      return { status: 'error', message: result.error ?? 'Unable to prepare funding plan.' as const }
    }

    return { status: 'ready', plan: result.plan } as const
  }, [selectedAssets, parsedOutputDrafts, feeRate, computePlan])

  const feeShortcutOptions = useMemo(() => {
    if (!feeRecommendations) return []

    const options = [
      { key: 'fast', label: 'Fast', value: feeRecommendations.fastestFee },
      { key: 'half-hour', label: 'Half Hour', value: feeRecommendations.halfHourFee },
      { key: 'hour', label: 'Hour', value: feeRecommendations.hourFee },
      { key: 'economy', label: 'Economy', value: feeRecommendations.economyFee },
      { key: 'min', label: 'Min', value: feeRecommendations.minimumFee },
    ]

    const seen = new Set<number>()

    return options
      .filter((option) => Number.isFinite(option.value) && option.value != null && option.value > 0)
      .map((option) => ({ ...option, value: Math.max(1, Math.round(option.value)) }))
      .filter((option) => {
        if (seen.has(option.value)) {
          return false
        }
        seen.add(option.value)
        return true
      })
  }, [feeRecommendations])

  const feeFetchedLabel = useMemo(() => {
    if (!feeFetchedAt) return null
    try {
      return new Date(feeFetchedAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return null
    }
  }, [feeFetchedAt])

  const currentFeeRateValue = useMemo(() => {
    const numeric = Number.parseFloat(feeRate)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null
    }
    return Math.round(numeric)
  }, [feeRate])

  const requestPsbt = useCallback(
    async (plan: TransactionPlan) => {
      const paymentPublicKey =
        typeof laserEyes.paymentPublicKey === 'string' ? laserEyes.paymentPublicKey : undefined
      const taprootPublicKey = typeof laserEyes.publicKey === 'string' ? laserEyes.publicKey : undefined

      const response = await fetch('/api/wallet/psbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: plan.inputs.map((input) => ({
            txid: input.txid,
            vout: input.vout,
            value: input.value,
          })),
          outputs: plan.outputs.map((output) => ({
            address: output.address,
            amount: output.amount,
          })),
          changeOutput: plan.changeOutput ?? null,
          paymentAddress,
          paymentPublicKey,
          taprootPublicKey,
          fee: plan.fee,
          vsize: plan.vsize,
        }),
      })

      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to generate PSBT')
      }

      return {
        psbt: payload.psbt as string,
        summary: payload.summary ?? null,
      }
    },
    [laserEyes.paymentPublicKey, laserEyes.publicKey, paymentAddress],
  )

  const handleTransfer = useCallback(async () => {
    if (transferState === 'working') {
      return
    }

    if (pendingSelectedStatus === 'checking') {
      const message = 'Wait for mempool verification to complete before transferring.'
      setTransferError(message)
      toast.error(message)
      return
    }

    if (hasPendingSelected) {
      const message = 'Remove or wait for pending inputs before transferring.'
      setTransferError(message)
      toast.error(message)
      return
    }

    if (!hasTransferableAssets) {
      const message = 'Select inscriptions to transfer.'
      setTransferError(message)
      toast.error(message)
      return
    }

    if (!requiredOutputsSatisfied || !parsedOutputDrafts.length) {
      const message = 'Enter destination addresses for each inscription.'
      setTransferError(message)
      toast.error(message)
      return
    }

    const feeRateValue = Number.parseFloat(feeRate)
    if (!Number.isFinite(feeRateValue) || feeRateValue <= 0) {
      const message = 'Enter a valid sat/vB fee rate.'
      setTransferError(message)
      toast.error(message)
      return
    }

    setTransferState('working')
    setTransferError(null)

    try {
      const normalizedInputs = selectedAssets.map((input) => ({ ...input, autoPayment: input.autoPayment ?? false }))
      const { plan, error } = computePlan(normalizedInputs, parsedOutputDrafts, feeRateValue)

      if (!plan || error) {
        throw new Error(error ?? 'Unable to prepare transaction plan.')
      }

      const { psbt } = await requestPsbt(plan)

      const { txid } = await signAndBroadcastPsbt(psbt, plan.feeRate)
      setTransferTxid(txid)
      setTransferState('success')
      setSelectedMap({})
      setDestinationMap({})
      toast.success(`Transfer complete. TXID ${txid.slice(0, 6)}…${txid.slice(-6)}`)
      void handleRefresh()
    } catch (error) {
      console.error('Transfer failed', error)
      const message = error instanceof Error ? error.message : 'Transfer failed'
      setTransferError(message)
      setTransferState('idle')
      toast.error(message)
    }
  }, [
    transferState,
    hasTransferableAssets,
    requiredOutputsSatisfied,
    parsedOutputDrafts,
    feeRate,
    selectedAssets,
    computePlan,
    requestPsbt,
    signAndBroadcastPsbt,
    pendingSelectedStatus,
    hasPendingSelected,
    toast,
    handleRefresh,
  ])

  const handleReset = useCallback(() => {
    setSelectedMap({})
    setDestinationMap({})
    setTransferError(null)
    setTransferTxid(null)
    setTransferState('idle')
    setFeeRateEdited(false)
    setPendingSelectedMap({})
    setPendingSelectedStatus('idle')
    setPendingSelectedError(null)
    void handleRefresh()
  }, [handleRefresh])

  const pendingCount =
    (ordinalAssets?.pending.length ?? 0) + (paymentAssets?.pending.length ?? 0)

  const openPicker = useCallback((type: AssetTabKey) => {
    setPickerType(type)
    setPickerPage((prev) => ({ ...prev, [type]: 0 }))
  }, [])

  const closePicker = useCallback(() => {
    setPickerType(null)
  }, [])

  const handlePickerPageChange = useCallback((type: AssetTabKey, nextPage: number) => {
    setPickerPage((prev) => ({ ...prev, [type]: nextPage }))
  }, [])

  const spendableModalList = useMemo(() => {
    const list = paymentAssets?.spendable ?? []
    return [...list].sort((a, b) => b.value - a.value)
  }, [paymentAssets?.spendable])

  const pickerLists = useMemo(() => {
    return {
      inscriptions: ordinalAssets?.inscriptions ?? [],
      runes: ordinalAssets?.runes ?? [],
      alkanes: ordinalAssets?.alkanes ?? [],
      spendable: spendableModalList,
    }
  }, [ordinalAssets, spendableModalList])

  useEffect(() => {
    if (!pickerType) return
    const list = pickerLists[pickerType] ?? []
    const totalPages = Math.max(1, Math.ceil(list.length / PICKER_PAGE_SIZE))
    setPickerPage((prev) => {
      const current = prev[pickerType] ?? 0
      if (current >= totalPages) {
        return { ...prev, [pickerType]: Math.max(0, totalPages - 1) }
      }
      return prev
    })
  }, [pickerLists, pickerType])

  const currentPickerPage = pickerType ? Math.min(pickerPage[pickerType] ?? 0, Math.max(0, Math.ceil((pickerLists[pickerType]?.length ?? 0) / PICKER_PAGE_SIZE) - 1)) : 0
  const pickerTotalPages = pickerType ? Math.max(1, Math.ceil((pickerLists[pickerType]?.length ?? 0) / PICKER_PAGE_SIZE)) : 0
  const pickerPageItems = pickerType
    ? pickerLists[pickerType]!.slice(currentPickerPage * PICKER_PAGE_SIZE, currentPickerPage * PICKER_PAGE_SIZE + PICKER_PAGE_SIZE)
    : []

  const pickerLabel = pickerType ? ASSET_TABS.find((tab) => tab.key === pickerType)?.label ?? '' : ''
  const pickerCount = pickerType ? pickerLists[pickerType]?.length ?? 0 : 0

  const handleToggleInscription = useCallback(
    (utxo: InscriptionUtxo) => {
      toggleSelection({
        category: 'inscriptions',
        outpoint: utxo.outpoint,
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        height: utxo.height,
        inscriptions: utxo.inscriptions,
      })
    },
    [toggleSelection],
  )

  const handleToggleRune = useCallback(
    (utxo: RuneBearingUtxo, category: 'runes' | 'alkanes') => {
      toggleSelection({
        category,
        outpoint: utxo.outpoint,
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        height: utxo.height,
        runeBalances: utxo.runeBalances,
      })
    },
    [toggleSelection],
  )

  const displayedFundingPlan = planPreview.status === 'ready' ? planPreview.plan : undefined
  const fundingTotalSats = displayedFundingPlan
    ? displayedFundingPlan.paymentInputs.reduce((sum, input) => sum + input.value, 0)
    : null
  const fundingFeeSats = displayedFundingPlan ? displayedFundingPlan.fee : null
  const fundingChangeSats = displayedFundingPlan?.changeOutput?.amount ?? 0
  const fundingChangeDestination = displayedFundingPlan?.changeOutput?.address
    ? truncateMiddle(displayedFundingPlan.changeOutput.address, 32)
    : paymentAddress
    ? truncateMiddle(paymentAddress, 32)
    : 'Payment wallet'
  const fundingNote = planPreview.status === 'ready' ? null : planPreview.message
  const fundingNoteSeverity = planPreview.status === 'error' ? 'border-red-500/50 text-red-200' : 'border-red-500/20 text-red-200/80'

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-stone-950 to-black px-4 py-10 text-zinc-200 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-10">
        <header className="space-y-4 rounded-3xl border border-red-500/40 bg-red-950/20 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-900/20 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.45em] text-red-100">
                <Grid3X3 className="h-3.5 w-3.5" />
                The Damned
              </div>
              <h1 className="text-3xl font-black uppercase tracking-[0.4em] text-red-100 md:text-4xl">
                Asset Manager
              </h1>
         
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-red-200/70">
                <BadgeCheck className="h-3 w-3" />
                {isConnected ? 'Wallet interface linked' : 'Connect wallet to sync automatically'}
                {isHolder && (
                  <>
                    <ShieldCheck className="h-3 w-3 text-emerald-300" /> Holder access verified
                  </>
                )}
              </div>
            </div>
            <div className="grid gap-3 rounded-2xl border border-red-500/30 bg-black/40 p-4 text-xs font-mono uppercase tracking-[0.3em] text-red-100">
              <div className="flex items-center justify-between gap-3">
                <span className="text-red-300/80">Ordinals Height</span>
                <span>{ordHeights.ord ?? '--'}</span>
              </div>
         
              <div className="flex items-center justify-between gap-3">
                <span className="text-red-300/80">Pending</span>
                <span>{pendingCount}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-red-500/30 bg-black/50 p-4 space-y-4">
            <div className="space-y-3">
              <SyncStatusRow
                label="Ordinal sync"
                loading={ordinalLoading || magicEdenLoading}
                count={ordinalAssetCount}
              />
              <SyncStatusRow label="Payment sync" loading={paymentLoading} count={paymentUtxoCount} />
            </div>

            {paymentAddress && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-black/60 px-4 py-2">
                <span className="text-xs uppercase tracking-[0.35em] text-red-200/70">Payment address</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg border border-red-500/30 bg-black/80 px-3 py-1 font-mono text-sm uppercase tracking-[0.25em] text-red-100">
                    {truncateMiddle(paymentAddress, 34)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopyPaymentAddress}
                    className="border-red-500/40 bg-red-900/20 text-red-200 hover:bg-red-900/30"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {copiedAddress ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleRefresh}
                className="border-red-500/60 bg-red-900/30 text-red-100 hover:bg-red-900/40"
                disabled={ordinalLoading || paymentLoading || (!ordinalAddress && !paymentAddress)}
              >
                {(ordinalLoading || paymentLoading) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </>
                )}
              </Button>
              <Button
                type="button"
                onClick={() => openPicker('inscriptions')}
                className="bg-red-600 text-sm font-semibold uppercase tracking-[0.3em] text-white hover:bg-red-500"
                disabled={!ordinalAssets?.inscriptions?.length}
              >
                Inscriptions ({tabCounts.inscriptions})
              </Button>
              <Button
                type="button"
                onClick={() => openPicker('spendable')}
                className="bg-emerald-600 text-sm font-semibold uppercase tracking-[0.3em] text-white hover:bg-emerald-500"
                disabled={!paymentAssets?.spendable?.length}
              >
                Pay UTXOs ({tabCounts.spendable})
              </Button>
              <Button
                type="button"
                onClick={() => openPicker('runes')}
                className="bg-sky-600 text-sm font-semibold uppercase tracking-[0.3em] text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
                disabled
              >
                Runes ({tabCounts.runes}) (Soon)
              </Button>
              <Button
                type="button"
                onClick={() => openPicker('alkanes')}
                className="bg-zinc-700 text-sm font-semibold uppercase tracking-[0.3em] text-zinc-200 cursor-not-allowed"
                disabled
              >
                Alkanes ({tabCounts.alkanes}) (Soon)
              </Button>
            </div>

            {(ordinalError || paymentError) && (
              <div className="space-y-2">
                {[ordinalError, paymentError]
                  .filter((message): message is string => Boolean(message))
                  .map((message, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-red-500/50 bg-red-900/30 p-3 text-xs text-red-200"
                    >
                      {message}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </header>

        {/* Asset selection handled via modal pickers */}


        <section className="space-y-5 rounded-3xl border border-red-500/40 bg-red-950/20 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold uppercase tracking-[0.4em] text-red-100">Transaction Builder Queue</h2>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.35em] text-red-200/80">
              <Layers3 className="h-3.5 w-3.5" />
              {selectedAssets.length} Inputs Selected
              <span className="rounded-full border border-red-400/30 bg-red-900/40 px-2 py-0.5 text-red-100">
                {formatSats(totalSelectedValue)}
              </span>
              <span className="rounded-full border border-red-400/30 bg-red-900/40 px-2 py-0.5 text-red-100">
                {formatBtc(totalSelectedValue)}
              </span>
              {pendingSelectedStatus === 'checking' && (
                <span className="rounded-full border border-amber-400/40 bg-amber-900/30 px-2 py-0.5 text-amber-200">
                  Verifying mempool…
                </span>
              )}
              {hasPendingSelected && (
                <span className="rounded-full border border-amber-500/60 bg-amber-900/40 px-2 py-0.5 text-amber-100">
                  Pending inputs {pendingSelectedCount}
                </span>
              )}
            </div>
          </div>

          {transferState === 'success' ? (
            <div className="space-y-4 rounded-2xl border border-emerald-500/40 bg-emerald-900/20 p-6">
              <div className="space-y-2 text-emerald-100">
                <h3 className="text-sm font-semibold uppercase tracking-[0.35em]">Transfer Complete</h3>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-100/80">
                  All selected inscriptions have been broadcast successfully.
                </p>
                {transferTxid && (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-900/30 p-3 font-mono text-[11px] uppercase tracking-[0.3em]">
                    <span>{truncateMiddle(transferTxid, 24)}</span>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-900/20 text-emerald-100 hover:bg-emerald-900/30"
                      onClick={() => window.open(`https://mempool.space/tx/${transferTxid}`, '_blank', 'noopener')}
                    >
                      View on mempool.space
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={handleReset}
                  className="bg-red-600 text-sm font-semibold uppercase tracking-[0.3em] text-white hover:bg-red-500"
                >
                  Start Over
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRefresh}
                  className="border-red-500/40 bg-red-900/20 text-red-200 hover:bg-red-900/30"
                >
                  Refresh Wallet
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 rounded-2xl border border-white/10 bg-black/35 p-4 text-[11px] font-mono uppercase tracking-[0.3em] text-red-200/80">
                <div className="flex items-center justify-between">
                  <span>Payment Funding</span>
                  <span className="text-red-100">
                    {fundingTotalSats != null ? formatSats(fundingTotalSats) : 'Awaiting plan'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Gas Cost</span>
                  <span className="text-red-100">
                    {fundingFeeSats != null ? formatSats(fundingFeeSats) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Change Back</span>
                  <span className="text-red-100">
                    {displayedFundingPlan ? formatSats(fundingChangeSats) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Change Destination</span>
                  <span className="text-red-100">
                    {displayedFundingPlan ? fundingChangeDestination : 'Awaiting plan'}
                  </span>
                </div>
                {fundingNote && (
                  <div className={`rounded-lg border ${fundingNoteSeverity} bg-black/50 p-2 text-[10px]`}>{fundingNote}</div>
                )}
              </div>

              {selectedAssets.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-sm text-red-200/70">
                  Select inscriptions, enter destination wallets, and press Transfer. The payment wallet will handle fees
                  automatically.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-4">
                    {destinationDrafts.map((draft) => {
                      const { asset, address, required, valid, pending } = draft
                      const primaryInscriptionId = asset.inscriptions?.[0] ?? null
                      const inscriptionMeta = primaryInscriptionId ? inscriptionMetadataMap[primaryInscriptionId] : undefined
                      const isInscriptionAsset = asset.category === 'inscriptions'
                      const borderClass = pending
                        ? 'border-amber-500/60'
                        : required && !valid
                        ? 'border-red-500/60'
                        : 'border-white/10'
                      const backgroundClass = pending ? 'bg-amber-950/30' : 'bg-black/35'

                      return (
                        <div
                          key={asset.outpoint}
                          className={`grid gap-4 rounded-2xl border ${borderClass} ${backgroundClass} p-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]`}
                        >
                          <div className="space-y-3">
                            <div className="flex gap-3">
                              {isInscriptionAsset && primaryInscriptionId ? (
                                <InscriptionPreviewPanel inscriptionId={primaryInscriptionId} size={96} interactive={false} />
                              ) : null}
                              <div className="flex-1 space-y-2">
                                <div className="flex flex-wrap items-center gap-2 text-xs font-mono uppercase tracking-[0.35em] text-red-100">
                                  <span className="rounded-full border border-red-500/40 bg-red-900/30 px-2 py-0.5 text-red-200">
                                    {asset.category.toUpperCase()}
                                  </span>
                                  <span>{formatSats(asset.value)}</span>
                                  {pending && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-900/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-100">
                                      Pending
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => toggleSelection(asset)}
                                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-red-400/70 bg-red-600/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-red-500 hover:text-white"
                                  >
                                    Remove
                                  </button>
                                </div>
                                {isInscriptionAsset && inscriptionMeta && (
                                  <div className="space-y-1 text-[11px] uppercase tracking-[0.3em] text-amber-200/80">
                                    {inscriptionMeta.name && <div className="truncate text-amber-100">{inscriptionMeta.name}</div>}
                                    {(inscriptionMeta.collectionName || inscriptionMeta.collectionSymbol) && (
                                      <div className="truncate text-amber-100/60">
                                        {inscriptionMeta.collectionName ?? 'Collection'}
                                        {inscriptionMeta.collectionSymbol ? ` · ${inscriptionMeta.collectionSymbol}` : ''}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="text-[11px] uppercase tracking-[0.35em] text-red-200/60">
                                  Height {asset.height ?? '—'}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-[0.35em] text-red-200/70">
                              Destination Address {required ? '(required)' : '(optional)'}
                            </Label>
                            <Input
                              placeholder="bc1p..."
                              value={address}
                              onChange={(event) => updateDestination(asset.outpoint, 'address', event.target.value)}
                              className={`border-red-500/40 bg-black/60 font-mono text-xs uppercase tracking-[0.3em] text-red-100 ${
                                required && !valid ? 'ring-1 ring-red-500/60' : ''
                              }`}
                            />
                            <div className="rounded-lg border border-red-500/20 bg-black/40 p-2 text-[11px] uppercase tracking-[0.3em] text-red-200/70">
                              Amount {formatSats(asset.value)} · full inscription transfer
                            </div>
                            {required && !valid && (
                              <div className="rounded-lg border border-red-500/40 bg-red-900/30 p-2 text-[11px] uppercase tracking-[0.3em] text-red-100">
                                Destination address required for this asset.
                              </div>
                            )}
                            {pending && (
                              <div className="rounded-lg border border-amber-500/50 bg-amber-900/30 p-2 text-[11px] uppercase tracking-[0.3em] text-amber-100">
                                Input transaction still pending confirmation. Wait or remove this UTXO before transferring.
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4">
                      <h3 className="text-sm font-bold uppercase tracking-[0.35em] text-red-200">Fee</h3>
                      <div className="space-y-1">
                        <Label htmlFor="fee-rate" className="text-xs uppercase tracking-[0.35em] text-red-200/70">
                          Fee Rate (sat/vB)
                        </Label>
                        <Input
                          id="fee-rate"
                          value={feeRate}
                          onChange={(event) =>
                            handleFeeRateChange(event.target.value.replace(/[^0-9.]/g, ''))
                          }
                          className="w-full border-red-500/40 bg-black/60 font-mono text-sm uppercase tracking-[0.25em] text-red-100"
                        />
                      </div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-red-200/70">
                        Change outputs and fee deductions are applied automatically when you transfer.
                      </p>
                      <div className="space-y-2">
                        {feeFetchStatus === 'loading' && (
                          <p className="text-[10px] uppercase tracking-[0.3em] text-red-200/60">
                            Syncing mempool fee estimates…
                          </p>
                        )}
                        {feeFetchStatus === 'error' && (
                          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-300">
                            Unable to reach mempool.space right now. Using your custom rate.
                          </p>
                        )}
                        {feeShortcutOptions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {feeShortcutOptions.map((option) => {
                              const isActive = currentFeeRateValue === option.value
                              return (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() => applyFeeShortcut(option.value)}
                                  className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] transition ${
                                    isActive
                                      ? 'border-emerald-500/60 bg-emerald-900/30 text-emerald-200'
                                      : 'border-red-500/30 bg-red-900/20 text-red-200 hover:border-red-400/40 hover:bg-red-900/30'
                                  }`}
                                >
                                  {option.label} · {option.value} sat/vB
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {feeFetchedLabel && feeFetchStatus === 'success' && (
                          <p className="text-[10px] uppercase tracking-[0.3em] text-red-200/50">
                            Mempool snapshot: {feeFetchedLabel}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4">
                      <h3 className="text-sm font-bold uppercase tracking-[0.35em] text-red-200">Funding Preview</h3>
                      <div className="space-y-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-200/80">
                        <div className="flex items-center justify-between">
                          <span>Payment funding</span>
                          <span className="text-red-100">
                            {fundingTotalSats != null ? formatSats(fundingTotalSats) : 'Awaiting plan'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Gas cost</span>
                          <span className="text-red-100">{fundingFeeSats != null ? formatSats(fundingFeeSats) : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Change back</span>
                          <span className="text-red-100">
                            {displayedFundingPlan ? formatSats(fundingChangeSats) : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Change destination</span>
                          <span className="text-red-100">
                            {displayedFundingPlan ? fundingChangeDestination : 'Awaiting plan'}
                          </span>
                        </div>
                        {fundingNote && (
                          <div className={`rounded-lg border ${fundingNoteSeverity} bg-black/50 p-2 text-[10px]`}>
                            {fundingNote}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={handleTransfer}
                    disabled={!readyForTransfer || transferState === 'working'}
                    className={`text-sm font-semibold uppercase tracking-[0.3em] text-white ${
                      transferState === 'working' || !readyForTransfer
                        ? 'bg-red-600/40 opacity-70'
                        : 'bg-red-600 hover:bg-red-500'
                    }`}
                  >
                    {transferState === 'working' ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Transferring…
                      </>
                    ) : (
                      'Transfer'
                    )}
                  </Button>
                </div>
                <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-red-200/70">
                  {pendingSelectedStatus === 'checking'
                    ? 'Verifying mempool status…'
                    : hasPendingSelected
                    ? 'Pending inputs detected'
                    : readyForTransfer
                    ? `${parsedOutputDrafts.length} outputs ready`
                    : 'Enter destination addresses'}
                </div>
              </div>
            <div className="space-y-2">
              {pendingSelectedStatus === 'checking' && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-3 text-xs uppercase tracking-[0.3em] text-amber-200">
                  Checking mempool status for selected inputs…
                </div>
              )}
              {hasPendingSelected && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-900/30 p-3 text-xs uppercase tracking-[0.3em] text-amber-100">
                  Pending inputs detected. Wait for confirmation or remove the highlighted UTXOs before transferring.
                </div>
              )}
              {pendingSelectedStatus === 'error' && pendingSelectedError && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-900/20 p-3 text-xs uppercase tracking-[0.3em] text-amber-100">
                  Unable to verify mempool status: {pendingSelectedError}
                </div>
              )}
            </div>
              {transferError && (
                <div className="rounded-lg border border-red-500/50 bg-red-900/30 p-3 text-xs text-red-200">{transferError}</div>
              )}
            </>
          )}

        </section>

        {pickerType && (
          <AssetPickerModal
            type={pickerType}
            label={pickerLabel}
            count={pickerCount}
            page={currentPickerPage}
            totalPages={pickerTotalPages}
            items={pickerPageItems}
            selectedMap={selectedMap}
            inscriptionMetadata={inscriptionMetadataMap}
            onToggleInscription={handleToggleInscription}
            onToggleRune={handleToggleRune}
            onClose={closePicker}
            onPageChange={(nextPage) => handlePickerPageChange(pickerType, nextPage)}
            onPreview={handlePreview}
          />
        )}
      </div>
    </main>
  )
}

function InscriptionTab({
  inscriptions,
  selectedMap,
  metadata,
  onToggle,
  onPreview,
}: {
  inscriptions: InscriptionUtxo[]
  selectedMap: Record<string, SelectedAsset>
  metadata: Record<string, MagicEdenMetadata>
  onToggle: (utxo: InscriptionUtxo) => void
  onPreview: (id: string) => void
}) {
  if (inscriptions.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/30 p-10 text-center text-sm text-red-200/70">
        No inscriptions discovered for this address. Once they sync in, you can preview Ordinals content and stage them for transactions here.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
      {inscriptions.map((utxo) => {
        const checked = Boolean(selectedMap[utxo.outpoint])
        const primaryInscriptionId = utxo.inscriptions[0]
        const meta = primaryInscriptionId ? metadata[primaryInscriptionId] : undefined
        return (
          <button
            key={utxo.outpoint}
            type="button"
            onClick={() => onToggle(utxo)}
            aria-pressed={checked}
            className={`group relative flex flex-col items-center gap-3 rounded-2xl border bg-black/40 p-3 transition ${
              checked ? 'border-red-400/70 shadow-[0_0_20px_rgba(248,113,113,0.35)]' : 'border-red-500/20'
            }`}
          >
            <div className="absolute right-3 top-3 h-3 w-3 rounded-full border border-red-400/30 bg-black/50">
              <div
                className={`h-full w-full rounded-full transition ${checked ? 'bg-red-400' : 'bg-transparent group-hover:bg-red-300/70'}`}
              />
            </div>

            {primaryInscriptionId ? (
              <InscriptionPreviewPanel inscriptionId={primaryInscriptionId} size={120} interactive={false} />
            ) : (
              <div className="flex h-[120px] w-[120px] items-center justify-center rounded-xl border border-amber-500/30 bg-black/50 text-[11px] uppercase tracking-[0.3em] text-amber-100">
                No preview
              </div>
            )}

            <div className="w-full space-y-1 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100">
              {meta?.name && <div className="truncate text-amber-200/90">{meta.name}</div>}
              {meta?.collectionName && (
                <div className="truncate text-amber-100/60">
               
                  {meta.collectionSymbol ?  `${meta.collectionSymbol}` : ''}
                </div>
              )}
             <div className="flex items-center justify-between text-red-200/60">
                <span>{formatSats(utxo.value)}</span>
                
              </div>
             
            </div>

            <div className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.3em] text-red-300/80">
              <span>{utxo.inscriptions.length}</span>
 
            </div>
          </button>
        )
      })}
    </div>
  )
}

function RuneTab({
  runes,
  selectedMap,
  category,
  onToggle,
}: {
  runes: RuneBearingUtxo[]
  selectedMap: Record<string, SelectedAsset>
  category: AssetTabKey
  onToggle: (utxo: RuneBearingUtxo) => void
}) {
  if (runes.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/30 p-10 text-center text-sm text-red-200/70">
        No {category === 'runes' ? 'rune balances' : 'alkane balances'} found in this wallet. Sandshrew will sync them automatically when they land.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {runes.map((utxo) => {
        const checked = Boolean(selectedMap[utxo.outpoint])
        return (
          <AssetRow key={utxo.outpoint} checked={checked} onToggle={() => onToggle(utxo)}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono uppercase tracking-[0.3em] text-red-100">
              <span>{truncateMiddle(utxo.outpoint, 28)}</span>
              <span>{formatSats(utxo.value)}</span>
              <span>Height {utxo.height ?? '—'}</span>
              <span>Vout {utxo.vout}</span>
              <span>{utxo.runeBalances.length} Balances</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {utxo.runeBalances.map((balance) => (
                <RuneBalancePill key={`${utxo.outpoint}-${balance.symbol}-${balance.balance.toString()}`} balance={balance} />
              ))}
            </div>
          </AssetRow>
        )
      })}
    </div>
  )
}

function SpendableTab({
  spendable,
  selectedMap,
  onToggle,
  sorting = 'desc',
  colorize = false,
  selectable = true,
}: {
  spendable: CategorisedWalletAssets['spendable']
  selectedMap: Record<string, SelectedAsset>
  onToggle?: (utxo: CategorisedWalletAssets['spendable'][number]) => void
  sorting?: 'asc' | 'desc'
  colorize?: boolean
  selectable?: boolean
}) {
  if (spendable.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/30 p-10 text-center text-sm text-red-200/70">
        No cardinal UTXOs available. Once fresh sats arrive, they will populate here for fee padding and change management.
      </div>
    )
  }

  const sorted = [...spendable].sort((a, b) => (sorting === 'asc' ? a.value - b.value : b.value - a.value))

  const getRowClass = (value: number) => {
    if (!colorize) return ''
    if (value <= 600) {
      return 'border-red-500/80 bg-red-900/60'
    }
    if (value <= 2_000) {
      return 'border-amber-500/60 bg-amber-900/40'
    }
    if (value <= 20_000) {
      return 'border-emerald-400/70 bg-emerald-800/40'
    }
    if (value <= 100_000) {
      return 'border-emerald-300/60 bg-emerald-700/30'
    }
    return 'border-emerald-200/60 bg-emerald-600/25'
  }

  return (
    <div className="space-y-4">
      {sorted.map((utxo) => {
        const checked = Boolean(selectedMap[utxo.outpoint])
        const rowClass = getRowClass(utxo.value)
        const handleToggle = onToggle ? () => onToggle(utxo) : undefined
        return (
          <AssetRow
            key={utxo.outpoint}
            checked={checked}
            onToggle={handleToggle}
            className={rowClass}
            selectable={selectable && Boolean(handleToggle)}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono uppercase tracking-[0.3em] text-red-100">
              <span>{truncateMiddle(utxo.outpoint, 28)}</span>
              <span>{formatSats(utxo.value)}</span>
              <span>{formatBtc(utxo.value)}</span>
              <span>Height {utxo.height ?? '—'}</span>
              <span>Vout {utxo.vout}</span>
            </div>
          </AssetRow>
        )
      })}
    </div>
  )
}

function InscriptionPreviewModal({
  inscriptionId,
  metadata,
  loading,
  error,
  onClose,
}: {
  inscriptionId: string
  metadata: OrdinalContentMetadata | null
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const contentUrl = `https://ordinals.com/content/${encodeURIComponent(inscriptionId)}`
  const contentType = metadata?.contentType || ''
  const isHtml = /text\/html/i.test(contentType)
  const isSvg = /image\/svg\+xml/i.test(contentType)
  const isImage = /^image\//i.test(contentType)

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur">
      <div className="relative flex w-full max-w-4xl flex-col gap-4 rounded-3xl border border-amber-500/40 bg-black/90 p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold uppercase tracking-[0.35em] text-amber-100">Inscription Preview</h3>
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-amber-200">
              {truncateMiddle(inscriptionId, 32)} · {metadata?.contentType || 'Detecting…'}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-amber-500/60 bg-amber-900/30 text-amber-100 hover:bg-amber-900/40"
          >
            Done
          </Button>
        </div>

        <div className="min-h-[320px] rounded-2xl border border-amber-500/30 bg-black/40 p-4">
          {loading && (
            <div className="flex h-full items-center justify-center text-amber-200">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}

          {!loading && error && (
            <div className="text-sm text-amber-200/80">Failed to load metadata: {error}</div>
          )}

          {!loading && !error && metadata && (
            <>
              {isHtml ? (
                <iframe
                  src={contentUrl}
                  className="h-[420px] w-full rounded-xl border border-amber-500/30"
                  sandbox="allow-scripts allow-same-origin"
                  title={`Ordinals HTML ${inscriptionId}`}
                />
              ) : isImage || isSvg ? (
                <Image
                  src={contentUrl}
                  alt={`Inscription ${inscriptionId}`}
                  width={800}
                  height={800}
                  unoptimized
                  className="mx-auto max-h-[460px] w-auto rounded-xl border border-amber-500/30 object-contain"
                />
              ) : (
                <div className="space-y-3 text-sm text-amber-100">
                  <p>This inscription content type is not previewable in-line.</p>
                  <a
                    href={contentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-900/30 px-4 py-2 text-xs font-mono uppercase tracking-[0.3em] text-amber-100 hover:border-amber-400 hover:bg-amber-900/40"
                  >
                    <ExternalLinkIcon className="h-3 w-3" />
                    Open on ordinals.com
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 13v6a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6M15 3h6m0 0v6m0-6L10 14" />
    </svg>
  )
}

function AssetPickerModal({
  type,
  label,
  count,
  page,
  totalPages,
  items,
  selectedMap,
  inscriptionMetadata,
  onToggleInscription,
  onToggleRune,
  onToggleSpendable,
  onClose,
  onPageChange,
  onPreview,
}: {
  type: AssetTabKey
  label: string
  count: number
  page: number
  totalPages: number
  items: unknown[]
  selectedMap: Record<string, SelectedAsset>
  inscriptionMetadata: Record<string, MagicEdenMetadata>
  onToggleInscription: (utxo: InscriptionUtxo) => void
  onToggleRune: (utxo: RuneBearingUtxo, category: 'runes' | 'alkanes') => void
  onToggleSpendable?: (utxo: CategorisedWalletAssets['spendable'][number]) => void
  onClose: () => void
  onPageChange: (page: number) => void
  onPreview: (id: string) => void
}) {
  const formattedLabel = label || type.charAt(0).toUpperCase() + type.slice(1)
  const hasItems = items.length > 0

  return (
    <div
      className="fixed inset-0 z-[998] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-5xl flex-col gap-4 rounded-3xl border border-red-500/40 bg-black/90 p-6 shadow-[0_0_60px_rgba(248,113,113,0.15)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold uppercase tracking-[0.35em] text-red-100">{formattedLabel}</h3>
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-red-200/80">
              {count} total · Page {page + 1} of {Math.max(totalPages, 1)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onPageChange(Math.max(0, page - 1))}
              className="border-red-500/40 bg-red-900/20 text-red-200 hover:bg-red-900/30"
              disabled={page === 0}
            >
              Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
              className="border-red-500/40 bg-red-900/20 text-red-200 hover:bg-red-900/30"
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-red-500/60 bg-red-900/30 text-red-100 hover:bg-red-900/40"
            >
              Done
            </Button>
          </div>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {!hasItems && (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-10 text-center text-sm text-red-200/70">
              No {formattedLabel.toLowerCase()} discovered for this wallet.
            </div>
          )}

          {hasItems && type === 'inscriptions' && (
            <InscriptionTab
              inscriptions={items as InscriptionUtxo[]}
              selectedMap={selectedMap}
              metadata={inscriptionMetadata}
              onToggle={onToggleInscription}
              onPreview={onPreview}
            />
          )}

          {hasItems && type === 'runes' && (
            <RuneTab
              runes={items as RuneBearingUtxo[]}
              selectedMap={selectedMap}
              category="runes"
              onToggle={(utxo) => onToggleRune(utxo, 'runes')}
            />
          )}

          {hasItems && type === 'alkanes' && (
            <RuneTab
              runes={items as RuneBearingUtxo[]}
              selectedMap={selectedMap}
              category="alkanes"
              onToggle={(utxo) => onToggleRune(utxo, 'alkanes')}
            />
          )}

          {hasItems && type === 'spendable' && (
            <SpendableTab
              spendable={items as CategorisedWalletAssets['spendable']}
              selectedMap={selectedMap}
              sorting="desc"
              colorize
              selectable={Boolean(onToggleSpendable)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function SyncStatusRow({
  label,
  loading,
  count,
}: {
  label: string
  loading: boolean
  count: number
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-red-200/70">
        <span>{label}</span>
        <span className={loading ? 'text-red-300' : 'text-emerald-300'}>
          {loading ? 'Syncing…' : `${count} ready`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-red-900/30">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            loading ? 'w-1/2 animate-pulse bg-red-500/60' : 'w-full bg-emerald-500/70'
          }`}
        />
      </div>
    </div>
  )
}

function InscriptionPreviewPanel({ inscriptionId, size = 120, interactive = true }: { inscriptionId: string; size?: number; interactive?: boolean }) {
  const [metadata, setMetadata] = useState<OrdinalContentMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!inscriptionId) return
    const controller = new AbortController()

    async function loadMetadata() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/ordinals/content/${encodeURIComponent(inscriptionId)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = await response.json()
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Unable to fetch inscription metadata')
        }
        setMetadata(payload.data as OrdinalContentMetadata)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        console.error('Failed to load inscription preview metadata', err)
        setError(err instanceof Error ? err.message : 'Failed to load metadata')
      } finally {
        setLoading(false)
      }
    }

    loadMetadata()

    return () => controller.abort()
  }, [inscriptionId])

  const contentUrl = `https://ordinals.com/content/${encodeURIComponent(inscriptionId)}`
  const contentType = metadata?.contentType?.toLowerCase() ?? ''
  const isHtml = contentType.includes('text/html')
  const isSvg = contentType.includes('image/svg')
  const isImage = contentType.startsWith('image/') && !isSvg
  const isText = contentType.startsWith('text/') && !isHtml

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-amber-500/30 bg-black/60 ${interactive ? '' : 'pointer-events-none'}`}
      style={{ width: size, height: size }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-amber-200">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[10px] font-mono uppercase tracking-[0.3em] text-red-200/80">
          {error}
        </div>
      )}

      {!loading && !error && metadata && (
        <>
          {isHtml && (
            <iframe
              src={contentUrl}
              title={`Inscription ${inscriptionId}`}
              sandbox="allow-scripts allow-same-origin"
              className="absolute inset-0 h-full w-full border-0"
              style={interactive ? undefined : { pointerEvents: 'none' }}
            />
          )}
          {isSvg && (
            <iframe
              src={contentUrl}
              title={`Inscription ${inscriptionId}`}
              className="absolute inset-0 h-full w-full border-0 bg-black"
              style={interactive ? undefined : { pointerEvents: 'none' }}
            />
          )}
          {isImage && (
            <Image
              src={contentUrl}
              alt={`Inscription ${inscriptionId}`}
              fill
              sizes={`${size}px`}
              className="object-cover"
              unoptimized
              style={interactive ? undefined : { pointerEvents: 'none' }}
            />
          )}
          {isText && (
            <iframe
              src={contentUrl}
              title={`Inscription ${inscriptionId}`}
              className="absolute inset-0 h-full w-full border-0 bg-black text-left text-amber-100"
              style={interactive ? undefined : { pointerEvents: 'none' }}
            />
          )}
          {!isHtml && !isSvg && !isImage && !isText && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-[10px] font-mono uppercase tracking-[0.3em] text-amber-100"
              style={interactive ? undefined : { pointerEvents: 'none' }}
            >
              <FileText className="h-5 w-5" />
              <span>{metadata.contentType || 'Unknown content'}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

