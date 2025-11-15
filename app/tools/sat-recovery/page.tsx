'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  Coins,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Wallet,
  TrendingUp,
  Info,
  ShieldCheck,
  FileText,
} from 'lucide-react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import ChestCallout from '@/components/ChestCallout'
import LaserEyesWrapper from '@/components/LaserEyesWrapper'
import type { CategorisedWalletAssets, InscriptionUtxo } from '@/lib/sandshrew'

interface OrdinalContentMetadata {
  inscriptionId: string
  endpoint: string
  contentType?: string | null
  contentLength?: number | null
  acceptsRanges?: boolean
}

const formatSats = (value: number) => `${value.toLocaleString()} sats`

const MIN_WORTHWHILE_RECOVERY = 950
const MIN_INSCRIPTION_UTXO_VALUE = 877 // > 876 sats

interface RecoverableInscription {
  txid: string
  vout: number
  outpoint: string
  value: number
  inscriptions: string[]
  inscriptionOutput: number
  paymentOutput: number
  recoverableSats: number
  fee: number
}

interface RecoveryAnalysis {
  recoverable: RecoverableInscription[]
  totalRecoverable: number
  totalFee: number
  totalInputs: number
  totalOutputs: number
  estimatedVsize: number
  worthwhile: boolean
}

interface SatRecoveryContentProps {
  isHolder?: boolean
}

function SatRecoveryContent({ isHolder }: SatRecoveryContentProps) {
  const toast = useToast()
  const { isConnected, currentAddress, client } = useWallet()
  const laserEyes = useLaserEyes() as Partial<{
    address: string | null
    paymentAddress: string
    paymentPublicKey: string
    publicKey: string
  }>

  // Use LaserEyes address directly if available, fallback to useWallet address
  // This ensures we get the address even if there's a timing issue with useWallet
  const taprootAddress = (laserEyes.address || currentAddress)?.trim() || ''
  const paymentAddress = laserEyes.paymentAddress?.trim() || ''

  const [assets, setAssets] = useState<CategorisedWalletAssets | null>(null)
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<RecoveryAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feeRate, setFeeRate] = useState<string>('12')
  const [recovering, setRecovering] = useState(false)
  const [recoveryTxid, setRecoveryTxid] = useState<string | null>(null)

  const lastFetchedRef = useRef<string | null>(null)
  const hasAnalyzedRef = useRef(false)

  // Recoverable inscriptions (value > 876)
  const recoverableInscriptions = useMemo(() => {
    return (assets?.inscriptions ?? []).filter((utxo) => utxo.value > MIN_INSCRIPTION_UTXO_VALUE)
  }, [assets?.inscriptions])

  const [feeRecommendations, setFeeRecommendations] = useState<{
    fastestFee: number
    halfHourFee: number
    hourFee: number
    economyFee: number
    minimumFee: number
  } | null>(null)

  // Fetch wallet assets
  const fetchAssets = useCallback(async () => {
    if (isHolder !== true) {
      return
    }

    if (!taprootAddress) {
      setAssets(null)
      setAssetsError(null)
      return
    }

    if (taprootAddress === lastFetchedRef.current) {
      return
    }

    setAssetsLoading(true)
    setAssetsError(null)

    try {
      const response = await fetch('/api/wallet/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: taprootAddress }),
      })

      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load wallet assets')
      }

      setAssets(payload.data as CategorisedWalletAssets)
      lastFetchedRef.current = taprootAddress
      // Reset analysis flag when new assets are loaded
      hasAnalyzedRef.current = false
    } catch (err) {
      console.error('Failed to fetch wallet assets:', err)
      const message = err instanceof Error ? err.message : 'Unknown error fetching assets'
      setAssetsError(message)
      toast.error(`Asset fetch failed: ${message}`)
    } finally {
      setAssetsLoading(false)
    }
  }, [isHolder, taprootAddress, toast])

  // Auto-fetch assets when wallet is connected and holder verified
  useEffect(() => {
    if (isHolder === true && isConnected && taprootAddress && taprootAddress !== lastFetchedRef.current) {
      void fetchAssets()
    }
  }, [isHolder, isConnected, taprootAddress, fetchAssets])

  // Auto-analyze when assets are loaded (moved after analyzeRecoverable definition)

  // Fetch fee recommendations
  useEffect(() => {
    let cancelled = false

    const fetchFees = async () => {
      try {
        const response = await fetch('https://mempool.space/api/v1/fees/recommended', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch fees: ${response.status}`)
        }

        const data = await response.json()
        if (!cancelled) {
          setFeeRecommendations(data)
          if (!feeRate || feeRate === '12') {
            setFeeRate(String(data.hourFee || 12))
          }
        }
      } catch (err) {
        console.error('Failed to fetch fee recommendations:', err)
      }
    }

    void fetchFees()

    return () => {
      cancelled = true
    }
  }, [feeRate])

  const analyzeRecoverable = useCallback(async () => {
    if (isHolder !== true) {
      setError('Only verified holders can use this tool.')
      return
    }

    // Ensure we have a valid address before proceeding
    if (!taprootAddress || taprootAddress.length === 0) {
      const errorMsg = isConnected
        ? 'Wallet address is not available. Please try reconnecting your wallet.'
        : 'Please connect your wallet to analyze recoverable sats.'
      setError(errorMsg)
      toast.error(errorMsg)
      return
    }

    // Use taproot address as fallback for payment address if not available
    const effectivePaymentAddress = paymentAddress || taprootAddress

    if (loading) {
      return
    }

    setLoading(true)
    setError(null)
    setAnalysis(null)
    // Don't reset hasAnalyzedRef here - let it be set after successful analysis

    try {
      const numericFeeRate = Number.parseFloat(feeRate)
      if (!Number.isFinite(numericFeeRate) || numericFeeRate <= 0) {
        throw new Error('Invalid fee rate')
      }

      // Log the addresses being sent for debugging
      console.log('[sat-recovery] Analyzing with addresses:', {
        address: taprootAddress,
        taprootAddress,
        paymentAddress: effectivePaymentAddress,
        feeRate: numericFeeRate,
        hasLaserEyesAddress: !!laserEyes.address,
        hasCurrentAddress: !!currentAddress,
        isConnected,
      })

      const response = await fetch('/api/sat-recovery/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: taprootAddress, // API expects 'address' not 'walletAddress'
          taprootAddress,
          paymentAddress: effectivePaymentAddress,
          feeRate: numericFeeRate,
        }),
      })

      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to analyze recoverable sats')
      }

      setAnalysis(payload.analysis as RecoveryAnalysis)
      hasAnalyzedRef.current = true
    } catch (err) {
      console.error('Failed to analyze recoverable sats:', err)
      const message = err instanceof Error ? err.message : 'Failed to analyze recoverable sats'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [isHolder, taprootAddress, paymentAddress, feeRate, loading, toast])

  // Auto-analyze when assets are loaded (only once when assets first load)
  useEffect(() => {
    // Skip if not holder, already analyzed, or conditions not met
    if (isHolder !== true || !assets || recoverableInscriptions.length === 0 || !feeRate || loading || hasAnalyzedRef.current) {
      return
    }

    // Only auto-analyze if we have both addresses (or can use taproot as fallback)
    if (!taprootAddress) {
      return
    }

    const numericFeeRate = Number.parseFloat(feeRate)
    if (Number.isFinite(numericFeeRate) && numericFeeRate > 0) {
      hasAnalyzedRef.current = true
      void analyzeRecoverable()
    }
  }, [isHolder, assets, recoverableInscriptions.length, feeRate, loading, analyzeRecoverable, taprootAddress])

  const handleRecover = useCallback(async () => {
    if (isHolder !== true) {
      toast.error('Only verified holders can use this tool.')
      return
    }

    if (!analysis || !taprootAddress) {
      toast.error('Missing required addresses')
      return
    }

    // Use taproot address as fallback for payment address if not available
    const effectivePaymentAddress = paymentAddress || taprootAddress

    if (!client) {
      toast.error('Wallet client not available')
      return
    }

    setRecovering(true)
    setError(null)
    setRecoveryTxid(null)

    try {
      const numericFeeRate = Number.parseFloat(feeRate)
      if (!Number.isFinite(numericFeeRate) || numericFeeRate <= 0) {
        throw new Error('Invalid fee rate')
      }

      // Build PSBT
      console.log('[sat-recovery] Building PSBT with:', {
        inputs: analysis.recoverable.map((ins) => ({
          txid: ins.txid,
          vout: ins.vout,
          value: ins.value,
        })),
        taprootAddress,
        paymentAddress,
        feeRate: numericFeeRate,
      })

      const buildResponse = await fetch('/api/sat-recovery/build-psbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: analysis.recoverable.map((ins) => ({
            txid: ins.txid,
            vout: ins.vout,
            value: ins.value,
          })),
          taprootAddress,
          paymentAddress: effectivePaymentAddress,
          paymentPublicKey: laserEyes.paymentPublicKey,
          taprootPublicKey: laserEyes.publicKey,
          feeRate: numericFeeRate,
        }),
      })

      const buildData = await buildResponse.json()

      console.log('[sat-recovery] Build response:', {
        success: buildData.success,
        error: buildData.error,
        summary: buildData.summary,
      })

      if (!buildData.success) {
        throw new Error(buildData.error || 'Failed to build recovery transaction')
      }

      // Sign PSBT
      // For Magic Eden wallets (bc1q), we need to sign all inputs by passing true as second parameter
      // This ensures all inputs are signed even if the wallet thinks some don't need signing
      let psbtBase64 = buildData.psbt
      const signed = await client.signPsbt(psbtBase64, true, false)

      if (!signed) {
        throw new Error('Failed to sign transaction')
      }

      // Handle different response formats (same as abyss page)
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

      // Extract and broadcast transaction
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
      const tx = finalPsbt.extractTransaction()
      const txHex = tx.toHex()

      const broadcastResponse = await fetch('https://mempool.space/api/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: txHex,
      })

      if (!broadcastResponse.ok) {
        const errorText = await broadcastResponse.text()
        throw new Error(`Broadcast failed: ${errorText}`)
      }

      const txid = await broadcastResponse.text()
      const txidStr = typeof txid === 'string' ? txid : String(txid)
      setRecoveryTxid(txidStr)
      toast.success('Recovery transaction broadcast successfully!')

      // Set success state - clear analysis and show success message
      setAnalysis(null)
      setError(null)
    } catch (err) {
      console.error('Recovery error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to recover sats'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setRecovering(false)
    }
  }, [isHolder, analysis, taprootAddress, paymentAddress, feeRate, client, laserEyes, toast, analyzeRecoverable])

  const canRecover = useMemo(() => {
    return (
      isHolder === true &&
      analysis &&
      analysis.worthwhile &&
      analysis.recoverable.length > 0 &&
      taprootAddress &&
      !recovering
    )
  }, [isHolder, analysis, taprootAddress, recovering])

  // Show locked page only if explicitly checked and confirmed not a holder (isHolder === false)
  // When isHolder is undefined, we show the page content (but functionality is disabled)
  if (isHolder === false) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-20 text-zinc-200 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-3xl border border-red-500/40 bg-red-950/20 p-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-900/30 px-4 py-1 text-[11px] font-mono uppercase tracking-[0.4em] text-red-200">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Holder Access Only
          </div>
          <h1 className="text-2xl font-black uppercase tracking-[0.45em] text-red-100">Sat Recovery Locked</h1>
          <p className="max-w-2xl text-sm uppercase tracking-[0.3em] text-red-200/80">
            Connect your wallet and complete holder verification in the header to unlock the sat recovery tool. Only
            verified holders can recover excess satoshis from inscription UTXOs.
          </p>
          <div className="text-xs font-mono uppercase tracking-[0.35em] text-red-200/70">
            Use the Verify Holder control in the header to confirm access.
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto flex flex-1 flex-col gap-8 px-4 py-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Coins className="h-8 w-8 text-amber-400" />
            <h1 className="text-3xl font-bold text-slate-100">Sat Recovery</h1>
          </div>
          <p className="text-slate-400">
            Recover excess satoshis from inscription UTXOs. Each inscription UTXO with more than 876 sats
            can be split: 330 sats back to your taproot address (preserving the inscription) and the
            remainder to your payment wallet.
          </p>
        </div>

        {!isConnected && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-amber-200">
              <AlertCircle className="h-5 w-5" />
              <p>Please connect your wallet to analyze recoverable sats</p>
            </div>
          </div>
        )}

        {isConnected && (
          <div className="flex flex-col gap-6">
            {/* Assets loading state */}
            {assetsLoading && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                <div className="flex items-center gap-2 text-blue-200">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <p>Fetching inscriptions...</p>
                </div>
              </div>
            )}

            {/* Assets error */}
            {assetsError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <div className="flex items-center gap-2 text-red-200">
                  <AlertCircle className="h-5 w-5" />
                  <p>{assetsError}</p>
                </div>
              </div>
            )}

            {/* Recoverable inscriptions list */}
            {!assetsLoading && !assetsError && assets && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-200">
                    Inscriptions with UTXO value &gt; 876 sats
                  </h2>
                  <Button onClick={fetchAssets} variant="outline">
                    <Loader2 className={`mr-2 h-4 w-4 ${assetsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
                {recoverableInscriptions.length === 0 ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-center">
                    <p className="text-amber-200">
                      No inscriptions found with UTXO value &gt; 876 sats
                    </p>
                    <p className="mt-2 text-sm text-amber-300">
                      Only inscriptions with value exceeding 876 sats can be recovered.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {recoverableInscriptions.map((utxo) => (
                      <div
                        key={utxo.outpoint}
                        className="rounded-lg border border-emerald-500/30 bg-slate-900/50 p-4"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-mono text-slate-400">
                              {utxo.txid.slice(0, 16)}...:{utxo.vout}
                            </p>
                            <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300">
                              {utxo.inscriptions.length} inscription{utxo.inscriptions.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-400">UTXO Value:</span>
                            <span className="text-lg font-bold text-emerald-400">
                              {formatSats(utxo.value)}
                            </span>
                          </div>
                          {utxo.inscriptions.map((inscriptionId) => (
                            <p key={inscriptionId} className="truncate text-xs font-mono text-slate-500">
                              {inscriptionId}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6">
              <div className="flex items-center justify-between">
                <Label htmlFor="feeRate" className="text-slate-200">
                  Fee Rate (sat/vB)
                </Label>
                {feeRecommendations && (
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setFeeRate(String(feeRecommendations.hourFee))}
                      className="rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                    >
                      {feeRecommendations.hourFee} (1h)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeeRate(String(feeRecommendations.halfHourFee))}
                      className="rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                    >
                      {feeRecommendations.halfHourFee} (30m)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeeRate(String(feeRecommendations.fastestFee))}
                      className="rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                    >
                      {feeRecommendations.fastestFee} (fast)
                    </button>
                  </div>
                )}
              </div>
              <Input
                id="feeRate"
                type="number"
                value={feeRate}
                onChange={(e) => setFeeRate(e.target.value)}
                min="1"
                step="1"
              />
              {!paymentAddress && isConnected && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                  <p className="text-xs text-amber-200">
                    Waiting for payment address... If this persists, try reconnecting your wallet.
                  </p>
                </div>
              )}
              <Button
                onClick={analyzeRecoverable}
                disabled={loading || !taprootAddress || isHolder !== true}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Analyze Recoverable Sats
                  </>
                )}
              </Button>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <div className="flex items-center gap-2 text-red-200">
                  <AlertCircle className="h-5 w-5" />
                  <p>{error}</p>
                </div>
              </div>
            )}

            {!recoveryTxid && !analysis && !loading && recoverableInscriptions.length > 0 && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-6">
                <div className="flex items-center gap-3 text-blue-200">
                  <Info className="h-6 w-6" />
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold">Ready to analyze</p>
                    <p className="text-sm text-blue-300">
                      Found {recoverableInscriptions.length} inscription{recoverableInscriptions.length !== 1 ? 's' : ''} with UTXO value &gt; 876 sats.
                      Click &quot;Analyze Recoverable Sats&quot; above to calculate recoverable amounts.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {recoveryTxid ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6">
                  <div className="flex items-center gap-3 text-emerald-200">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    <div className="flex flex-col gap-2">
                      <p className="text-xl font-semibold">Recovery transaction broadcast successfully!</p>
                      <p className="text-sm text-emerald-300">
                        Your transaction has been submitted to the network. The recovery will complete once the transaction confirms.
                      </p>
                      <a
                        href={`https://mempool.space/tx/${recoveryTxid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-emerald-200 underline hover:text-emerald-100 inline-flex items-center gap-2 w-fit"
                      >
                        View transaction on mempool.space
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <p className="text-sm text-slate-400">
                    To recover more sats, refresh your assets and analyze again.
                  </p>
                </div>
              </div>
            ) : analysis && (
              <div className="flex flex-col gap-4">
                {!analysis.worthwhile ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6">
                    <div className="flex items-center gap-3 text-amber-200">
                      <Info className="h-6 w-6" />
                      <div className="flex flex-col gap-1">
                        <p className="font-semibold">Not enough sats worth saving</p>
                        <p className="text-sm text-amber-300">
                          Total recoverable: {formatSats(analysis.totalRecoverable)} (minimum:{' '}
                          {formatSats(MIN_WORTHWHILE_RECOVERY)})
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                          <div className="flex flex-col gap-1">
                            <p className="font-semibold text-emerald-200">
                              {analysis.recoverable.length} recoverable inscription
                              {analysis.recoverable.length !== 1 ? 's' : ''}
                            </p>
                            <p className="text-sm text-emerald-300">
                              Total recoverable: {formatSats(analysis.totalRecoverable)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm text-emerald-300">
                          <p>Estimated fee: {formatSats(analysis.totalFee)}</p>
                          <p>Estimated vsize: {analysis.estimatedVsize} vB</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
                      <h2 className="mb-4 text-lg font-semibold text-slate-200">
                        Recoverable Inscriptions
                      </h2>
                      <div className="flex flex-col gap-3">
                        {analysis.recoverable.map((ins) => {
                          const primaryInscriptionId = ins.inscriptions[0]
                          return (
                            <div
                              key={ins.outpoint}
                              className="flex items-center gap-4 rounded-lg border border-slate-600 bg-slate-900/50 p-4"
                            >
                              {primaryInscriptionId ? (
                                <div className="flex-shrink-0">
                                  <InscriptionPreviewPanel inscriptionId={primaryInscriptionId} size={80} interactive={false} />
                                </div>
                              ) : (
                                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800/50 text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">
                                  No preview
                                </div>
                              )}
                              <div className="flex flex-1 items-center justify-between gap-4">
                                <div className="flex flex-col gap-1.5">
                                  <p className="text-xs font-mono text-slate-400">
                                    {ins.txid.slice(0, 16)}...:{ins.vout}
                                  </p>
                                  <p className="text-sm font-medium text-slate-200">
                                    {ins.inscriptions.length} inscription
                                    {ins.inscriptions.length !== 1 ? 's' : ''}
                                  </p>
                                  {ins.inscriptions.length > 1 && (
                                    <p className="text-xs text-slate-500">
                                      +{ins.inscriptions.length - 1} more
                                    </p>
                                  )}
                                </div>
                                <div className="text-right text-sm">
                                  <p className="mb-1 text-slate-400">
                                    UTXO: {formatSats(ins.value)}
                                  </p>
                                  <p className="text-lg font-semibold text-emerald-400">
                                    Recoverable: {formatSats(ins.recoverableSats)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <Button
                      onClick={handleRecover}
                      disabled={!canRecover || recovering}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                    >
                      {recovering ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Recovering...
                        </>
                      ) : (
                        <>
                          <Coins className="mr-2 h-5 w-5" />
                          Recover {formatSats(analysis.totalRecoverable)}
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chest at bottom of page */}
        <div className="mt-12 pb-8">
          <ChestCallout eventKey="treasure_chest_sat_recovery" size="sm" className="mt-6" />
        </div>
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
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-[10px] font-mono uppercase tracking-[0.3em] text-amber-100"
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

export default function SatRecoveryPage() {
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)

  return (
    <LaserEyesWrapper>
      <Header
        isHolder={isHolder}
        isVerifying={isVerifying}
        onHolderVerified={(holder) => {
          setIsHolder(holder)
          setIsVerifying(false)
        }}
        onVerifyingStart={() => setIsVerifying(true)}
        connected={connected}
        onConnectedChange={setConnected}
      />
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
        <SatRecoveryContent isHolder={isHolder} />
      </Suspense>
    </LaserEyesWrapper>
  )
}

