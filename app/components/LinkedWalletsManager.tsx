'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Loader2, Link2, Unlink, Wallet, CheckCircle2, AlertCircle } from 'lucide-react'

interface LinkedWallet {
  wallet: string
  linkedAt: string
}

interface LinkedWalletsData {
  primaryWallet: string
  linkedWallets: LinkedWallet[]
  allWallets: string[]
  isLinkedWallet: boolean
}

export default function LinkedWalletsManager() {
  const { currentAddress: address, client } = useWallet()
  const toast = useToast()
  const [linkedData, setLinkedData] = useState<LinkedWalletsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState(false)
  const [showLinkInstructions, setShowLinkInstructions] = useState(false)

  const truncateAddress = (addr: string) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  useEffect(() => {
    if (address) {
      fetchLinkedWallets()
    }
  }, [address])

  const fetchLinkedWallets = async () => {
    if (!address) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/wallet/linked?walletAddress=${encodeURIComponent(address)}`)
      if (response.ok) {
        const data = await response.json()
        setLinkedData(data)
      }
    } catch (error) {
      console.error('Failed to fetch linked wallets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLinkWallet = async () => {
    if (!address || !linkedData) return
    
    // If current wallet is a linked wallet, we need to use the primary wallet
    const primaryWallet = linkedData.isLinkedWallet ? linkedData.primaryWallet : address
    
    setLinking(true)
    try {
      // Create message to sign
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const message = `Link this wallet to ${primaryWallet}\nTimestamp: ${timestamp}\nNonce: ${nonce}`
      
      // Sign with the current wallet
      if (!client || !client.signMessage) {
        throw new Error('Wallet client not available')
      }
      
      const signature = await client.signMessage(message)
      
      if (!signature) {
        throw new Error('Signature was cancelled or failed')
      }
      
      // Send to API
      const response = await fetch('/api/wallet/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryWallet,
          linkedWallet: address,
          signature,
          message
        })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        toast.success('Wallet linked successfully!')
        setShowLinkInstructions(false)
        await fetchLinkedWallets()
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

  const handleUnlinkWallet = async (walletToUnlink: string) => {
    if (!address || !linkedData) return
    
    const confirmed = window.confirm(
      `Are you sure you want to unlink ${truncateAddress(walletToUnlink)}?`
    )
    
    if (!confirmed) return
    
    try {
      const response = await fetch('/api/wallet/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryWallet: linkedData.primaryWallet,
          linkedWallet: walletToUnlink
        })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        toast.success('Wallet unlinked successfully')
        await fetchLinkedWallets()
      } else {
        throw new Error(data.error || 'Failed to unlink wallet')
      }
    } catch (error) {
      console.error('Unlink wallet error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to unlink wallet')
    }
  }

  if (!address) {
    return (
      <div className="rounded-lg border border-red-600/40 bg-black/70 p-6">
        <p className="text-sm text-red-300">Connect your wallet to manage linked wallets</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-red-600/40 bg-black/70 p-6">
        <div className="flex items-center gap-2 text-sm text-red-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading linked wallets...
        </div>
      </div>
    )
  }

  const isCurrentWalletLinked = linkedData?.isLinkedWallet && address.toLowerCase() !== linkedData.primaryWallet.toLowerCase()

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-600/40 bg-black/70 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-mono uppercase tracking-[0.3em] text-red-100">
            Linked Wallets
          </h3>
          <Button
            onClick={() => setShowLinkInstructions(!showLinkInstructions)}
            className="border border-amber-600/50 bg-amber-900/20 text-amber-200 hover:bg-amber-900/30 px-3 py-1.5 text-sm"
          >
            <Link2 className="mr-2 h-4 w-4" />
            Link New Wallet
          </Button>
        </div>

        {showLinkInstructions && (
          <div className="mb-4 rounded-lg border border-amber-600/40 bg-amber-900/10 p-4">
            <div className="mb-3 flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-400" />
              <div className="space-y-2 text-sm text-amber-200">
                <p className="font-semibold">To link a new wallet:</p>
                <ol className="ml-4 list-decimal space-y-1">
                  <li>Disconnect your current wallet</li>
                  <li>Connect the wallet you want to link</li>
                  <li>Click "Sign & Link" below</li>
                  <li>Sign the message to prove ownership</li>
                </ol>
                <p className="mt-2 text-xs text-amber-300/80">
                  Your linked wallet will share the same profile, holdings, and progress.
                </p>
              </div>
            </div>
            <Button
              onClick={handleLinkWallet}
              disabled={linking || isCurrentWalletLinked || linkedData?.allWallets.includes(address.toLowerCase())}
              className="w-full border border-amber-600 bg-amber-700/80 text-amber-100 hover:bg-amber-600"
            >
              {linking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : isCurrentWalletLinked ? (
                'Already Linked to Another Wallet'
              ) : linkedData?.allWallets.includes(address.toLowerCase()) ? (
                'This Wallet is Already Linked'
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Sign & Link Current Wallet
                </>
              )}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {/* Primary Wallet */}
          <div className="rounded-lg border border-emerald-600/40 bg-emerald-900/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.3em] text-emerald-300">
                    Primary Wallet
                  </p>
                  <p className="mt-1 font-mono text-sm text-emerald-100">
                    {truncateAddress(linkedData?.primaryWallet || address)}
                  </p>
                </div>
              </div>
              {address.toLowerCase() === linkedData?.primaryWallet.toLowerCase() && (
                <div className="rounded-full border border-emerald-500/40 bg-emerald-900/20 px-3 py-1 text-xs font-mono uppercase tracking-[0.3em] text-emerald-200">
                  Current
                </div>
              )}
            </div>
          </div>

          {/* Linked Wallets */}
          {linkedData?.linkedWallets && linkedData.linkedWallets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-mono uppercase tracking-[0.3em] text-red-300/80">
                Linked Wallets ({linkedData.linkedWallets.length})
              </p>
              {linkedData.linkedWallets.map((linked) => (
                <div
                  key={linked.wallet}
                  className="rounded-lg border border-red-600/40 bg-red-900/10 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Link2 className="h-5 w-5 text-red-400" />
                      <div>
                        <p className="font-mono text-sm text-red-100">
                          {truncateAddress(linked.wallet)}
                        </p>
                        <p className="mt-0.5 text-xs text-red-300/60">
                          Linked {new Date(linked.linkedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {address.toLowerCase() === linked.wallet.toLowerCase() && (
                        <div className="rounded-full border border-amber-500/40 bg-amber-900/20 px-3 py-1 text-xs font-mono uppercase tracking-[0.3em] text-amber-200">
                          Current
                        </div>
                      )}
                      <Button
                        onClick={() => handleUnlinkWallet(linked.wallet)}
                        className="border border-red-600/50 bg-red-900/20 text-red-200 hover:bg-red-900/30 px-2 py-1"
                      >
                        <Unlink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(!linkedData?.linkedWallets || linkedData.linkedWallets.length === 0) && (
            <div className="rounded-lg border border-red-600/20 bg-black/50 p-4 text-center">
              <p className="text-sm text-red-300/60">No linked wallets yet</p>
              <p className="mt-1 text-xs text-red-400/40">
                Link additional wallets to aggregate your holdings
              </p>
            </div>
          )}
        </div>
      </div>

      {linkedData?.isLinkedWallet && (
        <div className="rounded-lg border border-amber-600/40 bg-amber-900/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-400" />
            <div className="text-sm text-amber-200">
              <p className="font-semibold">Note:</p>
              <p className="mt-1">
                This wallet is linked to{' '}
                <span className="font-mono">{truncateAddress(linkedData.primaryWallet)}</span>.
                All data is shared between linked wallets.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

