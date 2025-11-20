'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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
  const { currentAddress: address, client, isConnected } = useWallet()
  const toast = useToast()
  const [linkedData, setLinkedData] = useState<LinkedWalletsData | null>(null)
  const [loading, setLoading] = useState(false)

  const truncateAddress = (addr: string) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const fetchLinkedWallets = async () => {
    if (!address) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/wallet/linked?walletAddress=${encodeURIComponent(address)}`, {
        cache: 'no-store'
      })
      
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

  useEffect(() => {
    if (address) {
      fetchLinkedWallets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

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

  if (!isConnected || !address) {
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-600/40 bg-black/70 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-mono uppercase tracking-[0.3em] text-red-100">
            Linked Wallets
          </h3>
          <Link href={`/link-wallet?primary=${encodeURIComponent(address)}`}>
            <Button className="border border-amber-600/50 bg-amber-900/20 text-amber-200 hover:bg-amber-900/30 px-3 py-1.5 text-sm">
              <Link2 className="mr-2 h-4 w-4" />
              Link New Wallet
            </Button>
          </Link>
        </div>

        {/* Info about linking */}
        <div className="mb-4 rounded-lg border border-blue-600/30 bg-blue-900/10 p-4">
          <p className="text-xs text-blue-300">
            <strong>Tip:</strong> Click &quot;Link New Wallet&quot; above to add another Bitcoin wallet to your profile. All linked wallets will share the same holdings and progress.
          </p>
        </div>

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

