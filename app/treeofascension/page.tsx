'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useLaserEyes } from '@omnisat/lasereyes'

import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/Toast'
import { MintButton } from '@/components/MintButton'
import dynamicImport from 'next/dynamic'

// LaserEyesWrapper is already provided by app/layout.tsx, no need to wrap again

type MintQueueImage = {
  id: string
  imageUrl: string
  sourceInscriptionId: string
  hasSilver?: boolean
  hasGlow?: boolean
  compressedImageUrl?: string
  compressedSizeBytes?: number
  isCompressed?: boolean
  mintInscription?: {
    id: string
    status: string
    commitTxId?: string
    revealTxId?: string
    inscriptionId?: string
    errorMessage?: string
  } | null
}

export default function TreeOfAscensionPage() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [mintQueueImages, setMintQueueImages] = useState<MintQueueImage[]>([])
  const [regenerationAllowance, setRegenerationAllowance] = useState(0)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [regenerateComparison, setRegenerateComparison] = useState<{
    mintQueueId: string
    originalImageUrl: string
    regeneratedImageUrl: string
    regeneratedImageBlobUrl: string
  } | null>(null)
  const [applyingRegenerate, setApplyingRegenerate] = useState(false)

  // Throttle mint queue fetches
  const lastMintQueueFetch = useRef<number>(0)
  const MINT_QUEUE_THROTTLE_MS = 3000 // Minimum 3 seconds between calls
  const refreshIntervalRef = useRef<number | null>(null)
  const compressionTimeoutsRef = useRef<Set<number>>(new Set())

  const ordinalAddress = address?.trim() || ''

  // Use ref to store the latest ordinalAddress to avoid dependency issues
  const ordinalAddressRef = useRef(ordinalAddress)
  useEffect(() => {
    ordinalAddressRef.current = ordinalAddress
  }, [ordinalAddress])

  // Track which images are being compressed to prevent duplicate compressions
  const compressingImages = useRef<Set<string>>(new Set())
  
  // Store fetch function in ref to avoid dependency issues
  const fetchMintQueueImagesRef = useRef<((force?: boolean) => Promise<void>) | null>(null)

  const fetchMintQueueImages = useCallback(async (force = false) => {
    const currentAddress = ordinalAddressRef.current
    if (!currentAddress) {
      setMintQueueImages([])
      return
    }

    // Throttle: Don't fetch if called too recently (unless forced)
    const now = Date.now()
    if (!force && (now - lastMintQueueFetch.current) < MINT_QUEUE_THROTTLE_MS) {
      console.log(`⏸️ Throttling mint queue fetch (${now - lastMintQueueFetch.current}ms since last call)`)
      return
    }
    lastMintQueueFetch.current = now

    try {
      const response = await fetch(`/api/graveyard/mint-queue?wallet=${encodeURIComponent(currentAddress)}`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      const data = await response.json().catch(() => null)

      if (response.ok && data?.success) {
        const records = data.records.map((record: any) => ({
          id: record.id,
          imageUrl: record.imageBlobUrl || record.imageUrl,
          sourceInscriptionId: record.sourceInscriptionId,
          hasSilver: record.hasSilver,
          hasGlow: record.hasGlow,
          compressedImageUrl: record.compressedImageUrl,
          compressedSizeBytes: record.compressedSizeBytes,
          isCompressed: record.isCompressed,
          mintInscription: record.mintInscription
        }))

        setMintQueueImages(records)

        // Auto-compress uncompressed images to show KB sizes (only once per image)
        // Use a single batch approach to avoid multiple timeouts
        const uncompressedRecords = records.filter(
          (record: any) => !record.isCompressed && record.imageUrl && !compressingImages.current.has(record.id)
        )

        if (uncompressedRecords.length > 0) {
          // Process compression in a single batch with a single refresh timeout
          uncompressedRecords.forEach((record: any) => {
            compressingImages.current.add(record.id)
          })

          // Compress all at once, then refresh once after all complete
          Promise.all(
            uncompressedRecords.map(async (record: any) => {
              try {
                console.log(`🗜️ Auto-compressing mint queue image ${record.id}`)
                const compressResponse = await fetch('/api/graveyard/mint/compress', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    mintQueueId: record.id,
                    imageUrl: record.imageUrl
                  })
                })

                if (compressResponse.ok) {
                  const compressData = await compressResponse.json()
                  console.log(`✅ Auto-compressed ${record.id}: ${(compressData.compressed_size / 1024).toFixed(1)} KB`)
                  return true
                }
                return false
              } catch (compressError) {
                console.error(`Failed to auto-compress ${record.id}:`, compressError)
                compressingImages.current.delete(record.id)
                return false
              }
            })
          ).then(() => {
            // Single refresh after all compressions complete
            if (fetchMintQueueImagesRef.current) {
              const timeoutId = window.setTimeout(() => {
                compressionTimeoutsRef.current.delete(timeoutId)
                fetchMintQueueImagesRef.current?.(false)
              }, 2000)
              compressionTimeoutsRef.current.add(timeoutId)
            }
          })
        }
      }
    } catch (error) {
      console.error('Error fetching mint queue:', error)
    }
  }, [])

  // Store fetch function in ref
  useEffect(() => {
    fetchMintQueueImagesRef.current = fetchMintQueueImages
  }, [fetchMintQueueImages])

  // Auto-refresh mint queue when there are in-progress mints
  useEffect(() => {
    // Clear any existing interval first
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
      refreshIntervalRef.current = null
    }

    const hasInProgressMint = mintQueueImages.some(mint =>
      mint.mintInscription &&
      !['completed', 'failed'].includes(mint.mintInscription.status)
    )

    if (hasInProgressMint && ordinalAddress && document.visibilityState === 'visible') {
      console.log('🔄 Auto-refreshing mint queue (in-progress mint detected)')
      const doPoll = () => {
        // Only poll if page is visible
        if (document.visibilityState === 'visible' && fetchMintQueueImagesRef.current) {
          fetchMintQueueImagesRef.current(false)
        }
      }
      
      refreshIntervalRef.current = window.setInterval(doPoll, 20000) // Refresh every 20 seconds

      // Also refresh when page becomes visible
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && fetchMintQueueImagesRef.current) {
          fetchMintQueueImagesRef.current(false)
        }
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current)
          refreshIntervalRef.current = null
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintQueueImages, ordinalAddress]) // Removed fetchMintQueueImages from deps to prevent loop

  const loadMintQueue = useCallback(async () => {
    const currentAddress = ordinalAddressRef.current
    if (!currentAddress) return

    try {
      // Fetch regeneration allowance
      const allowanceResponse = await fetch(`/api/abyss/ascended/limbo?wallet=${encodeURIComponent(currentAddress)}`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      const allowanceData = await allowanceResponse.json().catch(() => null)
      if (allowanceResponse.ok && allowanceData?.success) {
        setRegenerationAllowance(allowanceData.regenerationAllowance ?? 0)
      }

      // Fetch mint queue with mint status from new API (use throttled function)
      await fetchMintQueueImages(true) // Force fetch on initial load
    } catch (err) {
      console.error('Failed to load mint queue:', err)
    }
  }, [fetchMintQueueImages])

  const handleRegenerate = useCallback(
    async (mintQueueId: string, currentImageUrl: string) => {
      if (!ordinalAddress || regenerating) {
        return
      }

      setRegenerating(mintQueueId)
      try {
        const response = await fetch(
          `/api/abyss/ascended/mint-queue/${encodeURIComponent(mintQueueId)}/regenerate?walletAddress=${encodeURIComponent(ordinalAddress)}`,
          {
            headers: { 'Cache-Control': 'no-store' },
          },
        )

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to regenerate image.')
        }

        // Update regeneration allowance (credit was burned on generation)
        if (typeof payload.remainingAllowance === 'number') {
          setRegenerationAllowance(payload.remainingAllowance)
        }

        // Show comparison modal
        setRegenerateComparison({
          mintQueueId,
          originalImageUrl: payload.originalImageUrl,
          regeneratedImageUrl: payload.regeneratedImageUrl,
          regeneratedImageBlobUrl: payload.regeneratedImageBlobUrl,
        })

        toast.success(`Regenerated image ready! Credit used. Choose which version to keep.`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to regenerate image.'
        toast.error(message)
      } finally {
        setRegenerating(null)
      }
    },
    [ordinalAddress, regenerating, toast],
  )

  const handleApplyRegenerate = useCallback(
    async (choice: 'original' | 'regenerated') => {
      if (!regenerateComparison || !ordinalAddress || applyingRegenerate) {
        return
      }

      if (choice === 'original') {
        // User chose to keep original, just close modal
        // Note: Credit was already burned when regeneration was generated
        setRegenerateComparison(null)
        toast.success('Keeping original image. (Credit was already used for generation)')
        return
      }

      // User chose regenerated, update database
      setApplyingRegenerate(true)
      try {
        const response = await fetch(
          `/api/abyss/ascended/mint-queue/${encodeURIComponent(regenerateComparison.mintQueueId)}/regenerate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress: ordinalAddress,
              regeneratedImageUrl: regenerateComparison.regeneratedImageUrl,
              regeneratedImageBlobUrl: regenerateComparison.regeneratedImageBlobUrl,
            }),
          },
        )

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to apply regenerated image.')
        }

        setRegenerateComparison(null)
        await loadMintQueue()

        // Update regeneration allowance if provided
        if (typeof payload.remainingAllowance === 'number') {
          setRegenerationAllowance(payload.remainingAllowance)
        }

        toast.success('Regenerated image applied successfully!')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to apply regenerated image.'
        toast.error(message)
      } finally {
        setApplyingRegenerate(false)
      }
    },
    [regenerateComparison, ordinalAddress, applyingRegenerate, loadMintQueue, toast],
  )

  useEffect(() => {
    if (connected && address) {
      void loadMintQueue()
    } else {
      // Clear data when disconnected
      setMintQueueImages([])
      setRegenerationAllowance(0)
      // Clear intervals and timeouts
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
      // Clear all compression timeouts
      compressionTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId))
      compressionTimeoutsRef.current.clear()
    }
  }, [connected, address, loadMintQueue])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
      compressionTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId))
      compressionTimeoutsRef.current.clear()
    }
  }, [])

  const showMintButtons = true

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white">
        <Header
          connected={connected}
          showMusicControls={false}
        />

        <main className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-8">
          <div className="flex flex-col gap-3 text-center">
            <h1 className="flex items-center justify-center gap-3 text-3xl font-semibold uppercase tracking-[0.45em] text-emerald-300 md:text-4xl">
              <Sparkles className="h-7 w-7 text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" aria-hidden="true" />
              Tree of Ascension
              <Sparkles className="h-7 w-7 text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" aria-hidden="true" />
            </h1>
            <p className="text-sm text-gray-400">
              Awaiting mints ready for release
            </p>
          </div>

          {!connected && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-8 text-center">
              <p className="text-emerald-200">Connect your wallet to view awaiting mints</p>
            </div>
          )}

          {/* Mint Queue Section */}
          {mintQueueImages.length > 0 && (
            <section className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-mono uppercase tracking-[0.4em] text-emerald-300">
                  Waiting Release (Mint)
                </h2>
                {/* Regeneration allowance counter */}
                {regenerationAllowance > 0 && (
                  <div className="flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-900/30 px-4 py-2">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-mono uppercase tracking-[0.3em] text-purple-200">
                      Regenerations: {regenerationAllowance}
                    </span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {mintQueueImages.map((mint) => (
                  <article
                    key={mint.id}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-emerald-500/40 bg-black/70 shadow-[0_0_25px_rgba(16,185,129,0.35)]"
                  >
                    <div className="relative aspect-square">
                      <Image
                        src={mint.imageUrl}
                        alt="Mint queue mutant monster"
                        fill
                        sizes="(min-width: 1280px) 220px, (min-width: 768px) 25vw, 50vw"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="border-t border-emerald-500/20 bg-black/60 px-3 py-3 flex flex-col gap-2">
                      {/* Mint Status */}
                      {mint.mintInscription ? (
                        <div className="flex flex-col gap-1">
                          <p className={`text-center text-[10px] font-mono uppercase tracking-[0.3em] ${
                            mint.mintInscription.status === 'completed' ? 'text-green-400' :
                            mint.mintInscription.status === 'failed' ? 'text-red-400' :
                            mint.mintInscription.status === 'commit_in_mempool' ? 'text-yellow-400' :
                            mint.mintInscription.status === 'reveal_broadcast' ? 'text-blue-400' :
                            'text-orange-300'
                          }`}>
                            {mint.mintInscription.status === 'pending' && '⏳ Pending Signature'}
                            {mint.mintInscription.status === 'commit_broadcast' && '📡 Commit Broadcasting'}
                            {mint.mintInscription.status === 'commit_in_mempool' && '⚡ Commit in Mempool'}
                            {mint.mintInscription.status === 'reveal_broadcast' && '🚀 Reveal Broadcasting'}
                            {mint.mintInscription.status === 'completed' && '✅ Minted!'}
                            {mint.mintInscription.status === 'failed' && '❌ Failed'}
                            {!['pending', 'commit_broadcast', 'commit_in_mempool', 'reveal_broadcast', 'completed', 'failed'].includes(mint.mintInscription.status) && mint.mintInscription.status}
                          </p>
                        </div>
                      ) : (
                        <p className="text-center text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-200/70">
                          Awaiting Mint
                        </p>
                      )}

                      {/* Prompt Flags */}
                      <div className="flex items-center justify-center gap-2">
                        <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-[8px] font-mono uppercase tracking-wider ${
                          mint.hasSilver
                            ? 'bg-slate-500/20 border border-slate-400/40 text-slate-300'
                            : 'bg-gray-800/40 border border-gray-600/30 text-gray-500'
                        }`}>
                          <span>Silver</span>
                          <span className={mint.hasSilver ? 'text-green-400' : 'text-red-500'}>
                            {mint.hasSilver ? '✓' : '✗'}
                          </span>
                        </div>
                        <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-[8px] font-mono uppercase tracking-wider ${
                          mint.hasGlow
                            ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
                            : 'bg-gray-800/40 border border-gray-600/30 text-gray-500'
                        }`}>
                          <span>Glow</span>
                          <span className={mint.hasGlow ? 'text-green-400' : 'text-red-500'}>
                            {mint.hasGlow ? '✓' : '✗'}
                          </span>
                        </div>
                      </div>

                      {/* Compressed Size Badge */}
                      {mint.isCompressed && mint.compressedSizeBytes && (
                        <div className="flex items-center justify-center">
                          <div className="rounded-md px-2 py-1 text-[9px] font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                            {(mint.compressedSizeBytes / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      )}

                      {/* Mint Button - Always show for available mints */}
                      {showMintButtons && (
                        <MintButton
                          mintQueueId={mint.id}
                          imageUrl={mint.imageUrl}
                          compressedImageUrl={mint.compressedImageUrl}
                          isCompressed={mint.isCompressed || false}
                          existingMintInscription={mint.mintInscription}
                          onMintComplete={() => {
                            // Refresh mint queue data (force to bypass throttle)
                            fetchMintQueueImagesRef.current?.(true)
                          }}
                          onMintStart={() => {
                            toast.info('Minting started - Please sign the transaction in your wallet')
                            // Refresh to hide regenerate button once mint starts
                            fetchMintQueueImagesRef.current?.(true)
                          }}
                        />
                      )}

                      {/* Regenerate button - Show if no mint has been started OR status is awaiting_mint */}
                      {(!mint.mintInscription || mint.mintInscription?.status === 'awaiting_mint') && regenerationAllowance > 0 && (
                        <button
                          type="button"
                          onClick={() => handleRegenerate(mint.id, mint.imageUrl)}
                          disabled={regenerating === mint.id || regenerationAllowance <= 0}
                          className="w-full rounded-lg border border-purple-500/40 bg-purple-600/20 px-3 py-1.5 text-[9px] font-mono uppercase tracking-[0.3em] text-purple-200 transition hover:bg-purple-600/30 disabled:cursor-not-allowed disabled:opacity-50"
                          title={regenerationAllowance <= 0 ? 'No regenerations available. Complete summons to earn more.' : ''}
                        >
                          {regenerating === mint.id ? 'Regenerating...' : `Regenerate (${regenerationAllowance})`}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {mintQueueImages.length === 0 && connected && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-8 text-center">
              <p className="text-emerald-200">No awaiting mints found</p>
            </div>
          )}

          {/* Regenerate Comparison Modal */}
          {regenerateComparison && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/90 p-4 overflow-y-auto">
              <div className="relative max-w-5xl rounded-3xl border border-purple-500/60 bg-black/95 p-6 my-4 w-full shadow-[0_0_50px_rgba(168,85,247,0.5)]">
                <h2 className="mb-6 text-center text-2xl font-mono uppercase tracking-[0.3em] text-purple-200">
                  Choose Your Image
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Original Image */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-center text-sm font-mono uppercase tracking-[0.3em] text-amber-300">
                      Original
                    </h3>
                    <div className="aspect-square overflow-hidden rounded-2xl border border-amber-500/40">
                      <Image
                        src={regenerateComparison.originalImageUrl}
                        alt="Original mutant monster"
                        width={512}
                        height={512}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    </div>
                    <Button
                      type="button"
                      disabled={applyingRegenerate}
                      onClick={() => handleApplyRegenerate('original')}
                      className="w-full rounded-full border border-amber-500/60 bg-amber-600/30 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-amber-100 transition hover:bg-amber-600/45 disabled:opacity-50"
                    >
                      {applyingRegenerate ? (
                        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                      ) : (
                        'Keep Original'
                      )}
                    </Button>
                  </div>

                  {/* Regenerated Image */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-center text-sm font-mono uppercase tracking-[0.3em] text-purple-300">
                      Regenerated
                    </h3>
                    <div className="aspect-square overflow-hidden rounded-2xl border border-purple-500/40">
                      <Image
                        src={regenerateComparison.regeneratedImageUrl}
                        alt="Regenerated mutant monster"
                        width={512}
                        height={512}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    </div>
                    <Button
                      type="button"
                      disabled={applyingRegenerate}
                      onClick={() => handleApplyRegenerate('regenerated')}
                      className="w-full rounded-full border border-purple-500/60 bg-purple-600/30 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-purple-100 transition hover:bg-purple-600/45 disabled:opacity-50"
                    >
                      {applyingRegenerate ? (
                        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                      ) : (
                        'Use Regenerated'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
  )
}

