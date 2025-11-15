'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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
} from 'lucide-react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import type { CategorisedWalletAssets, InscriptionUtxo } from '@/lib/sandshrew'

const formatSats = (value: number) => `${value.toLocaleString()} sats`

const MIN_WORTHWHILE_RECOVERY = 1000
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

function SatRecoveryContent() {
  const toast = useToast()
  const { isConnected, currentAddress, client } = useWallet()
  const laserEyes = useLaserEyes() as Partial<{
    paymentAddress: string
    paymentPublicKey: string
    publicKey: string
  }>

  const taprootAddress = currentAddress?.trim() || ''
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
  }, [taprootAddress, toast])

  // Auto-fetch assets when wallet is connected
  useEffect(() => {
    if (isConnected && taprootAddress && taprootAddress !== lastFetchedRef.current) {
      void fetchAssets()
    }
  }, [isConnected, taprootAddress, fetchAssets])

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
    if (!taprootAddress) {
      setError('Please connect your wallet')
      return
    }

    setLoading(true)
    setError(null)
    setAnalysis(null)

    try {
      const numericFeeRate = Number.parseFloat(feeRate)
      if (!Number.isFinite(numericFeeRate) || numericFeeRate <= 0) {
        setError('Please enter a valid fee rate')
        setLoading(false)
        return
      }

      const response = await fetch('/api/sat-recovery/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: taprootAddress,
          taprootAddress,
          paymentAddress: paymentAddress || taprootAddress,
          feeRate: numericFeeRate,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to analyze recoverable sats')
      }

      setAnalysis(data.analysis)
    } catch (err) {
      console.error('Analysis error:', err)
      setError(err instanceof Error ? err.message : 'Failed to analyze recoverable sats')
    } finally {
      setLoading(false)
    }
  }, [taprootAddress, feeRate])

  // Auto-analyze when assets are loaded (only once when assets first load)
  useEffect(() => {
    // Skip if already analyzed or conditions not met
    if (!assets || recoverableInscriptions.length === 0 || !feeRate || loading || hasAnalyzedRef.current) {
      return
    }

    const numericFeeRate = Number.parseFloat(feeRate)
    if (Number.isFinite(numericFeeRate) && numericFeeRate > 0) {
      hasAnalyzedRef.current = true
      void analyzeRecoverable()
    }
  }, [assets, recoverableInscriptions.length, feeRate, loading])

  const handleRecover = useCallback(async () => {
    if (!analysis || !taprootAddress || !paymentAddress) {
      toast.error('Missing required addresses')
      return
    }

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
          paymentAddress,
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
      setRecoveryTxid(typeof txid === 'string' ? txid : String(txid))
      toast.success('Recovery transaction broadcast successfully!')

      // Refresh analysis
      await analyzeRecoverable()
    } catch (err) {
      console.error('Recovery error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to recover sats'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setRecovering(false)
    }
  }, [analysis, taprootAddress, paymentAddress, feeRate, client, laserEyes, toast, analyzeRecoverable])

  const canRecover = useMemo(() => {
    return (
      analysis &&
      analysis.worthwhile &&
      analysis.recoverable.length > 0 &&
      taprootAddress &&
      paymentAddress &&
      !recovering
    )
  }, [analysis, taprootAddress, paymentAddress, recovering])

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
                  <Button onClick={fetchAssets} variant="outline" size="sm">
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
              <Button
                onClick={analyzeRecoverable}
                disabled={loading || !taprootAddress}
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

            {analysis && (
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
                      <div className="flex flex-col gap-2">
                        {analysis.recoverable.map((ins) => (
                          <div
                            key={ins.outpoint}
                            className="rounded border border-slate-600 bg-slate-900/50 p-3"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col gap-1">
                                <p className="text-xs font-mono text-slate-400">
                                  {ins.txid.slice(0, 16)}...:{ins.vout}
                                </p>
                                <p className="text-sm text-slate-300">
                                  {ins.inscriptions.length} inscription
                                  {ins.inscriptions.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <div className="text-right text-sm">
                                <p className="text-slate-400">
                                  Value: {formatSats(ins.value)}
                                </p>
                                <p className="text-emerald-400">
                                  Recoverable: {formatSats(ins.recoverableSats)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button
                      onClick={handleRecover}
                      disabled={!canRecover}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      size="lg"
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

                    {recoveryTxid && (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                        <div className="flex items-center gap-2 text-emerald-200">
                          <CheckCircle2 className="h-5 w-5" />
                          <div className="flex flex-col gap-1">
                            <p className="font-semibold">Recovery transaction broadcast!</p>
                            <a
                              href={`https://mempool.space/tx/${recoveryTxid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-emerald-300 underline hover:text-emerald-200"
                            >
                              View on mempool.space
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SatRecoveryPage() {
  const [isHolder, setIsHolder] = useState<boolean | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)

  return (
    <>
      <Header
        isHolder={isHolder ?? undefined}
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
        <SatRecoveryContent />
      </Suspense>
    </>
  )
}

