'use client'

import { useState, useCallback } from 'react'
import { Skull, Search, Loader2, Eye, EyeOff, CheckCircle, Clock, XCircle } from 'lucide-react'
import Image from 'next/image'
import Header from '@/components/Header'

type GraveyardEntry = {
  inscriptionId: string
  txId: string
  status: string
  source: string
  ascensionPowder: number
  imageBlobUrl: string | null
  hidden: boolean
  generationPrompt: string | null
  createdAt: string
  confirmedAt: string | null
  updatedAt: string | null
}

type MintQueueItem = {
  id: string
  imageUrl: string
  imageBlobUrl: string | null
  compressedImageUrl: string | null
  compressedSizeBytes: number | null
  isCompressed: boolean
  sourceInscriptionId: string
  generationPrompt: string | null
  createdAt: string
  mintStatus: string | null
  mintInscriptionId: string | null
  commitTxId: string | null
  revealTxId: string | null
  mintedInscriptionId: string | null
  mintCompletedAt: string | null
  errorMessage: string | null
  isMinted: boolean
}

type Profile = {
  username: string | null
  avatar_url: string | null
  ascension_powder: number
  wallet_address: string
}

export default function SAdminGraveyardPage() {
  const [walletAddress, setWalletAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    walletAddress: string
    profile: Profile | null
    graveyard: {
      total: number
      visible: number
      hidden: number
      entries: GraveyardEntry[]
    }
    mintQueue: {
      total: number
      minted: number
      awaiting: number
      mintedItems: MintQueueItem[]
      awaitingItems: MintQueueItem[]
    }
  } | null>(null)

  const handleSearch = useCallback(async () => {
    if (!walletAddress.trim()) {
      setError('Please enter a wallet address')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/sadmin/graveyard?wallet=${encodeURIComponent(walletAddress.trim())}`,
        { cache: 'no-store' }
      )

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch graveyard data')
      }

      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [walletAddress])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'text-green-400'
      case 'pending':
        return 'text-yellow-400'
      case 'failed':
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  const getMintStatusBadge = (item: MintQueueItem) => {
    if (item.isMinted) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-400">
          <CheckCircle className="h-3 w-3" />
          Minted
        </span>
      )
    }
    if (item.mintStatus) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/20 px-2 py-1 text-xs text-yellow-400">
          <Clock className="h-3 w-3" />
          {item.mintStatus}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/20 px-2 py-1 text-xs text-gray-400">
        <Clock className="h-3 w-3" />
        Awaiting Mint
      </span>
    )
  }

  return (
    <div className="relative min-h-screen w-full bg-black text-white">
      <Header connected={false} showMusicControls={false} />

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8">
        <div className="flex items-center gap-3">
          <Skull className="h-8 w-8 text-red-400" />
          <h1 className="text-3xl font-bold uppercase tracking-[0.2em] text-red-200">
            Super Admin - Graveyard Viewer
          </h1>
        </div>

        {/* Search Section */}
        <div className="rounded-2xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_30px_rgba(220,38,38,0.35)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-semibold uppercase tracking-[0.1em] text-red-300">
                Wallet Address
              </label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch()
                  }
                }}
                placeholder="Enter wallet address..."
                className="w-full rounded-lg border border-red-600/50 bg-black/50 px-4 py-2 text-white placeholder:text-gray-500 focus:border-red-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-red-600/50 bg-red-600/20 px-6 py-2 font-semibold uppercase tracking-[0.1em] text-red-200 transition hover:bg-red-600/30 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Search
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-600/40 bg-red-950/20 p-4 text-red-200">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Profile Summary */}
            {data.profile && (
              <div className="rounded-2xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_30px_rgba(220,38,38,0.35)]">
                <h2 className="mb-4 text-xl font-bold uppercase tracking-[0.1em] text-red-300">
                  Profile
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm text-gray-400">Username</p>
                    <p className="text-lg font-semibold text-white">
                      {data.profile.username || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Wallet</p>
                    <p className="break-all text-sm font-mono text-white">
                      {data.profile.wallet_address}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Ascension Powder</p>
                    <p className="text-lg font-semibold text-amber-400">
                      {data.profile.ascension_powder.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Graveyard Section */}
            <div className="rounded-2xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_30px_rgba(220,38,38,0.35)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold uppercase tracking-[0.1em] text-red-300">
                  Graveyard
                </h2>
                <div className="flex gap-4 text-sm">
                  <span className="text-gray-400">
                    Total: <span className="text-white">{data.graveyard.total}</span>
                  </span>
                  <span className="text-green-400">
                    Visible: <span className="text-white">{data.graveyard.visible}</span>
                  </span>
                  <span className="text-red-400">
                    Hidden: <span className="text-white">{data.graveyard.hidden}</span>
                  </span>
                </div>
              </div>

              {data.graveyard.entries.length === 0 ? (
                <p className="text-center text-gray-400">No graveyard entries found</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {data.graveyard.entries.map((entry) => (
                    <div
                      key={entry.inscriptionId}
                      className={`rounded-lg border p-4 ${
                        entry.hidden
                          ? 'border-gray-600/50 bg-gray-900/30 opacity-60'
                          : 'border-red-600/50 bg-black/50'
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {entry.hidden ? (
                            <EyeOff className="h-4 w-4 text-gray-500" />
                          ) : (
                            <Eye className="h-4 w-4 text-green-400" />
                          )}
                          <span className={`text-xs font-semibold ${getStatusColor(entry.status)}`}>
                            {entry.status.toUpperCase()}
                          </span>
                        </div>
                        {entry.hidden && (
                          <span className="text-xs text-gray-500">HIDDEN</span>
                        )}
                      </div>

                      {entry.imageBlobUrl && (
                        <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-lg">
                          <Image
                            src={entry.imageBlobUrl}
                            alt={entry.inscriptionId}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      )}

                      <div className="space-y-1 text-xs">
                        <p className="break-all font-mono text-gray-400">
                          {entry.inscriptionId.slice(0, 20)}...
                        </p>
                        <p>
                          <span className="text-gray-500">Source:</span>{' '}
                          <span className="text-white">{entry.source}</span>
                        </p>
                        <p>
                          <span className="text-gray-500">Powder:</span>{' '}
                          <span className="text-amber-400">{entry.ascensionPowder}</span>
                        </p>
                        <p>
                          <span className="text-gray-500">Created:</span>{' '}
                          <span className="text-white">{formatDate(entry.createdAt)}</span>
                        </p>
                        {entry.confirmedAt && (
                          <p>
                            <span className="text-gray-500">Confirmed:</span>{' '}
                            <span className="text-white">{formatDate(entry.confirmedAt)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mint Queue Section */}
            <div className="rounded-2xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_30px_rgba(220,38,38,0.35)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold uppercase tracking-[0.1em] text-red-300">
                  Mint Queue
                </h2>
                <div className="flex gap-4 text-sm">
                  <span className="text-gray-400">
                    Total: <span className="text-white">{data.mintQueue.total}</span>
                  </span>
                  <span className="text-green-400">
                    Minted: <span className="text-white">{data.mintQueue.minted}</span>
                  </span>
                  <span className="text-yellow-400">
                    Awaiting: <span className="text-white">{data.mintQueue.awaiting}</span>
                  </span>
                </div>
              </div>

              {/* Awaiting Mint */}
              {data.mintQueue.awaitingItems.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-3 text-lg font-semibold text-yellow-400">
                    Awaiting Mint ({data.mintQueue.awaitingItems.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {data.mintQueue.awaitingItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-yellow-600/50 bg-black/50 p-4"
                      >
                        <div className="mb-2">{getMintStatusBadge(item)}</div>
                        {(item.imageBlobUrl || item.imageUrl) && (
                          <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-lg">
                            <Image
                              src={item.imageBlobUrl || item.imageUrl}
                              alt={item.id}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                        )}
                        <div className="space-y-1 text-xs">
                          <p className="break-all font-mono text-gray-400">
                            Source: {item.sourceInscriptionId.slice(0, 20)}...
                          </p>
                          <p>
                            <span className="text-gray-500">Created:</span>{' '}
                            <span className="text-white">{formatDate(item.createdAt)}</span>
                          </p>
                          {item.isCompressed && item.compressedSizeBytes && (
                            <p>
                              <span className="text-gray-500">Size:</span>{' '}
                              <span className="text-white">
                                {(item.compressedSizeBytes / 1024).toFixed(1)} KB
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Minted Items */}
              {data.mintQueue.mintedItems.length > 0 && (
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-green-400">
                    Minted ({data.mintQueue.mintedItems.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {data.mintQueue.mintedItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-green-600/50 bg-black/50 p-4"
                      >
                        <div className="mb-2">{getMintStatusBadge(item)}</div>
                        {(item.imageBlobUrl || item.imageUrl) && (
                          <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-lg">
                            <Image
                              src={item.imageBlobUrl || item.imageUrl}
                              alt={item.id}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                        )}
                        <div className="space-y-1 text-xs">
                          <p className="break-all font-mono text-gray-400">
                            Source: {item.sourceInscriptionId.slice(0, 20)}...
                          </p>
                          {item.mintedInscriptionId && (
                            <p className="break-all font-mono text-green-400">
                              Minted: {item.mintedInscriptionId.slice(0, 20)}...
                            </p>
                          )}
                          <p>
                            <span className="text-gray-500">Created:</span>{' '}
                            <span className="text-white">{formatDate(item.createdAt)}</span>
                          </p>
                          {item.mintCompletedAt && (
                            <p>
                              <span className="text-gray-500">Completed:</span>{' '}
                              <span className="text-white">
                                {formatDate(item.mintCompletedAt)}
                              </span>
                            </p>
                          )}
                          {item.errorMessage && (
                            <p className="text-red-400">
                              <span className="text-gray-500">Error:</span> {item.errorMessage}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.mintQueue.total === 0 && (
                <p className="text-center text-gray-400">No mint queue items found</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

