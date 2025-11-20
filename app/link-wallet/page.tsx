'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import Header from '@/components/Header'
import { Loader2, Link2, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function LinkWalletPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentAddress, client, isConnected, disconnect } = useWallet()
  const toast = useToast()
  
  const [primaryWallet, setPrimaryWallet] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [step, setStep] = useState<'disconnect' | 'connect' | 'sign'>('disconnect')

  // On mount, verify the link token
  useEffect(() => {
    const token = searchParams.get('token')
    
    if (!token) {
      toast.error('Missing authorization token. Please start from your profile page.')
      router.push('/profile')
      return
    }

    // Verify the token
    fetch(`/api/wallet/link-session?token=${encodeURIComponent(token)}`, {
      cache: 'no-store'
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.primaryWallet) {
          setPrimaryWallet(data.primaryWallet)
          sessionStorage.setItem('link_wallet_token', token)
        } else {
          throw new Error(data.error || 'Invalid session')
        }
      })
      .catch(error => {
        console.error('Failed to verify link session:', error)
        toast.error('Invalid or expired authorization. Please try again from your profile.')
        router.push('/profile')
      })
  }, [searchParams, router, toast])

  useEffect(() => {
    if (!primaryWallet) return
      
      // If currently connected to the primary wallet, need to disconnect
      if (currentAddress?.toLowerCase() === primary.toLowerCase()) {
        setStep('disconnect')
      } else if (!isConnected) {
        setStep('connect')
      } else {
        // Connected to a different wallet - ready to link
        setStep('sign')
      }
    } else {
      // No primary wallet specified, redirect to profile
      toast.error('No primary wallet specified')
      router.push('/profile')
    }
  }, [searchParams, currentAddress, isConnected, router, toast])

  // Update step based on connection status
  useEffect(() => {
    if (!primaryWallet) return

    if (isConnected && currentAddress) {
      if (currentAddress.toLowerCase() === primaryWallet.toLowerCase()) {
        setStep('disconnect')
      } else {
        setStep('sign')
      }
    } else {
      setStep('connect')
    }
  }, [isConnected, currentAddress, primaryWallet])

  const handleDisconnect = () => {
    disconnect()
    setStep('connect')
  }

  const handleLinkWallet = async () => {
    if (!currentAddress || !primaryWallet || !client) {
      toast.error('Missing required data')
      return
    }

    if (currentAddress.toLowerCase() === primaryWallet.toLowerCase()) {
      toast.error('Cannot link the same wallet to itself')
      return
    }

    setLinking(true)
    try {
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const message = `Link this wallet to ${primaryWallet}\nTimestamp: ${timestamp}\nNonce: ${nonce}`

      if (!client.signMessage) {
        throw new Error('Wallet does not support message signing')
      }

      const signature = await client.signMessage(message)

      if (!signature) {
        throw new Error('Signature was cancelled')
      }

      const linkToken = sessionStorage.getItem('link_wallet_token')
      if (!linkToken) {
        throw new Error('Authorization token missing. Please restart the linking process.')
      }

      const response = await fetch('/api/wallet/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryWallet,
          linkedWallet: currentAddress,
          signature,
          message,
          linkToken
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Wallet linked successfully!')
        sessionStorage.removeItem('link_wallet_primary')
        
        // Wait a moment then redirect
        setTimeout(() => {
          router.push('/profile')
        }, 1500)
      } else {
        throw new Error(data.error || 'Failed to link wallet')
      }
    } catch (error) {
      console.error('Link wallet error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to link wallet')
    } finally {
      setLinking(false)
    }
  }

  const truncateAddress = (addr: string) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  if (!primaryWallet) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-red-950/20 to-black">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <div className="mx-auto max-w-2xl">
            <p className="text-center text-red-300">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-red-950/20 to-black">
      <Header />
      
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-2xl space-y-6">
          <Link href="/profile" className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300">
            <ArrowLeft className="h-4 w-4" />
            Back to Profile
          </Link>

          <div className="rounded-3xl border border-red-600/40 bg-black/70 p-8 shadow-[0_0_25px_rgba(220,38,38,0.3)]">
            <div className="mb-6 flex items-center gap-3">
              <Link2 className="h-8 w-8 text-red-400" />
              <h1 className="text-2xl font-mono uppercase tracking-[0.3em] text-red-100">
                Link New Wallet
              </h1>
            </div>

            {/* Primary Wallet Info */}
            <div className="mb-6 rounded-lg border border-emerald-600/40 bg-emerald-900/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-400/70 mb-2">
                Primary Wallet
              </p>
              <p className="font-mono text-emerald-200">{truncateAddress(primaryWallet)}</p>
            </div>

            {/* Steps */}
            <div className="space-y-4">
              {/* Step 1: Disconnect */}
              {step === 'disconnect' && (
                <div className="rounded-lg border border-amber-600/40 bg-amber-900/10 p-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-6 w-6 text-amber-400 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-amber-200 mb-3">
                        Step 1: Disconnect Your Primary Wallet
                      </h3>
                      <p className="text-sm text-amber-200/80 mb-4">
                        You are currently connected with your primary wallet. To link a new wallet, you need to disconnect first.
                      </p>
                      <Button
                        onClick={handleDisconnect}
                        className="w-full border border-amber-600 bg-amber-700/80 text-amber-100 hover:bg-amber-600"
                      >
                        Disconnect {truncateAddress(currentAddress || '')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Connect */}
              {step === 'connect' && (
                <div className="rounded-lg border border-blue-600/40 bg-blue-900/10 p-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-blue-200 mb-3">
                        Step 2: Connect the Wallet You Want to Link
                      </h3>
                      <p className="text-sm text-blue-200/80 mb-4">
                        Open your wallet extension and connect with the wallet address you want to link to your profile.
                      </p>
                      <div className="rounded bg-blue-950/30 p-3 text-xs text-blue-300 mb-4">
                        <p className="font-semibold mb-2">Instructions:</p>
                        <ol className="list-decimal ml-4 space-y-1">
                          <li>Open your wallet extension (Unisat, Xverse, etc.)</li>
                          <li>Switch to or select the wallet you want to link</li>
                          <li>Click the wallet connect button in the header</li>
                          <li>Authorize the connection</li>
                        </ol>
                      </div>
                      <p className="text-xs text-blue-300/70">
                        Waiting for wallet connection...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Sign */}
              {step === 'sign' && (
                <div className="rounded-lg border border-green-600/40 bg-green-900/10 p-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-400 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-green-200 mb-3">
                        Step 3: Sign to Link This Wallet
                      </h3>
                      <p className="text-sm text-green-200/80 mb-4">
                        You are now connected with: <span className="font-mono font-semibold">{truncateAddress(currentAddress || '')}</span>
                      </p>
                      <p className="text-sm text-green-200/80 mb-4">
                        Click the button below to sign a message and link this wallet to your profile.
                      </p>
                      <Button
                        onClick={handleLinkWallet}
                        disabled={linking}
                        className="w-full border border-green-600 bg-green-700/80 text-green-100 hover:bg-green-600"
                      >
                        {linking ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing & Linking...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Sign & Link This Wallet
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Help Text */}
            <div className="mt-6 rounded-lg border border-red-600/30 bg-red-900/10 p-4">
              <p className="text-xs text-red-300/80">
                <strong>Note:</strong> You will need to sign a message to prove you own the wallet you&apos;re linking. This is completely safe and doesn&apos;t give us access to your funds.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

