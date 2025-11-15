'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Rocket, Sparkles, ShieldCheck, Info, ArrowUpRight, AlertCircle, CheckCircle2, Gauge, ArrowRight } from 'lucide-react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useLaserEyes } from '@omnisat/lasereyes'
import { InscriptionService } from '@/services/inscription-service'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import BackgroundMusic from '@/components/BackgroundMusic'
import LaserEyesWrapper from '@/components/LaserEyesWrapper'

type SpeedupStrategy = 'rbf' | 'cpfp' | 'hybrid'

interface TransactionInput {
  index: number
  txid: string
  vout: number
  sequence: number
  value: number
  address: string | null
  belongsToWallet: boolean
}

interface TransactionOutput {
  index: number
  address: string
  value: number
  spent: boolean
  belongsToWallet: boolean
}

interface StrategyDetails {
  available: boolean
  reasons: string[]
}

interface StrategyAssessment {
  recommended: SpeedupStrategy | 'none'
  targetFeeRate: number
  childFeeNeeded: number
  anchorValue: number
  requiredRbfFee: number
  availableRbfLiquidity: number
  walletControlsAllInputs: boolean
  requiresHybrid: boolean
  strategies: {
    rbf: StrategyDetails
    cpfp: StrategyDetails
    hybrid: StrategyDetails
  }
}

const MIN_SIMPLE_CPFP_VALUE = 546
const CHILD_TX_VSIZE = 140
const STRATEGY_COPY: Record<SpeedupStrategy, { title: string; blurb: string; accent: string }> = {
  rbf: {
    title: 'Replace-By-Fee',
    blurb: 'Reuse the original inputs and lift the miner fee by trimming wallet change.',
    accent: 'border-sky-400/40 bg-sky-500/10'
  },
  cpfp: {
    title: 'Pure CPFP',
    blurb: 'Spend the stuck output directly and recycle part of it into additional fees.',
    accent: 'border-violet-400/30 bg-violet-500/10'
  },
  hybrid: {
    title: 'Hybrid CPFP',
    blurb: 'Anchor the reveal output, add a fresh wallet UTXO, and pay the gap in one swoop.',
    accent: 'border-emerald-400/30 bg-emerald-500/10'
  }
}

const TOOL_LINKS = [
  { name: 'Transaction Speedup', href: '/tools/speedup' },
  { name: 'Cancel Transaction', href: '/tools/cancel' },
  { name: 'Sat Recovery', href: '/tools/sat-recovery' },
]

const formatRate = (value: number | null | undefined, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--'

const PRESERVE_ANCHOR_THRESHOLD = 600

type RevalidateResult =
  | { ok: true; transaction: ParsedTransaction; estimate: CpfpEstimate | null }
  | { ok: false }

interface ParsedTransaction {
  txid: string
  status: 'confirmed' | 'unconfirmed' | 'not_found'
  fee: number
  feeRate: number
  vsize: number
  optInRbf: boolean
  inputs: TransactionInput[]
  outputs: TransactionOutput[]
  userOutput?: {
    index: number
    address: string
    value: number
  }
}

interface CpfpEstimate {
  parentFee: number
  parentSize: number
  parentFeeRate: number
  childSize: number
  recommendedChildFee: number
  recommendedTotalFee: number
  recommendedCombinedFeeRate: number
  userReceives: number
}

function SpeedupPage() {
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
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#03040e]">
            <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
          </div>
        }
      >
        <SpeedupPageContent initialHolder={isHolder} />
      </Suspense>
    </LaserEyesWrapper>
  )
}

interface SpeedupPageContentProps {
  initialHolder?: boolean
}

function SpeedupPageContent({ initialHolder }: SpeedupPageContentProps) {
  const { isConnected, currentAddress, client } = useWallet()
  const laserEyes = useLaserEyes() as Partial<{
    paymentAddress: string
    paymentPublicKey: string
    publicKey: string
  }>
  const { paymentAddress, paymentPublicKey, publicKey } = laserEyes
  const toast = useToast()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as any).InscriptionService = InscriptionService
    }
  }, [])

  const [txid, setTxid] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsedTx, setParsedTx] = useState<ParsedTransaction | null>(null)
  const [estimate, setEstimate] = useState<CpfpEstimate | null>(null)
  const [analysis, setAnalysis] = useState<StrategyAssessment | null>(null)
  const [selectedStrategy, setSelectedStrategy] = useState<SpeedupStrategy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [customFeeRate, setCustomFeeRate] = useState<number>(5)
  const [broadcasting, setBroadcasting] = useState(false)
  const [successInfo, setSuccessInfo] = useState<{ txid: string; type: 'rbf' | 'cpfp' } | null>(null)
  const [holderStatus, setHolderStatus] = useState<'unknown' | 'checking' | 'holder' | 'not-holder' | 'error'>(
    initialHolder ? 'holder' : 'unknown'
  )
  const [holderMessage, setHolderMessage] = useState<string | null>(null)

  const holderAllowed = holderStatus === 'holder'

  const deriveStrategy = useCallback(
    (tx: ParsedTransaction, estimateResult: CpfpEstimate | null, targetRate: number): StrategyAssessment => {
      const isUnconfirmed = tx.status === 'unconfirmed'
      const walletInputs = tx.inputs.filter((input) => input.belongsToWallet)
      const walletOutputs = tx.outputs.filter((output) => output.belongsToWallet && !output.spent)
      const anchorOutput = tx.userOutput
        ? walletOutputs.find((output) => output.index === tx.userOutput!.index) || null
        : null
      const anchorValue = anchorOutput?.value ?? tx.userOutput?.value ?? 0
      const requiredRbfFee = Math.max(Math.ceil(tx.vsize * targetRate) - tx.fee, 0)
      const availableRbfLiquidity = walletOutputs.reduce((sum, output) => {
        const spendable = Math.max(0, output.value - MIN_SIMPLE_CPFP_VALUE)
        return sum + spendable
      }, 0)

      const rbfReasons: string[] = []
      const cpfpReasons: string[] = []
      const hybridReasons: string[] = []

      let canRbf = true
      if (!isUnconfirmed) {
        canRbf = false
        rbfReasons.push('Transaction already confirmed')
      }
      if (canRbf && !tx.optInRbf) {
        canRbf = false
        rbfReasons.push('Parent transaction was not broadcast with RBF enabled')
      }
      if (canRbf && walletInputs.length !== tx.inputs.length) {
        canRbf = false
        rbfReasons.push('Some inputs are controlled by a different wallet')
      }
      if (canRbf && requiredRbfFee <= 0) {
        canRbf = false
        rbfReasons.push('Target fee rate does not exceed current fee rate')
      }
      if (canRbf && availableRbfLiquidity < requiredRbfFee) {
        canRbf = false
        rbfReasons.push(`Need ${requiredRbfFee} sats from change but only ${availableRbfLiquidity} sats are available`)
      }

      const fallbackChildFee = Math.max(Math.ceil((tx.vsize + CHILD_TX_VSIZE) * targetRate) - tx.fee, 330)
      const childFeeNeeded = estimateResult?.recommendedChildFee ?? fallbackChildFee

      let canSimpleCpfp = true
      if (!isUnconfirmed) {
        canSimpleCpfp = false
        cpfpReasons.push('Transaction already confirmed')
      }
      if (canSimpleCpfp && !anchorOutput) {
        canSimpleCpfp = false
        cpfpReasons.push('No spendable output from this transaction belongs to your wallet')
      }
      if (canSimpleCpfp && anchorValue - MIN_SIMPLE_CPFP_VALUE < childFeeNeeded) {
        canSimpleCpfp = false
        cpfpReasons.push(`Need ${childFeeNeeded} sats but only ${Math.max(anchorValue - MIN_SIMPLE_CPFP_VALUE, 0)} sats available after keeping ${MIN_SIMPLE_CPFP_VALUE}`)
      }

      let canHybridCpfp = true
      if (!isUnconfirmed) {
        canHybridCpfp = false
        hybridReasons.push('Transaction already confirmed')
      }
      if (canHybridCpfp && !anchorOutput) {
        canHybridCpfp = false
        hybridReasons.push('No output available to anchor a CPFP child transaction')
      }

      const requiresHybrid = canHybridCpfp && !canSimpleCpfp

      const strategies = {
        rbf: { available: canRbf, reasons: canRbf ? [] : rbfReasons },
        cpfp: { available: canSimpleCpfp, reasons: canSimpleCpfp ? [] : cpfpReasons },
        hybrid: { available: canHybridCpfp, reasons: canHybridCpfp ? [] : hybridReasons }
      }

      let recommended: StrategyAssessment['recommended'] = 'none'
      if (strategies.rbf.available) {
        recommended = 'rbf'
      } else if (strategies.cpfp.available) {
        recommended = 'cpfp'
      } else if (strategies.hybrid.available) {
        recommended = 'hybrid'
      }

      return {
        recommended,
        targetFeeRate: targetRate,
        childFeeNeeded,
        anchorValue,
        requiredRbfFee,
        availableRbfLiquidity,
        walletControlsAllInputs: walletInputs.length === tx.inputs.length,
        requiresHybrid,
        strategies
      }
    },
    []
  )

  const signAndBroadcastPsbt = useCallback(
    async (psbtBase64Input: string) => {
      if (!client) {
        throw new Error('Wallet client is not available for signing.')
      }

      let psbtBase64 = psbtBase64Input
      const signedPsbt = await client.signPsbt(psbtBase64Input, true, false)

      if (typeof signedPsbt === 'object' && signedPsbt !== null) {
        if ('signedPsbtBase64' in signedPsbt) {
          psbtBase64 = signedPsbt.signedPsbtBase64 as string
        } else if ('signedPsbtHex' in signedPsbt) {
          psbtBase64 = Buffer.from((signedPsbt as any).signedPsbtHex, 'hex').toString('base64')
        } else {
          psbtBase64 = (signedPsbt as any).toString()
        }
      } else {
        psbtBase64 = signedPsbt as string
      }

      const bitcoin = await import('bitcoinjs-lib')
      const psbt = bitcoin.Psbt.fromBase64(psbtBase64)
      const txHex = psbt.extractTransaction().toHex()

      const broadcastResponse = await fetch('https://mempool.space/api/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: txHex
      })

      if (!broadcastResponse.ok) {
        const errorText = await broadcastResponse.text()
        throw new Error(`Broadcast failed: ${errorText}`)
      }

      const txid = await broadcastResponse.text()
      return typeof txid === 'string' ? txid : String(txid)
    },
    [client]
  )

  useEffect(() => {
    if (!parsedTx) {
      setAnalysis(null)
      setSelectedStrategy(null)
      return
    }

    const nextAnalysis = deriveStrategy(parsedTx, estimate, customFeeRate)
    setAnalysis(nextAnalysis)

    setSelectedStrategy((current) => {
      if (current && nextAnalysis.strategies[current]?.available) {
        return current
      }

      if (nextAnalysis.recommended !== 'none') {
        const recommendedStrategy = nextAnalysis.recommended as SpeedupStrategy
        if (nextAnalysis.strategies[recommendedStrategy]?.available) {
          return recommendedStrategy
        }
      }

      const fallback = (['rbf', 'cpfp', 'hybrid'] as SpeedupStrategy[]).find(
        (strategy) => nextAnalysis.strategies[strategy].available
      )
      return fallback ?? null
    })
  }, [parsedTx, estimate, customFeeRate, deriveStrategy])

  const recalculateEstimate = useCallback((baseTx: ParsedTransaction, targetFeeRate: number): CpfpEstimate => {
    const parentFee = baseTx.fee
    const parentSize = baseTx.vsize
    const parentFeeRate = baseTx.feeRate
    const childSize = 140

    const totalSize = parentSize + childSize
    const totalFeeNeeded = Math.ceil(totalSize * targetFeeRate)
    const childFee = totalFeeNeeded - parentFee
    const combinedFeeRate = totalFeeNeeded / totalSize
    const userReceives = baseTx.userOutput ? baseTx.userOutput.value - childFee : 0

    return {
      parentFee,
      parentSize,
      parentFeeRate,
      childSize,
      recommendedChildFee: Math.max(childFee, 330),
      recommendedTotalFee: totalFeeNeeded,
      recommendedCombinedFeeRate: combinedFeeRate,
      userReceives: Math.max(userReceives, 330)
    }
  }, [])

  useEffect(() => {
    if (parsedTx && customFeeRate > 0) {
      const newEstimate = recalculateEstimate(parsedTx, customFeeRate)
      setEstimate(newEstimate)
    }
  }, [customFeeRate, parsedTx, recalculateEstimate])

  useEffect(() => {
    if (!isConnected || (!currentAddress && !paymentAddress)) {
      setHolderStatus(initialHolder ? 'holder' : 'unknown')
      setHolderMessage(null)
      return
    }

    if (initialHolder) {
      setHolderStatus('holder')
      setHolderMessage(null)
      return
    }

    const address = paymentAddress || currentAddress
    if (!address) return

    let cancelled = false
    setHolderStatus('checking')
    setHolderMessage(null)

    fetch(`/api/magic-eden?ownerAddress=${encodeURIComponent(address)}&collectionSymbol=the-damned`)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `Magic Eden check failed (${res.status})`)
        }
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        let total = 0
        if (typeof data.total === 'number') total = data.total
        else if (Array.isArray(data.tokens)) total = data.tokens.length
        else if (Array.isArray(data)) total = data.length
        else if (typeof data.count === 'number') total = data.count
        const isHolderWallet = total > 0
        setHolderStatus(isHolderWallet ? 'holder' : 'not-holder')
        if (!isHolderWallet) {
          setHolderMessage('Tools are restricted to The Damned holders. Hold an ordinal at your connected address to continue.')
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Holder check failed:', err)
        setHolderStatus('error')
        setHolderMessage('Unable to verify holder status. Please retry shortly.')
      })

    return () => {
      cancelled = true
    }
  }, [isConnected, currentAddress, paymentAddress, initialHolder])

  const fetchTransactionWithTxid = useCallback(
    async (transactionId: string) => {
      if (!transactionId || transactionId.length !== 64) {
        const errorMsg = 'Please enter a valid transaction ID (64 characters)'
        setError(errorMsg)
        toast.error(`Invalid transaction: ${errorMsg}`)
        return
      }
      if (!currentAddress) {
        const errorMsg = 'Please connect your wallet first'
        setError(errorMsg)
        toast.error(errorMsg)
        return
      }

      if (!holderAllowed) {
        const msg = 'Only verified holders can use this tool.'
        setError(msg)
        toast.error(msg)
        return
      }

      setLoading(true)
      setError(null)
      setParsedTx(null)
      setEstimate(null)
      setAnalysis(null)
      setSelectedStrategy(null)
      setSuccessInfo(null)

      try {
        const response = await fetch('/api/speedup/parse-tx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txid: transactionId,
            userAddress: currentAddress,
            walletAddresses: [currentAddress, paymentAddress].filter(Boolean)
          })
        })
        const data = await response.json()

        if (!data.success) {
          const errorMsg = data.error || 'Failed to fetch transaction'
          setError(errorMsg)
          toast.error(errorMsg)
          return
        }

        setParsedTx(data.transaction)
        setEstimate(data.estimate)

        const boostedRate = Math.max(0.1, Math.ceil(data.transaction.feeRate * 1.5 * 100) / 100)
        setCustomFeeRate(boostedRate)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch transaction'
        setError(errorMsg)
        toast.error(`Unable to analyze transaction: ${errorMsg}`)
      } finally {
        setLoading(false)
      }
    },
    [currentAddress, paymentAddress, toast, holderAllowed]
  )

  useEffect(() => {
    const urlTxid = searchParams.get('txid')
    if (urlTxid && urlTxid.length === 64) {
      setTxid(urlTxid)
      if (isConnected && currentAddress && !loading && !parsedTx) {
        setTimeout(() => {
          void fetchTransactionWithTxid(urlTxid)
        }, 100)
      }
    }
  }, [searchParams, isConnected, currentAddress, loading, parsedTx, fetchTransactionWithTxid])

  const renderStrategyCard = (strategy: SpeedupStrategy) => {
    if (!analysis) return null
    const detail = analysis.strategies[strategy]
    const meta = STRATEGY_COPY[strategy]
    const isSelected = selectedStrategy === strategy
    const disabled = !detail.available

    const baseClass = disabled
      ? 'cursor-not-allowed opacity-40 border-slate-700/60 bg-slate-900/40'
      : isSelected
        ? 'border-sky-400/70 bg-sky-500/20 shadow-[0_22px_44px_-22px_rgba(56,189,248,0.65)]'
        : meta.accent

  return (
      <button
        key={strategy}
        type="button"
        onClick={() => {
          if (!disabled) {
            setSelectedStrategy(strategy)
          }
        }}
        disabled={disabled}
        className={`flex flex-col gap-3 rounded-2xl border p-4 text-left text-xs transition ${baseClass}`}
      >
        <div className="flex items-center justify-between">
          <p className="font-semibold text-slate-100">{meta.title}</p>
          {isSelected && <span className="text-[10px] uppercase tracking-[0.35em] text-sky-200">Active</span>}
        </div>
        <p className="text-slate-400">{meta.blurb}</p>

        {detail.available ? (
          <div className="space-y-1 text-slate-300">
            {strategy === 'rbf' && <p>Bump: {formatSats(Math.max(analysis.requiredRbfFee, 0))} sats</p>}
            {strategy === 'cpfp' && <p>Child fee: {formatSats(analysis.childFeeNeeded)} sats</p>}
            {strategy === 'hybrid' && (
              <p className="text-emerald-200">
                {analysis.requiresHybrid ? 'Needs extra UTXO' : 'Will add a wallet UTXO if needed'}
              </p>
            )}
          </div>
        ) : detail.reasons.length > 0 ? (
          <ul className="space-y-1 text-amber-200">
            {detail.reasons.slice(0, 2).map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
            {detail.reasons.length > 2 && <li>• More conditions apply</li>}
          </ul>
        ) : null}
      </button>
    )
  }

  const formatSats = (value: number) => new Intl.NumberFormat().format(Math.round(value))

  const revalidateTransaction = useCallback(async (): Promise<RevalidateResult> => {
    if (!parsedTx || !currentAddress) {
      toast.error('Missing transaction context. Try analyzing again.')
      return { ok: false }
    }

    try {
      const response = await fetch('/api/speedup/parse-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txid: parsedTx.txid,
          userAddress: currentAddress,
          walletAddresses: [currentAddress, paymentAddress].filter(Boolean)
        })
      })
      const data = await response.json()

      if (!data.success) {
        toast.error(data.error || 'Failed to refresh transaction.')
        return { ok: false }
      }

      setParsedTx(data.transaction)
      setEstimate(data.estimate)

      if (data.transaction.status === 'confirmed') {
        setAnalysis(null)
        setSelectedStrategy(null)
        toast.info('Parent transaction already confirmed. No speedup required.')
        return { ok: false }
      }

      return { ok: true, transaction: data.transaction as ParsedTransaction, estimate: (data.estimate ?? null) as CpfpEstimate | null }
    } catch (error) {
      console.error('Revalidation error:', error)
      toast.error('Unable to refresh transaction before broadcast.')
      return { ok: false }
    }
  }, [parsedTx, currentAddress, paymentAddress, toast])

  useEffect(() => {
    if (!analysis || !parsedTx) return

    const abortController = new AbortController()
    const { signal } = abortController

    const fetchWalletBalance = async () => {
      try {
        const response = await fetch('/api/speedup/fetch-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: currentAddress,
            paymentAddress: paymentAddress,
            signal
          })
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch wallet balance: ${response.status}`)
        }
        const data = await response.json()
        if (data.success) {
          // This effect is not directly used in the current component's logic,
          // but it's part of the original file's structure.
          // If it were used, it would be here.
        }
      } catch (err) {
        if (signal.aborted) return
        console.error('Failed to fetch wallet balance:', err)
      }
    }

    void fetchWalletBalance()

    return () => {
      abortController.abort()
    }
  }, [analysis, parsedTx, currentAddress, paymentAddress])

  const fetchTransaction = async () => {
    await fetchTransactionWithTxid(txid)
  }

  const updateEstimate = async (newFeeRate: number) => {
    if (!parsedTx || !currentAddress || !Number.isFinite(newFeeRate)) return
    try {
      const preserveAnchorValue = parsedTx.userOutput ? parsedTx.userOutput.value <= PRESERVE_ANCHOR_THRESHOLD : false
      const response = await fetch('/api/speedup/estimate-cpfp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentTxid: parsedTx.txid,
          parentFee: parsedTx.fee,
          parentSize: parsedTx.vsize,
          outputValue: parsedTx.userOutput!.value,
          targetCombinedFeeRate: newFeeRate,
          preserveAnchorValue
        })
      })
      const data = await response.json()
      if (data.success) {
        setEstimate(data.estimate)
      }
    } catch (err) {
      console.error('Failed to update estimate:', err)
    }
  }

  const performCpfp = async (mode: 'simple' | 'hybrid') => {
    if (!parsedTx || !estimate || !currentAddress || !paymentAddress) {
      setError('Missing required data. Please ensure your wallet is fully connected.')
      return
    }

    if (!client) {
      setError('Wallet client unavailable. Please reconnect and try again.')
      return
    }

    if (!holderAllowed) {
      setError('Only verified holders can use this tool.')
      return
    }

    const validation = await revalidateTransaction()
    if (!validation.ok) {
      return
    }

    const currentTx = validation.transaction
    const shouldPreserveAnchor = currentTx.userOutput ? currentTx.userOutput.value <= PRESERVE_ANCHOR_THRESHOLD : false
    const fallbackEstimate = recalculateEstimate(currentTx, customFeeRate)
    const baseEstimate = validation.estimate ?? estimate ?? fallbackEstimate
    const currentEstimate = baseEstimate ?? fallbackEstimate

    if (!currentEstimate || !currentTx.userOutput) {
      setError('No spendable output available for this transaction.')
      return
    }

    setBroadcasting(true)
    setError(null)

    try {
      const parentOutpoint = `${currentTx.txid}:${currentTx.userOutput.index}`
      const excludedUtxoOutpoints = InscriptionService.getExcludedUtxos(paymentAddress)

      if (excludedUtxoOutpoints.includes(parentOutpoint)) {
        throw new Error(
          'This transaction output has already been used in a previous speedup attempt. If it confirmed, clear exclusions via InscriptionService.clearExcludedUtxos().' 
        )
      }

      const parentOutputValue = currentTx.userOutput.value
      const childFeeCandidate = Number.isFinite(currentEstimate.recommendedChildFee)
        ? currentEstimate.recommendedChildFee
        : fallbackEstimate.recommendedChildFee
      const combinedFeeRate = Number.isFinite(currentEstimate.recommendedCombinedFeeRate)
        ? currentEstimate.recommendedCombinedFeeRate
        : fallbackEstimate.recommendedCombinedFeeRate
      const minimumChildFee = shouldPreserveAnchor ? 330 : 1
      const childFeeNeeded = Math.max(minimumChildFee, Math.ceil(childFeeCandidate))
      const anchorReserve = shouldPreserveAnchor ? parentOutputValue : MIN_SIMPLE_CPFP_VALUE
      const parentContribution = Math.max(0, parentOutputValue - anchorReserve)
      const shortfall = Math.max(0, childFeeNeeded - parentContribution)

      if (mode === 'simple' && shortfall > 0) {
        throw new Error('Insufficient funds in the parent output for a pure CPFP. Switch to Hybrid CPFP or add funds.')
      }

      let additionalUtxos: Array<{ txid: string; vout: number; value: number }> = []

      if (mode === 'hybrid' && shortfall > 0) {
        const utxoResponse = await fetch('/api/speedup/fetch-utxos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: paymentAddress,
            excludedUtxos: excludedUtxoOutpoints,
            targetFeeRate: combinedFeeRate
          })
        })

        if (!utxoResponse.ok) {
          throw new Error('Failed to fetch wallet UTXOs. Please try again.')
        }

        const utxoData = await utxoResponse.json()
        if (!utxoData.success) {
          throw new Error(utxoData.error || 'Failed to fetch wallet UTXOs')
        }

        const availableUtxos = (utxoData.utxos || []).filter((u: any) => u.txid !== currentTx.txid)
        if (availableUtxos.length === 0) {
          const message = excludedUtxoOutpoints.length
            ? 'No spendable UTXOs found. Clear excluded UTXOs in console if prior transactions confirmed.'
            : 'No spendable UTXOs found. Add funds to your wallet.'
          throw new Error(message)
        }

        let gathered = 0
        for (const utxo of availableUtxos) {
          additionalUtxos.push({ txid: utxo.txid, vout: utxo.vout, value: utxo.value })
          gathered += utxo.value

          const additionalFee = additionalUtxos.length * 68 * combinedFeeRate
          if (gathered >= shortfall + additionalFee) {
            break
          }
        }

        if (gathered < shortfall) {
          throw new Error(`Insufficient funds in wallet. Need ${shortfall} sats but only found ${gathered} sats.`)
        }
      }

      const response = await fetch('/api/speedup/create-cpfp-psbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentTxid: currentTx.txid,
          outputIndex: currentTx.userOutput.index,
          outputValue: currentTx.userOutput.value,
          outputAddress: currentTx.userOutput.address,
          userAddress: paymentAddress,
          childFee: childFeeNeeded,
          additionalUtxos: additionalUtxos.length > 0 ? additionalUtxos : undefined,
          paymentPublicKey,
          taprootPublicKey: publicKey,
          preserveAnchorValue: shouldPreserveAnchor
        })
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to create CPFP transaction')
      }

      const txid = await signAndBroadcastPsbt(data.psbt)

      const usedOutpoints = [`${currentTx.txid}:${currentTx.userOutput.index}`, ...additionalUtxos.map((utxo) => `${utxo.txid}:${utxo.vout}`)]
      if (mode === 'hybrid' && usedOutpoints.length > 0) {
        InscriptionService.addExcludedUtxos(paymentAddress, usedOutpoints)
      }

      toast.success('CPFP transaction broadcast. Both transactions will confirm together.')

      setSuccessInfo({ txid, type: 'cpfp' })
      setParsedTx(null)
      setEstimate(null)
      setAnalysis(null)
      setSelectedStrategy(null)
      setTxid('')
      setError(null)
    } catch (err) {
      console.error('CPFP error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to speed up transaction'

      setError(errorMessage)
      if (errorMessage.toLowerCase().includes('insufficient')) {
        toast.error(`Insufficient funds: ${errorMessage}`)
      } else if (errorMessage.toLowerCase().includes('broadcast')) {
        toast.error(`Broadcast failed: ${errorMessage}`)
      } else {
        toast.error(errorMessage)
      }
    } finally {
      setBroadcasting(false)
    }
  }

  const performRbf = async () => {
    if (!parsedTx || !currentAddress) {
      setError('Missing transaction context for RBF.')
      return
    }

    if (!client) {
      setError('Wallet client unavailable. Please reconnect and try again.')
      return
    }

    if (!holderAllowed) {
      setError('Only verified holders can use this tool.')
      return
    }

    const validation = await revalidateTransaction()
    if (!validation.ok) {
      return
    }

    const currentTx = validation.transaction

    setBroadcasting(true)
    setError(null)

    try {
      const response = await fetch('/api/speedup/create-rbf-psbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentTxid: currentTx.txid,
          targetFeeRate: customFeeRate,
          walletAddresses: [currentAddress, paymentAddress].filter(Boolean),
          paymentPublicKey,
          taprootPublicKey: publicKey
        })
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to craft replacement transaction')
      }

      const txid = await signAndBroadcastPsbt(data.psbt)

      toast.success('Replacement transaction broadcast with a higher fee rate.')

      setSuccessInfo({ txid, type: 'rbf' })
      setParsedTx(null)
      setEstimate(null)
      setAnalysis(null)
      setSelectedStrategy(null)
      setTxid('')
      setError(null)
    } catch (err) {
      console.error('RBF error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to broadcast replacement transaction'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setBroadcasting(false)
    }
  }

  const executeSpeedup = async () => {
    if (!holderAllowed) {
      setError('Only verified holders can use this tool.')
      return
    }
    if (!selectedStrategy) {
      setError('Select a strategy before continuing.')
      return
    }

    if (selectedStrategy === 'rbf') {
      await performRbf()
    } else {
      const mode = selectedStrategy === 'hybrid' ? 'hybrid' : 'simple'
      await performCpfp(mode)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#03040e] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-12 h-80 w-80 rounded-full bg-cyan-500/15 blur-[140px] md:h-[420px] md:w-[420px]" />
        <div className="absolute right-[-10%] top-1/3 h-[360px] w-[360px] rounded-full bg-fuchsia-500/10 blur-[160px] md:right-[-5%]" />
        <div className="absolute bottom-[-20%] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-400/10 blur-[160px]" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link
            href="/tools"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-slate-400 transition hover:text-sky-200"
          >
            <ArrowRight className="h-3 w-3 rotate-180" /> Back to Pools
          </Link>
          <div className="flex flex-wrap gap-2">
            {TOOL_LINKS.map((tool) => {
              const isActive = tool.href === '/tools/speedup'
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className={`rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                    isActive
                      ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                      : 'border-slate-600/40 bg-black/40 text-slate-500 hover:border-sky-400/40 hover:text-sky-200'
                  }`}
                >
                  {tool.name}
                </Link>
              )
            })}
          </div>
        </div>

        <section className="rounded-3xl border border-sky-500/20 bg-gradient-to-br from-[#04122d]/80 via-[#081022]/60 to-[#120a1f]/70 p-10 shadow-[0_45px_120px_-40px_rgba(56,189,248,0.6)] backdrop-blur">
          <div className="grid gap-8 lg:grid-cols-[2fr,1fr] lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200">
                <Sparkles className="h-4 w-4" />
                CPFP Accelerator
              </div>
              <h1 className="text-4xl font-semibold text-white md:text-5xl">TX Speed Up</h1>
              <p className="max-w-xl text-sm text-slate-300 md:text-base">
                Paste the stuck txid, pick the bump style, sign, done.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-300 md:text-sm">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-500/30 bg-black/40 px-3 py-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  Wallet stays in control
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-500/30 bg-black/40 px-3 py-1.5">
                  <Info className="h-4 w-4 text-sky-300" />
                  Works for reveals & normal txs
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-sky-400/30 bg-black/40 p-6 shadow-2xl backdrop-blur">
              <div className="space-y-3 text-slate-300">
                <div className="flex items-center gap-3 text-sky-200">
                  <Gauge className="h-6 w-6" />
                  <p className="text-sm font-semibold">Quick bump kit</p>
                </div>
                <p className="text-sm">We inspect the tx, then surface the best RBF / CPFP buttons for your wallet.</p>
                <p className="text-xs text-slate-400">We craft it. You sign. Done.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-10 lg:grid-cols-[3fr,2fr]">
          <div className="rounded-3xl border border-sky-500/10 bg-[#050b1d]/80 p-8 shadow-[0_35px_90px_-45px_rgba(56,189,248,0.45)] backdrop-blur">
            <div className="space-y-5">
            <div className="space-y-2">
                <Label htmlFor="txid" className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-400">
                  Transaction Id
              </Label>
                <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  id="txid"
                    placeholder="Ex. 38f2... (64 characters)"
                  value={txid}
                  onChange={(e) => setTxid(e.target.value.trim())}
                    className="w-full rounded-2xl border border-sky-500/30 bg-slate-900/60 font-mono text-sm text-sky-100 placeholder:text-slate-500 focus:border-sky-400 focus:ring-sky-400"
                  disabled={loading || broadcasting}
                />
                <Button
                  onClick={fetchTransaction}
                  disabled={loading || broadcasting || !isConnected || !txid || !holderAllowed}
                  className="inline-flex min-w-[160px] items-center justify-center rounded-2xl bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500 py-2 text-base font-semibold text-slate-950 shadow-[0_12px_30px_-12px_rgba(56,189,248,0.8)] transition-transform hover:scale-[1.015] hover:shadow-[0_18px_40px_-20px_rgba(56,189,248,0.9)] disabled:from-slate-600 disabled:via-slate-600 disabled:to-slate-700 disabled:text-slate-300 disabled:shadow-none"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking
                    </>
                  ) : (
                    <>Check</>
                  )}
                </Button>
              </div>
                <p className="text-xs text-slate-500">Ideal for reveal txs or single-output sends.</p>
            </div>

            {!isConnected && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <p>Connect your wallet to plan a bump.</p>
                </div>
              )}

              {isConnected && holderStatus === 'checking' && (
                <div className="flex items-start gap-3 rounded-2xl border border-blue-400/30 bg-blue-500/10 p-4 text-sm text-blue-100">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <p>Verifying holder status…</p>
                </div>
              )}

              {isConnected && holderStatus !== 'checking' && holderStatus !== 'holder' && holderMessage && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <p>{holderMessage}</p>
                </div>
            )}

            {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <p>{error}</p>
                </div>
            )}

              {successInfo && (
                <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-8 text-center text-emerald-50 shadow-[0_45px_120px_-80px_rgba(52,211,153,0.8)] sm:p-10">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15">
                    <CheckCircle2 className="h-10 w-10 text-emerald-300" />
                  </div>
                  <div className="mt-5 space-y-2">
                    <h3 className="text-2xl font-semibold text-emerald-100">
                      {successInfo.type === 'rbf' ? 'Replacement live' : 'Child tx live'}
                    </h3>
                    <p className="text-sm text-emerald-200">
                      {successInfo.type === 'rbf' ? 'Higher-fee version is on the way.' : 'Parent + child now travel together.'}
                    </p>
                  </div>
                  <div className="mt-6 rounded-2xl border border-emerald-400/40 bg-black/30 p-4">
                    <p className="truncate text-xs font-mono text-emerald-100">{successInfo.txid}</p>
                    <a
                      href={`https://mempool.space/tx/${successInfo.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-200 hover:text-emerald-100"
                    >
                      View on mempool.space
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>
                  <Button
                    onClick={() => {
                      setSuccessInfo(null)
                      setTxid('')
                      setParsedTx(null)
                      setEstimate(null)
                      setAnalysis(null)
                      setSelectedStrategy(null)
                      setError(null)
                    }}
                    className="mt-6 inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_14px_28px_-16px_rgba(16,185,129,0.8)] hover:scale-[1.02] hover:shadow-[0_18px_36px_-20px_rgba(16,185,129,0.9)]"
                  >
                    Launch another speedup
                  </Button>
              </div>
            )}

              {parsedTx && !successInfo && (
                <div className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-sky-400/20 bg-slate-900/40 p-4 text-xs text-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold uppercase tracking-[0.35em] text-slate-500">Snapshot</p>
                    <a
                      href={`https://mempool.space/tx/${parsedTx.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-200 hover:text-sky-100"
                    >
                        View <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </div>
                    <div className="mt-3 grid gap-3 text-[11px] uppercase tracking-[0.2em] text-slate-400 sm:grid-cols-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-500">State</span>
                        <span className="text-slate-200 font-medium">
                          {parsedTx.status === 'confirmed' ? 'Confirmed' : 'Stuck' }
                        </span>
                </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-500">Fee rate</span>
                        <span className="text-rose-300 font-semibold text-lg normal-case tracking-normal">
                          {formatRate(parsedTx.feeRate)} <span className="text-[11px] text-slate-400 uppercase tracking-[0.2em]">sat/vB</span>
                        </span>
                            </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-500">Size</span>
                        <span className="text-slate-200">{parsedTx.vsize ? `${parsedTx.vsize} vB` : '--'}</span>
                            </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-500">Paid</span>
                        <span className="text-slate-200">{parsedTx.fee} sats</span>
                              </div>
                          </div>
                    {parsedTx.userOutput && (
                      <p className="mt-3 text-[11px] text-sky-200 uppercase tracking-[0.2em]">
                        Your output: {parsedTx.userOutput.value} sats
                      </p>
                      )}
                  </div>

                {analysis && parsedTx.status === 'unconfirmed' && (
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Strategy picker</p>
                    <div className="grid gap-2 md:grid-cols-3">
                      {(['rbf', 'cpfp', 'hybrid'] as SpeedupStrategy[]).map((strategy) => renderStrategyCard(strategy))}
                          </div>
                    {analysis.recommended !== 'none' && (
                      <p className="text-[11px] text-slate-400">
                        Tip: {analysis.recommended === 'rbf' ? 'RBF should cover the jump.' : analysis.recommended === 'cpfp' ? 'Pure CPFP has enough room.' : 'Hybrid CPFP needed—tap an extra UTXO.'}
                      </p>
                    )}
                  </div>
                )}

                  {parsedTx.status === 'confirmed' && (
                    <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                      <Info className="h-4 w-4 flex-shrink-0" />
                      <p>This transaction is already confirmed. No CPFP speedup is required.</p>
                      </div>
                )}

                {parsedTx.userOutput && parsedTx.status === 'unconfirmed' && estimate && (
                    <div className="space-y-6">
                      <div className="rounded-2xl border border-sky-400/20 bg-slate-900/50 p-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-3">
                            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Target combined fee rate</p>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                              <div className="flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-slate-950/60 px-4 py-2">
                          <Input
                            type="number"
                            value={customFeeRate}
                            onChange={(e) => {
                              const newRate = parseFloat(e.target.value)
                              setCustomFeeRate(newRate)
                              void updateEstimate(newRate)
                            }}
                                  className="w-28 border-none bg-transparent text-lg font-semibold text-sky-100 focus-visible:ring-0"
                            min="0.1"
                            step="0.05"
                          />
                                <span className="text-sm text-slate-400">sat/vB</span>
                        </div>
                              <div className="flex flex-wrap gap-2">
                          {[1, 2, 5, 10, 25, 50].map((rate) => (
                                  <button
                              key={rate}
                                    type="button"
                              onClick={() => {
                                setCustomFeeRate(rate)
                                void updateEstimate(rate)
                              }}
                                    className="rounded-full border border-slate-600/30 bg-slate-900/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 transition hover:border-sky-400/50 hover:text-sky-200"
                            >
                              {rate}
                                  </button>
                          ))}
                        </div>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400">
                            {parsedTx.userOutput && parsedTx.userOutput.value < parsedTx.vsize
                              ? 'Anchor is tiny—expect only small bumps.'
                              : Number.isFinite(parsedTx.feeRate)
                                ? `Try ~${formatRate((parsedTx.feeRate ?? 0) + 0.2)} sat/vB for a mid bump.`
                                : 'Set a higher fee than the original send.'}
                        </p>
                      </div>
                    </div>

                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-6 text-sm text-emerald-100">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.35em] text-emerald-200">After acceleration</p>
                            <p className="mt-2 text-3xl font-semibold text-emerald-100">
                              {formatRate(estimate.recommendedCombinedFeeRate)} <span className="text-base text-emerald-200">sat/vB</span>
                            </p>
                        </div>
                          <div className="rounded-2xl border border-emerald-300/40 bg-black/20 px-4 py-3 text-xs">
                            {parsedTx.userOutput && parsedTx.userOutput.value < estimate.recommendedChildFee + 330
                              ? 'Hybrid mode: pairs your reveal output with a spare UTXO.'
                              : 'Parent + child confirm together at this new tier.'}
                          </div>
                          </div>
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.35em] text-emerald-200">Parent contribution</p>
                            <p className="font-semibold text-emerald-100">{estimate.parentFee} sats ({formatRate(estimate.parentFeeRate)} sat/vB)</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.35em] text-emerald-200">Child fee commitment</p>
                            <p className="font-semibold text-emerald-100">{estimate.recommendedChildFee} sats</p>
                          </div>
                        </div>
                        <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
                        <div className="mt-4 flex flex-col gap-2 text-xs text-emerald-200 sm:flex-row sm:items-center sm:justify-between">
                          <span className="font-semibold text-emerald-100">Total additional cost: {estimate.recommendedChildFee} sats</span>
                          <span>You&rsquo;ll receive back: {estimate.userReceives} sats</span>
                      </div>
                    </div>

                    <Button
                      onClick={() => void executeSpeedup()}
                      disabled={broadcasting || !selectedStrategy || !holderAllowed}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 py-4 text-lg font-semibold text-slate-950 shadow-[0_18px_40px_-20px_rgba(59,130,246,0.85)] transition hover:scale-[1.015] hover:shadow-[0_22px_48px_-22px_rgba(59,130,246,0.9)] disabled:from-slate-600 disabled:via-slate-600 disabled:to-slate-700 disabled:text-slate-300 disabled:shadow-none"
                    >
                      {broadcasting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          {selectedStrategy === 'rbf'
                            ? 'Broadcasting replacement transaction…'
                            : 'Broadcasting CPFP transaction…'}
                        </>
                      ) : (
                        <>
                          {selectedStrategy === 'rbf' ? (
                            <Rocket className="h-5 w-5" />
                          ) : (
                            <Sparkles className="h-5 w-5" />
                          )}
                          {selectedStrategy === 'rbf' ? 'Broadcast replacement' : 'Execute speedup'}
                          <ArrowRight className="h-5 w-5" />
                        </>
                      )}
                    </Button>
                    </div>
                )}

                {!parsedTx.userOutput && parsedTx.status === 'unconfirmed' && (
                    <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <p>No spendable output found for this wallet. Confirm the connected address matches the transaction recipient.</p>
                    </div>
                )}
              </div>
            )}
            </div>
          </div>

          <aside className="space-y-6" />
        </section>
      </div>
    </div>
  )
}

export default SpeedupPage

