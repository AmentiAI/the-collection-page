'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft, ChevronRight, ExternalLink, Search, X, Copy, Check } from 'lucide-react'
import Image from 'next/image'

type MintInscription = {
  id: string
  mint_queue_id: string | null
  wallet_address: string
  payment_address: string | null
  receiving_address: string | null
  commit_tx_id: string | null
  reveal_tx_id: string | null
  inscription_id: string | null
  fee_rate: number
  commit_fee_sats: number | null
  reveal_fee_sats: number | null
  total_cost_sats: number | null
  mint_status: string
  error_message: string | null
  created_at: string
  updated_at: string
  commit_signed_at: string | null
  commit_broadcast_at: string | null
  commit_confirmed_at: string | null
  reveal_broadcast_at: string | null
  reveal_confirmed_at: string | null
  completed_at: string | null
  last_checked_at: string | null
  source_inscription_id: string | null
  image_blob_url: string | null
  compressed_image_url: string | null
  is_rbf_replaced?: boolean
  rbf_replacement_tx?: string | null
}

export default function MintInscriptionsAdminPage() {
  const [loading, setLoading] = useState(false)
  const [mintInscriptions, setMintInscriptions] = useState<MintInscription[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [walletSearch, setWalletSearch] = useState('')
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null)
  const [broadcastingReveal, setBroadcastingReveal] = useState<string | null>(null)

  const LIMIT = 10

  const loadMintInscriptions = useCallback(async (page: number, wallet?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: LIMIT.toString(),
      })
      if (wallet && wallet.trim()) {
        params.append('wallet', wallet.trim())
      }
      
      const response = await fetch(
        `/api/admin/mint-inscriptions?${params.toString()}`,
        { cache: 'no-store' }
      )
      if (!response.ok) throw new Error('Failed to load mint inscriptions')
      const data = await response.json()
      setMintInscriptions(data.records || [])
      setTotalRecords(data.total || 0)
      setTotalPages(data.totalPages || 1)
    } catch (error) {
      console.error('Failed to load mint inscriptions:', error)
      alert('Failed to load mint inscriptions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setCurrentPage(1) // Reset to page 1 when search changes
    loadMintInscriptions(1, walletSearch)
  }, [walletSearch, loadMintInscriptions])

  useEffect(() => {
    loadMintInscriptions(currentPage, walletSearch)
  }, [currentPage, walletSearch, loadMintInscriptions])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCurrentPage(1)
    loadMintInscriptions(1, walletSearch)
  }

  const clearSearch = () => {
    setWalletSearch('')
    setCurrentPage(1)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-emerald-400'
      case 'failed':
      case 'reveal_failed':
        return 'text-red-400'
      case 'commit_broadcast':
      case 'reveal_broadcast':
      case 'waiting_commit_confirmation':
      case 'waiting_reveal_confirmation':
        return 'text-yellow-400'
      default:
        return 'text-gray-400'
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString()
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedWallet(id)
      setTimeout(() => setCopiedWallet(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      alert('Failed to copy to clipboard')
    }
  }

  const handleBroadcastReveal = async (mintId: string) => {
    if (broadcastingReveal) return
    
    setBroadcastingReveal(mintId)
    try {
      const response = await fetch('/api/admin/mint-inscriptions/broadcast-reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mintInscriptionId: mintId })
      })

      const data = await response.json()

      if (!data.success) {
        alert(`Failed to broadcast reveal: ${data.error || 'Unknown error'}`)
        return
      }

      alert(`✅ Reveal transaction broadcast successfully!\n\nReveal TX: ${data.revealTxId}\nInscription ID: ${data.inscriptionId || 'Pending'}`)
      
      // Reload the page to show updated status
      loadMintInscriptions(currentPage, walletSearch)
    } catch (error) {
      console.error('Failed to broadcast reveal:', error)
      alert(`Failed to broadcast reveal: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setBroadcastingReveal(null)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Mint Inscriptions Admin</h1>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by wallet address..."
                value={walletSearch}
                onChange={(e) => setWalletSearch(e.target.value)}
                className="pl-10 pr-10 bg-gray-900 border-gray-700 text-white"
              />
              {walletSearch && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              Search
            </Button>
          </div>
        </form>

        <div className="mb-4 text-sm text-gray-400">
          Total Records: {totalRecords} | Page {currentPage} of {totalPages}
          {walletSearch && (
            <span className="ml-2 text-blue-400">
              | Filtered by: {walletSearch.substring(0, 10)}...
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {mintInscriptions.map((mint) => (
              <div
                key={mint.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Image */}
                  {(mint.image_blob_url || mint.compressed_image_url) && (
                    <div className="md:col-span-1">
                      <Image
                        src={mint.compressed_image_url || mint.image_blob_url || ''}
                        alt="Mint image"
                        width={100}
                        height={100}
                        className="rounded border border-gray-700 object-cover"
                        unoptimized
                      />
                    </div>
                  )}

                  {/* Main Info */}
                  <div className="space-y-2">
                    <div>
                      <span className="text-gray-400 text-sm">ID:</span>
                      <span className="ml-2 font-mono text-xs">{mint.id.substring(0, 8)}...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div>
                        <span className="text-gray-400 text-sm">Status:</span>
                        <span className={`ml-2 font-semibold ${getStatusColor(mint.mint_status)}`}>
                          {mint.mint_status}
                        </span>
                      </div>
                      {mint.mint_status === 'commit_in_mempool' && !mint.reveal_tx_id && (
                        <Button
                          onClick={() => handleBroadcastReveal(mint.id)}
                          disabled={broadcastingReveal === mint.id}
                          size="sm"
                          variant="outline"
                          className="ml-2 text-xs h-7"
                        >
                          {broadcastingReveal === mint.id ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Broadcasting...
                            </>
                          ) : (
                            'Broadcast Reveal'
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-sm">Wallet:</span>
                      <span className="font-mono text-xs">
                        {mint.wallet_address.substring(0, 10)}...{mint.wallet_address.slice(-8)}
                      </span>
                      <button
                        onClick={() => copyToClipboard(mint.wallet_address, mint.id)}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Copy wallet address"
                      >
                        {copiedWallet === mint.id ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {mint.source_inscription_id && (
                      <div>
                        <span className="text-gray-400 text-sm">Source:</span>
                        <span className="ml-2 font-mono text-xs">
                          {mint.source_inscription_id.substring(0, 20)}...
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Transaction Info */}
                  <div className="space-y-2">
                    {mint.commit_tx_id && (
                      <div>
                        <span className="text-gray-400 text-sm">Commit TX:</span>
                        <a
                          href={`https://mempool.space/tx/${mint.commit_tx_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 font-mono text-xs text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1"
                        >
                          {mint.commit_tx_id.substring(0, 12)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {mint.reveal_tx_id && (
                      <div>
                        <span className="text-gray-400 text-sm">Reveal TX:</span>
                        <div className="inline-flex items-center gap-2 flex-wrap">
                          <a
                            href={`https://mempool.space/tx/${mint.reveal_tx_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 font-mono text-xs text-green-400 hover:text-green-300 underline inline-flex items-center gap-1"
                          >
                            {mint.reveal_tx_id.substring(0, 12)}...
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {mint.is_rbf_replaced && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded border border-red-700">
                                ⚠️ RBF Replaced
                              </span>
                              {mint.rbf_replacement_tx && (
                                <a
                                  href={`https://mempool.space/tx/${mint.rbf_replacement_tx}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-orange-400 hover:text-orange-300 underline inline-flex items-center gap-1"
                                  title="View replacement transaction"
                                >
                                  Replacement: {mint.rbf_replacement_tx.substring(0, 8)}...
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {!mint.reveal_tx_id && mint.commit_confirmed_at && mint.mint_status !== 'completed' && (
                      <div>
                        <span className="text-gray-400 text-sm">Reveal TX:</span>
                        <span className="ml-2 text-xs text-yellow-400">Not found</span>
                      </div>
                    )}
                    {mint.inscription_id && (
                      <div>
                        <span className="text-gray-400 text-sm">Inscription:</span>
                        <a
                          href={`https://ordinals.com/inscription/${mint.inscription_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 font-mono text-xs text-purple-400 hover:text-purple-300 underline inline-flex items-center gap-1"
                        >
                          {mint.inscription_id.substring(0, 12)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Fees and Costs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-gray-800">
                  <div>
                    <span className="text-gray-400 text-xs">Fee Rate:</span>
                    <div className="text-sm font-mono">{mint.fee_rate} sat/vB</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Commit Fee:</span>
                    <div className="text-sm font-mono">{mint.commit_fee_sats?.toLocaleString() || '—'} sats</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Reveal Fee:</span>
                    <div className="text-sm font-mono">{mint.reveal_fee_sats?.toLocaleString() || '—'} sats</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Total Cost:</span>
                    <div className="text-sm font-mono">{mint.total_cost_sats?.toLocaleString() || '—'} sats</div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-gray-800 text-xs">
                  <div>
                    <span className="text-gray-400">Created:</span>
                    <div className="text-gray-300 font-mono">{formatDate(mint.created_at)}</div>
                  </div>
                  {mint.commit_broadcast_at && (
                    <div>
                      <span className="text-gray-400">Commit Broadcast:</span>
                      <div className="text-gray-300 font-mono">{formatDate(mint.commit_broadcast_at)}</div>
                    </div>
                  )}
                  {mint.reveal_broadcast_at && (
                    <div>
                      <span className="text-gray-400">Reveal Broadcast:</span>
                      <div className="text-gray-300 font-mono">{formatDate(mint.reveal_broadcast_at)}</div>
                    </div>
                  )}
                  {mint.completed_at && (
                    <div>
                      <span className="text-gray-400">Completed:</span>
                      <div className="text-emerald-400 font-mono">{formatDate(mint.completed_at)}</div>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {mint.error_message && (
                  <div className="pt-2 border-t border-gray-800">
                    <span className="text-red-400 text-xs font-semibold">Error:</span>
                    <div className="text-red-300 text-xs mt-1 font-mono bg-red-950/30 p-2 rounded">
                      {mint.error_message}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6">
          <Button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1 || loading}
            variant="outline"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <span className="text-sm text-gray-400">
            Page {currentPage} of {totalPages}
          </span>

          <Button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || loading}
            variant="outline"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  )
}

