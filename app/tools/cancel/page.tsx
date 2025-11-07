'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import { useWallet } from '@/lib/wallet/compatibility'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Undo2, ShieldCheck, AlertCircle, ArrowRight, ArrowUpRight } from 'lucide-react'

// Metadata defined in parent layout since this page is client-side only

type RevalidateResult =
  | { ok: true; payload: ParsedTransaction }
  | { ok: false }

interface ParsedTransaction {
  txid: string
  status: 'confirmed' | 'unconfirmed' | 'not_found'
  fee: number
  feeRate: number
  vsize: number
  optInRbf: boolean
  inputs: Array<{
    index: number
    txid: string
    vout: number
    sequence: number
    value: number
    address: string | null
    belongsToWallet: boolean
  }>
  outputs: Array<{
    index: number
    address: string
    value: number
    spent: boolean
    belongsToWallet: boolean
  }>
}

const formatRate = (value: number | null | undefined, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--'

const formatSats = (value: number) => new Intl.NumberFormat().format(Math.round(value))

const TOOL_LINKS = [
  { name: 'Transaction Speedup', href: '/tools/speedup' },
  { name: 'Cancel Transaction', href: '/tools/cancel' }
]

export default function CancelTransactionPage() {
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-slate-100">
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
      />
      <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-sky-400" /></div>}>
        <CancelTransactionContent />
      </Suspense>
    </div>
  )
}

function CancelTransactionContent() {
  const { isConnected, currentAddress, client } = useWallet()
  const laserEyes = useLaserEyes() as Partial<{ paymentAddress: string; paymentPublicKey: string; publicKey: string }>
  const { paymentAddress, paymentPublicKey, publicKey } = laserEyes
  const toast = useToast()
  const searchParams = useSearchParams()

  const [txid, setTxid] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsedTx, setParsedTx] = useState<ParsedTransaction | null>(null)
  const [targetRate, setTargetRate] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [broadcasting, setBroadcasting] = useState(false)
  const [successTxid, setSuccessTxid] = useState<string | null>(null)
  const [holderStatus, setHolderStatus] = useState<'unknown' | 'checking' | 'holder' | 'not-holder' | 'error'>('unknown')
  const [holderMessage, setHolderMessage] = useState<string | null>(null)

  const holderAllowed = holderStatus === 'holder'

  const fetchTransactionWithTxid = useCallback(
    async (transactionId: string) => {
      if (!transactionId || transactionId.length !== 64) {
        const msg = 'Please enter a valid transaction ID (64 characters).'
        setError(msg)
        toast.error(msg)
        return
      }
      if (!currentAddress) {
        const msg = 'Please connect your wallet first.'
        setError(msg)
        toast.error(msg)
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
          const msg = data.error || 'Failed to fetch transaction.'
          setError(msg)
          toast.error(msg)
          return
        }

        setParsedTx(data.transaction)

        const baselineRate = data.transaction.feeRate || 1
        const bumpedRate = Math.max(1, Math.ceil(baselineRate * 1.4 * 100) / 100)
        setTargetRate(bumpedRate)

        if (!data.transaction.optInRbf) {
          toast.error('This transaction was not broadcast with opt-in RBF. Cancellation is not possible.')
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch transaction.'
        setError(msg)
        toast.error(msg)
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
      if (isConnected && currentAddress && !parsedTx && !loading) {
        void fetchTransactionWithTxid(urlTxid)
      }
    }
  }, [searchParams, isConnected, currentAddress, parsedTx, loading, fetchTransactionWithTxid])

  useEffect(() => {
    if (!isConnected || (!currentAddress && !paymentAddress)) {
      setHolderStatus('unknown')
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
  }, [isConnected, currentAddress, paymentAddress])

  const fetchTransaction = async () => {
    await fetchTransactionWithTxid(txid)
  }

  const revalidate = useCallback(async (): Promise<RevalidateResult> => {
    if (!parsedTx || !currentAddress) {
      toast.error('Missing transaction context. Analyze again.')
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

      if (data.transaction.status === 'confirmed') {
        toast.info('Parent transaction already confirmed. No cancellation needed.')
        return { ok: false }
      }

      if (!data.transaction.optInRbf) {
        toast.error('Transaction does not support RBF. Cannot cancel.')
        return { ok: false }
      }

      return { ok: true, payload: data.transaction as ParsedTransaction }
    } catch (error) {
      console.error('Revalidation error:', error)
      toast.error('Unable to refresh transaction before cancellation.')
      return { ok: false }
    }
  }, [parsedTx, currentAddress, paymentAddress, toast])

  const signAndBroadcastPsbt = useCallback(
    async (psbtBase64Input: string) => {
      if (!client) {
        throw new Error('Wallet client unavailable for signing.')
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

  const cancelTransaction = async () => {
    if (!parsedTx || !paymentAddress) {
      setError('Missing transaction context. Analyze again.')
      return
    }

    if (!holderAllowed) {
      setError('Only verified holders can use this tool.')
      return
    }

    const validation = await revalidate()
    if (!validation.ok) {
      return
    }

    const currentTx = validation.payload
    const currentFee = currentTx.fee
    const vsize = currentTx.vsize || 0
    const newTotalFee = Math.ceil(vsize * targetRate)

    if (!vsize) {
      setError('Unable to determine transaction size. Try again later.')
      return
    }

    if (newTotalFee <= currentFee) {
      setError('Increase the fee rate above the original to broadcast a cancellation.')
      return
    }

    setBroadcasting(true)
    setError(null)

    try {
      const response = await fetch('/api/speedup/create-cancel-psbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentTxid: currentTx.txid,
          targetFeeRate: targetRate,
          walletAddresses: [currentAddress, paymentAddress].filter(Boolean),
          paymentPublicKey,
          taprootPublicKey: publicKey,
          returnAddress: paymentAddress
        })
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to craft cancellation transaction')
      }

      const txid = await signAndBroadcastPsbt(data.psbt)
      toast.success('Cancellation broadcast. Replace transaction will return funds to your wallet.')
      setSuccessTxid(txid)
      setParsedTx(null)
      setTxid('')
    } catch (err) {
      console.error('Cancel TX error:', err)
      const message = err instanceof Error ? err.message : 'Failed to cancel transaction'
      setError(message)
      toast.error(message)
    } finally {
      setBroadcasting(false)
    }
  }

  const canCancel = parsedTx && parsedTx.status === 'unconfirmed' && parsedTx.optInRbf && holderAllowed

  return (
    <div className="px-4 py-12 md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link
            href="/tools"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500 transition hover:text-purple-200"
          >
            <ArrowRight className="h-3 w-3 rotate-180" /> Back to Pools
          </Link>
          <div className="flex flex-wrap gap-2">
            {TOOL_LINKS.map((tool) => {
              const isActive = tool.href === '/tools/cancel'
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className={`rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                    isActive
                      ? 'border-purple-400/60 bg-purple-500/20 text-purple-200'
                      : 'border-zinc-700/40 bg-black/40 text-zinc-500 hover:border-purple-400/40 hover:text-purple-200'
                  }`}
                >
                  {tool.name}
                </Link>
              )
            })}
          </div>
        </div>

        <header className="space-y-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-900/20 px-4 py-1 text-xs font-mono uppercase tracking-[0.3em] text-purple-200">
            <Undo2 className="h-4 w-4" /> Cancel Transaction
          </div>
          <h1 className="text-4xl font-black uppercase tracking-[0.4em] text-purple-200 md:text-5xl">Abort the Send</h1>
          <p className="mx-auto max-w-2xl text-sm text-zinc-400 md:text-base">
            Works only for RBF-enabled transactions where every input belongs to your wallet.
          </p>
        </header>

        <div className="rounded-3xl border border-purple-500/20 bg-zinc-950/70 p-8">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="txid" className="text-xs font-semibold uppercase tracking-[0.4em] text-zinc-400">
                Transaction Id
              </Label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  id="txid"
                  placeholder="Paste 64-character transaction ID"
                  value={txid}
                  onChange={(e) => setTxid(e.target.value.trim())}
                  className="w-full rounded-2xl border border-purple-500/30 bg-black/60 font-mono text-sm text-purple-100"
                  disabled={loading || broadcasting}
                />
                <Button
                  onClick={fetchTransaction}
                  disabled={loading || broadcasting || !isConnected || !txid || !holderAllowed}
                  className="inline-flex min-w-[140px] items-center justify-center rounded-2xl bg-gradient-to-r from-purple-400 via-indigo-500 to-blue-500 py-2 text-sm font-semibold text-slate-950"
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
              {!isConnected && (
                <Alert className="bg-amber-500/10 text-amber-100">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Connect your wallet to stage a cancellation.</AlertDescription>
                </Alert>
              )}
              {isConnected && holderStatus === 'checking' && (
                <Alert className="bg-blue-500/10 text-blue-100">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertDescription>Verifying holder status…</AlertDescription>
                </Alert>
              )}
              {isConnected && holderStatus !== 'checking' && holderStatus !== 'holder' && holderMessage && (
                <Alert className="bg-rose-500/10 text-rose-100">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{holderMessage}</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert className="bg-rose-500/10 text-rose-100">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            {successTxid && (
              <div className="space-y-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6 text-center">
                <ShieldCheck className="mx-auto h-10 w-10 text-emerald-300" />
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-emerald-100">Replacement broadcast</h3>
                  <p className="text-sm text-emerald-200">Funds are returning to your wallet at the higher fee tier.</p>
                </div>
                <div className="rounded-xl border border-emerald-400/30 bg-black/40 p-4 text-xs font-mono text-emerald-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{successTxid}</span>
                    <a
                      href={`https://mempool.space/tx/${successTxid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-200"
                    >
                      View
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    setSuccessTxid(null)
                    setParsedTx(null)
                    setTxid('')
                  }}
                  className="rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
                >
                  Cancel another
                </Button>
              </div>
            )}

            {parsedTx && !successTxid && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-purple-400/20 bg-black/50 p-4 text-xs uppercase tracking-[0.3em] text-zinc-400">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Status: {parsedTx.status === 'unconfirmed' ? 'Unconfirmed' : 'Confirmed'}</span>
                    <span>Opt-in RBF: {parsedTx.optInRbf ? 'Yes' : 'No'}</span>
                    <span>Fee rate: {formatRate(parsedTx.feeRate)} sat/vB</span>
                    <span>Fee paid: {formatSats(parsedTx.fee)} sats</span>
                  </div>
                  <div className="mt-2 truncate font-mono normal-case tracking-normal text-sky-200">
                    {parsedTx.txid}
                  </div>
                </div>

                {!parsedTx.optInRbf && (
                  <Alert className="bg-rose-500/10 text-rose-100">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>This transaction was broadcast without opt-in RBF. Cancellation is impossible.</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-400">
                    Target fee rate
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={targetRate}
                      onChange={(e) => setTargetRate(Math.max(1, Number(e.target.value)))}
                      className="w-28 rounded-xl border border-purple-500/40 bg-black/60 text-lg font-semibold text-purple-200"
                      min={Math.max(1, parsedTx.feeRate + 0.01)}
                      step="0.01"
                    />
                    <span className="text-sm text-zinc-400">sat/vB</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Must be greater than the original {formatRate(parsedTx.feeRate)} sat/vB to replace the transaction.
                  </p>
                </div>

                <Button
                  onClick={cancelTransaction}
                  disabled={!canCancel || broadcasting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-400 via-rose-500 to-amber-500 py-3 text-lg font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {broadcasting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Broadcasting cancellation…
                    </>
                  ) : (
                    <>
                      <Undo2 className="h-5 w-5" />
                      Cancel transaction
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </Button>

                <div className="rounded-2xl border border-blue-500/20 bg-blue-900/10 p-4 text-xs text-blue-200">
                  <p className="uppercase tracking-[0.3em] text-blue-300">When RBF is available</p>
                  <ul className="mt-2 space-y-1 normal-case tracking-normal text-blue-100">
                    <li>• Parent was broadcast with BIP-125 opt-in.</li>
                    <li>• Every input belongs to your connected wallet.</li>
                    <li>• You choose a higher fee rate than the original send.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

