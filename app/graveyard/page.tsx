'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Skull, AlertTriangle, Sparkles, FlaskConical, Clock, AlertCircle } from 'lucide-react'

import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/Toast'
import { useWallet } from '@/lib/wallet/compatibility'
import { MintButton } from '@/components/MintButton'

type GraveyardEntry = {
  inscriptionId: string
  txId: string
  status: string
  source: string
  createdAt?: string | null
  confirmedAt?: string | null
  updatedAt?: string | null
  ascensionPowder: number
  imageBlobUrl?: string | null
}

type WalletProfile = {
  username?: string | null
  avatar_url?: string | null
  ascension_powder?: number | null
  has_grave_robbed?: boolean
  is_dead_demon_holder?: boolean
}

const GRAVEYARD_LIMIT = 180

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  const intervals = [
    { label: 'day', seconds: 86_400 },
    { label: 'hour', seconds: 3_600 },
    { label: 'minute', seconds: 60 },
  ] as const

  for (const { label, seconds } of intervals) {
    if (diffSeconds >= seconds) {
      const count = Math.floor(diffSeconds / seconds)
      return `${count} ${label}${count === 1 ? '' : 's'} ago`
    }
  }

  return `${diffSeconds}s ago`
}

function formatTimeUntilGraveRob(updatedAt: string | null | undefined, createdAt: string | null | undefined): string | null {
  // Grave robbing eligibility: 7 days after updated_at (or created_at if updated_at is null)
  const STALE_THRESHOLD_DAYS = 7
  const STALE_THRESHOLD_MS = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000

  // Use updated_at if available, otherwise fallback to created_at
  const referenceDate = updatedAt || createdAt
  if (!referenceDate) {
    return null
  }

  const date = new Date(referenceDate)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const eligibilityDate = new Date(date.getTime() + STALE_THRESHOLD_MS)
  const now = Date.now()
  const timeUntilEligible = eligibilityDate.getTime() - now

  // If already eligible (timeUntilEligible <= 0), show as eligible
  if (timeUntilEligible <= 0) {
    return 'Eligible for grave robbing'
  }

  // Calculate time remaining
  const days = Math.floor(timeUntilEligible / (24 * 60 * 60 * 1000))
  const hours = Math.floor((timeUntilEligible % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((timeUntilEligible % (60 * 60 * 1000)) / (60 * 1000))

  if (days > 0) {
    return `${days}d ${hours}h until grave robbing`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m until grave robbing`
  } else {
    return `${minutes}m until grave robbing`
  }
}

function GraveyardContent() {
  const wallet = useWallet()
  const toast = useToast()
  const searchParams = useSearchParams()

  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [entries, setEntries] = useState<GraveyardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<WalletProfile | null>(null)
  const [isHolder, setIsHolder] = useState<boolean | null>(null)
  const [checkingHolder, setCheckingHolder] = useState(false)
  const [powderSpending, setPowderSpending] = useState<string | null>(null)
  const [ascending, setAscending] = useState<string | null>(null)
  const [limboImages, setLimboImages] = useState<Array<{ id: string; imageUrl: string; sourceInscriptionId: string }>>([])
  const [mintQueueImages, setMintQueueImages] = useState<Array<{ 
    id: string; 
    imageUrl: string; 
    sourceInscriptionId: string; 
    hasSilver?: boolean;
    hasGlow?: boolean;
    compressedImageUrl?: string;
    compressedSizeBytes?: number;
    isCompressed?: boolean;
    mintInscription?: {
      id: string;
      status: string;
      commitTxId?: string;
      revealTxId?: string;
      inscriptionId?: string;
      errorMessage?: string;
    } | null;
  }>>([])
  const [selectedLimbo, setSelectedLimbo] = useState<{ id: string; imageUrl: string; sourceInscriptionId: string } | null>(null)
  const [choosingLimbo, setChoosingLimbo] = useState(false)
  const [regenerationAllowance, setRegenerationAllowance] = useState(0)
  const [secondAscensionWarning, setSecondAscensionWarning] = useState<GraveyardEntry | null>(null)
  const [selectedLimboToBurn, setSelectedLimboToBurn] = useState<string | null>(null)
  const [isFirstAscensionLimbo, setIsFirstAscensionLimbo] = useState(false)
  const [graveRobEligibleCount, setGraveRobEligibleCount] = useState<number | null>(null)
  const [graveRobbing, setGraveRobbing] = useState(false)
  const [graveRobLoading, setGraveRobLoading] = useState(false)
  const [now, setNow] = useState(Date.now())
  
  // Throttle mint queue fetches
  const lastMintQueueFetch = useRef<number>(0)
  const MINT_QUEUE_THROTTLE_MS = 3000 // Minimum 3 seconds between calls
  
  // Regenerate states
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [regenerateComparison, setRegenerateComparison] = useState<{
    mintQueueId: string
    originalImageUrl: string
    regeneratedImageUrl: string
    regeneratedImageBlobUrl: string
  } | null>(null)
  const [applyingRegenerate, setApplyingRegenerate] = useState(false)

  // Removed regenerate debug flag - now always visible

  const ordinalAddress = wallet.currentAddress?.trim() || ''
  
  // Mint buttons: Always show for available mints
  const showMintButtons = true
  
  // Regenerate buttons: Only show if no mint has been started (mintInscription is null/undefined)
  // Once mint status changes, hide the regenerate button

  // Check holder status
  useEffect(() => {
    if (!ordinalAddress) {
      setIsHolder(null)
      return
    }

    let cancelled = false
    setCheckingHolder(true)
    
    Promise.all([
      fetch(`/api/magic-eden?ownerAddress=${encodeURIComponent(ordinalAddress)}&collectionSymbol=the-damned&fetchAll=true`).then(async (res) => {
        if (!res.ok) return { tokens: [] }
        return res.json()
      }).catch(() => ({ tokens: [] })),
      fetch(`/api/holders/check-access?walletAddress=${encodeURIComponent(ordinalAddress)}`).then(async (res) => {
        if (!res.ok) return { success: false, hasBurns: false }
        return res.json()
      }).catch(() => ({ success: false, hasBurns: false }))
    ]).then(([ordinalsData, burnsData]) => {
      if (cancelled) return
      const tokens = Array.isArray(ordinalsData.tokens) ? ordinalsData.tokens : (Array.isArray(ordinalsData) ? ordinalsData : [])
      const hasUnlisted = tokens.some((token: { listed?: boolean }) => token.listed === false)
      const hasAnyListed = tokens.some((token: { listed?: boolean }) => token.listed === true)
      const hasUnlistedOrdinals = hasUnlisted && !hasAnyListed
      const hasBurns = burnsData.success && burnsData.hasBurns
      setIsHolder(hasUnlistedOrdinals || hasBurns)
      
      // Update profile with grave robbing and Dead Demon status
      if (burnsData.success) {
        setProfile(prev => ({
          ...prev,
          has_grave_robbed: burnsData.hasGraveRobbed === true,
          is_dead_demon_holder: burnsData.is_dead_demon_holder === true,
        }))
      }
    }).catch(() => {
      if (!cancelled) setIsHolder(false)
    }).finally(() => {
      if (!cancelled) setCheckingHolder(false)
    })

    return () => {
      cancelled = true
    }
  }, [ordinalAddress])

  // Update time every minute for grave robbing countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 60 * 1000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  const formattedSources = useMemo(() => {
    const sources = new Set(entries.map((entry) => entry.source.replace(/_/g, ' ')))
    return Array.from(sources)
      .map((source) => source.replace(/\b([a-z])/g, (match) => match.toUpperCase()))
      .join(' • ')
  }, [entries])

  const handleConnectedChange = useCallback((connected: boolean) => {
    setIsWalletConnected(connected)
    if (!connected) {
      setEntries([])
      setProfile(null)
      setError(null)
    }
  }, [])

  const loadGraveyard = useCallback(async () => {
    if (!ordinalAddress) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('includeGraveyard', 'true')
      params.set('ordinalWallet', ordinalAddress)
      params.set('graveyardLimit', GRAVEYARD_LIMIT.toString())

      const response = await fetch(`/api/abyss/burns?${params.toString()}`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? `Failed to load graveyard (${response.status})`)
      }

      const recordsRaw = Array.isArray(payload?.graveyard) ? payload.graveyard : []
      const mapped = recordsRaw
        .map((item: Record<string, unknown>) => {
          const inscriptionId = (item?.inscriptionId ?? item?.inscription_id ?? '').toString().trim()
          const txId = (item?.txId ?? item?.tx_id ?? '').toString().trim()
          if (!inscriptionId || !txId) {
            return null
          }
          return {
            inscriptionId,
            txId,
            status: (item?.status ?? '').toString(),
            source: (item?.source ?? '').toString(),
            createdAt: (item?.createdAt ?? item?.created_at ?? null) as string | null | undefined,
            confirmedAt: (item?.confirmedAt ?? item?.confirmed_at ?? null) as string | null | undefined,
            updatedAt: (item?.updatedAt ?? item?.updated_at ?? null) as string | null | undefined,
            ascensionPowder:
              typeof item?.ascensionPowder === 'number'
                ? Math.max(0, Number(item.ascensionPowder))
                : Math.max(
                    0,
                    Number.parseInt((item?.ascensionPowder ?? item?.ascension_powder ?? '0').toString(), 10) || 0,
                  ),
            imageBlobUrl: (item?.imageBlobUrl ?? item?.image_blob_url ?? null) as string | null | undefined,
          } satisfies GraveyardEntry
        })
        .filter((entry: GraveyardEntry | null): entry is GraveyardEntry => Boolean(entry))

      setEntries(mapped)
      const profileData = payload?.profile && typeof payload.profile === 'object' ? (payload.profile as WalletProfile) : null
      console.log('[Graveyard] Profile data received:', profileData)
      setProfile(profileData)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load graveyard.'
      setError(message)
      setEntries([])
      setProfile(null)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [ordinalAddress, toast])

  const powderAvailable = Math.max(0, Math.round(profile?.ascension_powder ?? 0))
  const hasPowder = powderAvailable > 0
  const MAX_POWDER_PER_USE = 20
  const powderToUse = Math.min(MAX_POWDER_PER_USE, powderAvailable)

  const loadGraveRobEligibleCount = useCallback(async () => {
    if (!ordinalAddress) {
      setGraveRobEligibleCount(null)
      return
    }

    try {
      const response = await fetch(`/api/abyss/burns/grave-rob?walletAddress=${encodeURIComponent(ordinalAddress)}`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        console.error('Failed to load grave rob eligible count')
        return
      }
      const data = await response.json()
      if (data.success) {
        setGraveRobEligibleCount(data.eligibleCount ?? 0)
      }
    } catch (err) {
      console.error('Failed to load grave rob eligible count:', err)
    }
  }, [ordinalAddress])

  const handleGraveRob = useCallback(async () => {
    if (!ordinalAddress) {
      toast.error('Connect your wallet to attempt grave robbing.')
      return
    }

    if (graveRobbing || graveRobLoading) {
      return
    }

    setGraveRobbing(true)
    setGraveRobLoading(true)

    try {
      const response = await fetch('/api/abyss/burns/grave-rob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          walletAddress: ordinalAddress
        }),
        cache: 'no-store',
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        toast.error(data.error || 'Grave robbing attempt failed.')
        setGraveRobbing(false)
        setGraveRobLoading(false)
        return
      }

      if (data.robbed) {
        toast.success(data.message || 'Successfully robbed a grave!')
        // Reload graveyard and profile to reflect changes
        await loadGraveyard()
        await loadGraveRobEligibleCount()
      } else {
        toast.error(data.message || 'Grave robbing attempt failed. Better luck next time!')
        // Still reload graveyard to update powder count
        await loadGraveyard()
        await loadGraveRobEligibleCount()
      }
    } catch (err) {
      console.error('Grave robbing failed:', err)
      toast.error('Failed to attempt grave robbing. Please try again.')
    } finally {
      setGraveRobbing(false)
      setGraveRobLoading(false)
    }
  }, [ordinalAddress, graveRobbing, graveRobLoading, toast, loadGraveyard, loadGraveRobEligibleCount])

  useEffect(() => {
    if (isWalletConnected && ordinalAddress) {
      void loadGraveyard()
      void loadGraveRobEligibleCount()
    }
  }, [isWalletConnected, ordinalAddress, loadGraveyard, loadGraveRobEligibleCount])

  const handleRefresh = useCallback(() => {
    if (!ordinalAddress) {
      return
    }
    void loadGraveyard()
  }, [ordinalAddress, loadGraveyard])

  const fetchMintQueueImages = useCallback(async (force = false) => {
    if (!ordinalAddress) return

    // Throttle: Don't fetch if called too recently (unless forced)
    const now = Date.now()
    if (!force && (now - lastMintQueueFetch.current) < MINT_QUEUE_THROTTLE_MS) {
      console.log(`⏸️ Throttling mint queue fetch (${now - lastMintQueueFetch.current}ms since last call)`)
      return
    }
    lastMintQueueFetch.current = now

    try {
      const response = await fetch(`/api/graveyard/mint-queue?wallet=${encodeURIComponent(ordinalAddress)}`, {
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
          mintInscription: record.mintInscription // Include mint status data!
        }))
        
        setMintQueueImages(records)
        
        // Auto-compress uncompressed images to show KB sizes
        records.forEach(async (record: any) => {
          if (!record.isCompressed && record.imageUrl) {
            console.log(`🗜️ Auto-compressing mint queue image ${record.id}`)
            try {
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
                // Refresh to show updated sizes (throttled)
                setTimeout(() => fetchMintQueueImages(false), 2000)
              }
            } catch (compressError) {
              console.error(`Failed to auto-compress ${record.id}:`, compressError)
            }
          }
        })
      }
    } catch (error) {
      console.error('Error fetching mint queue:', error)
    }
  }, [ordinalAddress])

  // Auto-refresh mint queue when there are in-progress mints
  useEffect(() => {
    const hasInProgressMint = mintQueueImages.some(mint => 
      mint.mintInscription && 
      !['completed', 'failed'].includes(mint.mintInscription.status)
    )
    
    if (hasInProgressMint && ordinalAddress) {
      console.log('🔄 Auto-refreshing mint queue (in-progress mint detected)')
      const refreshInterval = setInterval(() => {
        fetchMintQueueImages(false) // Use throttled version
      }, 20000) // Refresh every 15 seconds (was 5)
      
      return () => clearInterval(refreshInterval)
    }
  }, [mintQueueImages, ordinalAddress, fetchMintQueueImages])

  const loadLimboAndMintQueue = useCallback(async () => {
    if (!ordinalAddress) return

    try {
      // Fetch limbo data
      const response = await fetch(`/api/abyss/ascended/limbo?wallet=${encodeURIComponent(ordinalAddress)}`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      const payload = await response.json().catch(() => null)

      if (response.ok && payload?.success) {
        const limbo = payload.limbo || []
        setLimboImages(limbo)
        setRegenerationAllowance(payload.regenerationAllowance ?? 0)
        
        // Check if limbo entry is from a first ascension (source_inscription_id doesn't start with 'ascended_')
        if (limbo.length > 0) {
          const firstLimbo = limbo[0]
          const isFirstAscension = !firstLimbo.sourceInscriptionId.toLowerCase().startsWith('ascended_')
          setIsFirstAscensionLimbo(isFirstAscension)
        }
        
        // Fetch mint queue with mint status from new API (use throttled function)
        await fetchMintQueueImages(true) // Force fetch on initial load
        
        // Auto-open modal if there's a pending limbo entry and no modal is currently open
        // Use functional update to check current state
        setSelectedLimbo((current) => {
          if (limbo.length > 0 && !current) {
            return limbo[0]
          }
          return current
        })
      }
    } catch (err) {
      console.error('Failed to load limbo and mint queue:', err)
    }
  }, [ordinalAddress, fetchMintQueueImages])

  const handleFinalAscend = useCallback(
    async (entry: GraveyardEntry) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to ascend.')
        return
      }

      if (ascending) {
        return
      }

      // Prevent starting new ascension if there's a pending limbo choice
      if (limboImages.length > 0 || selectedLimbo) {
        toast.error('You have a pending ascension choice. Please complete it first.')
        return
      }

      // Determine target based on ascension level (second ascension if source is 'ascension')
      const isSecondAscension = entry.source === 'ascension'
      const ascensionTarget = isSecondAscension ? 1000 : 500

      if (entry.ascensionPowder < ascensionTarget) {
        toast.error(`This offering has not reached full ascension yet (${entry.ascensionPowder}/${ascensionTarget}).`)
        return
      }

      // Show warning modal for second ascension
      if (isSecondAscension) {
        setSecondAscensionWarning(entry)
        return
      }

      setAscending(entry.inscriptionId)
      try {
        const response = await fetch(
          `/api/abyss/burns/${encodeURIComponent(entry.inscriptionId)}/final-ascend`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: ordinalAddress }),
          },
        )

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to ascend.')
        }

        // Show limbo modal with generated image
        setSelectedLimbo({
          id: payload.limboId,
          imageUrl: payload.imageUrl,
          sourceInscriptionId: entry.inscriptionId,
        })

        // Reload graveyard to show updated powder (should be 0 now)
        await loadGraveyard()
        await loadLimboAndMintQueue()

        toast.success('Mutant monster generated! Choose its fate.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to ascend.'
        toast.error(message)
      } finally {
        setAscending(null)
      }
    },
    [ordinalAddress, toast, ascending, limboImages, selectedLimbo, loadGraveyard, loadLimboAndMintQueue],
  )

  const handleUsePowder = useCallback(
    async (entry: GraveyardEntry) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to channel ascension powder.')
        return
      }

      // Allow multiple concurrent requests - just check if already spending on this specific entry
      if (powderSpending === entry.inscriptionId) {
        return
      }

      if (!hasPowder) {
        toast.error('No ascension powder available to spend.')
        return
      }

      // Determine target based on ascension level (second ascension if source is 'ascension')
      const isSecondAscension = entry.source === 'ascension'
      const ascensionTarget = isSecondAscension ? 1000 : 500

      if (entry.ascensionPowder >= ascensionTarget) {
        toast.error('This offering has already reached full ascension.')
        return
      }

      // Calculate how much powder is needed to reach the target
      const powderNeeded = ascensionTarget - entry.ascensionPowder
      // Use the minimum of: max per use, available powder, and what's needed
      const amountToUse = Math.min(MAX_POWDER_PER_USE, powderAvailable, powderNeeded)

      if (amountToUse <= 0) {
        toast.error('Cannot use powder. Either none available or already at max.')
        return
      }

      // Set loading state for this specific entry only
      setPowderSpending(entry.inscriptionId)

      try {
        const response = await fetch(
          `/api/abyss/burns/${encodeURIComponent(entry.inscriptionId)}/ascend`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: ordinalAddress, amount: amountToUse }),
          },
        )

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to channel ascension powder.')
        }

        const updatedOrdinalPowder = Math.max(0, Number(payload?.ordinalPowder ?? entry.ascensionPowder))
        const updatedProfilePowder = Math.max(0, Number(payload?.profilePowder ?? 0))

        // Update state with functional updates to ensure we have latest values
        setProfile((prev) =>
          prev ? { ...prev, ascension_powder: updatedProfilePowder } : prev,
        )
        setEntries((prev) =>
          prev.map((item) =>
            item.inscriptionId === entry.inscriptionId
              ? { ...item, ascensionPowder: updatedOrdinalPowder }
              : item,
          ),
        )

        const spent = Math.max(0, Number(payload?.spent ?? amountToUse))
        const completed = Boolean(payload?.completed)
        
        // Clear loading state before showing toast
        setPowderSpending(null)
        
        // Use shorter, less intrusive toasts
        if (completed) {
          toast.success(`+${spent} powder ✓ Ascension ready!`)
        } else {
          toast.success(`+${spent} powder`)
        }
      } catch (err) {
        setPowderSpending(null)
        const message = err instanceof Error ? err.message : 'Failed to channel ascension powder.'
        toast.error(message)
      }
    },
    [ordinalAddress, toast, hasPowder, powderAvailable, MAX_POWDER_PER_USE, powderSpending],
  )

  const handleLimboChoice = useCallback(
    async (choice: 'mint' | 'abyss') => {
      if (!selectedLimbo || !ordinalAddress || choosingLimbo) {
        return
      }

      setChoosingLimbo(true)
      try {
        const response = await fetch(
          `/api/abyss/ascended/limbo/${encodeURIComponent(selectedLimbo.id)}/choose`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ choice, walletAddress: ordinalAddress }),
          },
        )

        const payload = await response.json().catch(() => null)

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Failed to process choice.')
        }

        setSelectedLimbo(null)
        await loadGraveyard()
        await loadLimboAndMintQueue()

        toast.success(payload.message || 'Choice processed successfully.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to process choice.'
        toast.error(message)
      } finally {
        setChoosingLimbo(false)
      }
    },
    [selectedLimbo, ordinalAddress, choosingLimbo, loadGraveyard, loadLimboAndMintQueue, toast],
  )

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
        await loadLimboAndMintQueue()
        
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
    [regenerateComparison, ordinalAddress, applyingRegenerate, loadLimboAndMintQueue, toast],
  )

  useEffect(() => {
    if (isWalletConnected && ordinalAddress) {
      void loadLimboAndMintQueue()
    }
  }, [isWalletConnected, ordinalAddress, loadLimboAndMintQueue])

  // Show locked page if not a holder
  if (checkingHolder) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
        <Header connected={isWalletConnected} onConnectedChange={handleConnectedChange} showMusicControls={false} />
        <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center justify-center px-4 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-red-400" />
        </main>
      </div>
    )
  }

  if (isHolder === false) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
        <Header connected={isWalletConnected} onConnectedChange={handleConnectedChange} showMusicControls={false} />
        <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-6 rounded-3xl border border-red-500/40 bg-red-950/20 p-10 text-center px-4 py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-900/30 px-4 py-1 text-[11px] font-mono uppercase tracking-[0.4em] text-red-200">
            <AlertTriangle className="h-3.5 w-3.5 text-emerald-400" />
            Holder Access Only
          </div>
          <h1 className="text-2xl font-black uppercase tracking-[0.45em] text-red-100">Graveyard Locked</h1>
          <p className="max-w-2xl text-sm uppercase tracking-[0.3em] text-red-200/80">
            You must have at least one unlisted Damned ordinal in your wallet to access the graveyard. Only holders with unlisted NFTs can view and interact with their graveyard.
          </p>
        </main>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <Header connected={isWalletConnected} onConnectedChange={handleConnectedChange} showMusicControls={false} />

      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.15),_transparent_55%)]" />

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-8">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="flex items-center justify-center gap-3 text-3xl font-semibold uppercase tracking-[0.45em] text-red-300 md:text-4xl">
            <Skull className="h-7 w-7 text-red-400 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" aria-hidden="true" />
            Personal Graveyard
            <Skull className="h-7 w-7 text-red-400 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" aria-hidden="true" />
          </h1>
       
          {profile?.username && (
            <div className="mx-auto flex max-w-md items-center justify-center gap-3 rounded-full border border-red-600/40 bg-black/60 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-red-200/70">
              {profile.avatar_url && (
                <Image
                  src={profile.avatar_url}
                  alt={profile.username ?? 'Sacrificer avatar'}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full border border-red-500/60 object-cover"
                />
              )}
              <span>Offerings by {profile.username}</span>
            </div>
          )}
          {profile && (
            <p className="mx-auto max-w-2xl text-[10px] uppercase tracking-[0.3em] text-red-200/60">
              Ascension powder reserve: {powderAvailable.toLocaleString()}
            </p>
          )}
          {entries.length > 0 && (
            <p className="mx-auto max-w-2xl text-[11px] uppercase tracking-[0.3em] text-red-200/60">
              Fallen offerings from: {formattedSources || 'Unknown rites'}
            </p>
          )}
        </div>


        {!isWalletConnected || !ordinalAddress ? (
          <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-red-600/40 bg-black/80 px-6 py-16 text-center shadow-[0_0_35px_rgba(220,38,38,0.35)]">
            <div className="flex flex-col items-center gap-4">
              <AlertTriangle className="h-10 w-10 text-amber-400 drop-shadow-[0_0_18px_rgba(251,191,36,0.45)]" />
              <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-red-200">Connect Required</h2>
              <p className="max-w-sm text-xs uppercase tracking-[0.35em] text-red-200/70">
                Link your wallet to discover which sacrifices linger in the abyssal ledger.
              </p>
            </div>
          </section>
        ) : (
          <>
            {/* Grave Robbing Section */}
            <section className="rounded-3xl border border-amber-600/40 bg-amber-950/20 px-6 py-5 shadow-[0_0_35px_rgba(251,191,36,0.25)]">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-amber-200">
                      Grave Robbing
                    </h2>
                  </div>
                  {graveRobEligibleCount !== null && (
                    <span className="text-sm font-mono uppercase tracking-[0.3em] text-amber-300/80">
                      {graveRobEligibleCount} Eligible
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                    Spend 150 powder for a 10% chance to steal ownership of an abandoned grave (no powder used in over 1 week).
                  </p>
                  
                  {(graveRobEligibleCount ?? 0) > 0 && (
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        onClick={handleGraveRob}
                        disabled={graveRobbing || graveRobLoading || powderAvailable < 150}
                        className="border border-amber-500 bg-amber-700/80 px-6 py-2 text-[11px] font-mono uppercase tracking-[0.35em] text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.35)] transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {graveRobbing || graveRobLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Robbing...
                          </>
                        ) : (
                          'Attempt Grave Rob (150 Powder)'
                        )}
                      </Button>
                      {powderAvailable < 150 && (
                        <span className="text-xs uppercase tracking-[0.3em] text-amber-300/60">
                          Insufficient powder ({powderAvailable}/150)
                        </span>
                      )}
                    </div>
                  )}
                  {graveRobEligibleCount === 0 && (
                    <p className="text-xs uppercase tracking-[0.3em] text-amber-300/60">
                      Grave robbing is over, all graves have been robbed.
                    </p>
                  )}
                  {graveRobEligibleCount === null && (
                    <p className="text-xs uppercase tracking-[0.3em] text-amber-300/60">
                      Loading eligible graves...
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-5">
            {error && (
              <div className="rounded-3xl border border-red-600/40 bg-red-950/40 px-4 py-3 text-sm text-red-200 shadow-[0_0_25px_rgba(220,38,38,0.25)]">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-3xl border border-red-600/40 bg-black/80 px-5 py-4 shadow-[0_0_35px_rgba(220,38,38,0.35)] md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-red-200/80">Total sacrifices</p>
                <p className="mt-1 text-3xl font-black uppercase tracking-[0.35em] text-red-100">{entries.length}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRefresh}
                  className="flex items-center gap-2 rounded-full border border-amber-500/60 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
                  disabled={loading}
                >
                  <Loader2 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-2 rounded-full border border-red-500/50 bg-black/30 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-100 transition hover:bg-red-600/25"
                >
                  Back to Profile
                </Link>
              </div>
            </div>

            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-red-500/40 bg-black/85 px-6 py-16 text-center shadow-[0_0_30px_rgba(220,38,38,0.3)]">
                <Skull className="h-10 w-10 text-red-400" />
                <p className="max-w-sm text-xs uppercase tracking-[0.35em] text-red-200/70">
                  No abyss offerings detected for this wallet yet. Cast something into the void to see it remembered here.
                </p>
              </div>
            ) : (
              <div className="max-h-[65vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {entries.map((entry: GraveyardEntry) => {
                    const imageUrl = entry.imageBlobUrl || `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(entry.inscriptionId)}`
                    const shortInscription =
                      entry.inscriptionId.length > 18
                        ? `${entry.inscriptionId.slice(0, 8)}…${entry.inscriptionId.slice(-6)}`
                        : entry.inscriptionId
                    const status = entry.status.toLowerCase()
                    const statusClasses =
                      status === 'confirmed'
                        ? 'border-emerald-400/50 bg-emerald-900/30 text-emerald-200'
                        : 'border-amber-400/40 bg-amber-900/30 text-amber-200'

                    // Determine target based on ascension level (second ascension if source is 'ascension')
                    const isSecondAscension = entry.source === 'ascension'
                    const ascensionTarget = isSecondAscension ? 1000 : 500
                    const progressPercent = Math.min(
                      100,
                      Math.round((Math.max(0, entry.ascensionPowder) / ascensionTarget) * 100),
                    )
                    const referenceInstant = entry.confirmedAt ?? entry.createdAt ?? entry.updatedAt ?? null
                    const timeInGraveyard = formatRelativeTime(referenceInstant)
                    // Check if this entry can be grave robbed (not ascended_ prefix)
                    const isGraveRobEligible = !entry.inscriptionId.toLowerCase().startsWith('ascended_')
                    const timeUntilGraveRob = isGraveRobEligible ? formatTimeUntilGraveRob(entry.updatedAt, entry.createdAt) : null
                    return (
                      <article
                        key={`${entry.inscriptionId}-${entry.txId}`}
                        data-inscription-id={entry.inscriptionId}
                        className="group relative flex flex-col overflow-hidden rounded-2xl border border-red-500/40 bg-black/70 shadow-[0_0_25px_rgba(220,38,38,0.35)] transition focus-within:outline-none focus-within:ring-2 focus-within:ring-red-400 focus-within:ring-offset-2 focus-within:ring-offset-black"
                      >
                        <Link
                          href={`/graveyard/${encodeURIComponent(entry.inscriptionId)}`}
                          className="block"
                          prefetch={false}
                        >
                          <div className="relative aspect-square">
                            <Image
                              src={imageUrl}
                              alt={entry.inscriptionId}
                              fill
                              sizes="(min-width: 1280px) 220px, (min-width: 768px) 25vw, 50vw"
                              className="object-cover transition duration-500 ease-out group-hover:scale-105"
                              unoptimized={imageUrl.includes('blob.vercel-storage.com')}
                            />
                            <div className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-3">
                              <div className="rounded-lg border border-red-500/40 bg-black/45 px-3 py-2 shadow-[0_0_15px_rgba(220,38,38,0.3)] backdrop-blur-sm">
                                <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.35em] text-red-200/70">
                                  <span>Ascension</span>
                                  <span>{progressPercent}%</span>
                                </div>
                                <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-red-500/40 bg-black/50">
                                  <div
                                    className="h-full bg-gradient-to-r from-red-500/70 via-amber-400/80 to-emerald-400/80"
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 py-3">
                           
                              {timeInGraveyard && (
                                <div className="text-[9px] uppercase tracking-[0.3em] text-red-200/60">
                                  In pit {timeInGraveyard}
                                </div>
                              )}
                              <div className="text-[9px] uppercase tracking-[0.3em] text-red-200/60">
                                Source: {entry.source.replace(/_/g, ' ')}
                              </div>
                            </div>
                          </div>
                        </Link>
                        <div className="space-y-2 border-t border-red-500/20 bg-black/60 px-3 py-3">
                          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-red-200/60">
                            <span className="flex items-center gap-1">
                              <FlaskConical className="h-3 w-3 text-amber-300" /> Reserve
                            </span>
                            <span className="font-mono text-[10px] text-red-100">{powderAvailable.toLocaleString()}</span>
                          </div>
                          {hasPowder && entry.ascensionPowder < ascensionTarget && (
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-amber-200/70">
                              <span>Use</span>
                              <span className="font-mono text-[10px] text-amber-100">
                                {Math.min(MAX_POWDER_PER_USE, powderAvailable, ascensionTarget - entry.ascensionPowder)} Powder
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-amber-200/80">
                            <span className="flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-amber-400" /> Ascension
                            </span>
                            <span className="font-mono text-[10px] text-amber-100">
                              {Math.min(ascensionTarget, entry.ascensionPowder).toLocaleString()} / {ascensionTarget.toLocaleString()}
                            </span>
                          </div>
                          {false && isGraveRobEligible && timeUntilGraveRob && (
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-amber-300/70 border-t border-amber-500/20 pt-2 mt-2">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-amber-400" /> Grave Rob
                              </span>
                              <span className="font-mono text-[10px] text-amber-200">
                                {timeUntilGraveRob}
                              </span>
                            </div>
                          )}
                          {entry.ascensionPowder >= ascensionTarget ? (
                            <Button
                              type="button"
                              disabled={
                                ascending === entry.inscriptionId ||
                                Boolean(ascending) ||
                                limboImages.length > 0 ||
                                Boolean(selectedLimbo)
                              }
                              onClick={() => handleFinalAscend(entry)}
                              className="flex w-full items-center justify-center gap-2 rounded-full border border-amber-500/60 bg-amber-600/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-amber-100 transition hover:bg-amber-600/45 disabled:cursor-not-allowed disabled:border-amber-500/30 disabled:bg-black/40 disabled:text-amber-200/40"
                            >
                              {ascending === entry.inscriptionId ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Summoning...
                                </>
                              ) : limboImages.length > 0 || selectedLimbo ? (
                                'Pending Choice'
                              ) : (
                                'Ascend'
                              )}
                            </Button>
                          ) : (
                            <>
                              <Button
                                type="button"
                                disabled={!hasPowder || powderSpending === entry.inscriptionId}
                                onClick={() => handleUsePowder(entry)}
                                className="flex w-full items-center justify-center gap-2 rounded-full border border-red-500/60 bg-red-600/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100 transition hover:bg-red-600/45 disabled:cursor-not-allowed disabled:border-red-500/30 disabled:bg-black/40 disabled:text-red-200/40"
                              >
                                {powderSpending === entry.inscriptionId && (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                )}
                                Use Powder
                              </Button>
                              
                              {/* Grave Robbing Warning */}
                              {isGraveRobEligible && timeUntilGraveRob === 'Eligible for grave robbing' && (
                                <div className="flex items-center justify-center gap-2 rounded-lg border border-red-500/60 bg-red-900/40 px-3 py-2 mt-2">
                                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                                  <span className="text-[9px] font-mono uppercase tracking-[0.35em] text-red-300">
                                    Risk
                                  </span>
                                  <span className="text-red-500 text-sm">✓</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

        {/* Second Ascension Warning Modal */}
        {secondAscensionWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 overflow-y-auto">
            <div className="relative max-w-3xl w-full rounded-3xl border-2 border-red-600/80 bg-black/98 p-8 shadow-[0_0_80px_rgba(220,38,38,0.8)] my-8">
              <div className="mb-6 text-center">
                <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-red-500" />
                <h2 className="mb-3 text-2xl font-mono uppercase tracking-[0.3em] text-red-400">
                  WARNING: ASCENSION FAILURE
                </h2>
            
                <p className="mb-6 text-sm leading-relaxed text-red-200/80">
                  The first ascension was a failure. Attempting a second ascension on this already-ascended abomination could bring about the end of the world. 
                  You must first burn a selected choice from your other available ascended images before proceeding.
                </p>
              </div>
              
              {(() => {
                // Filter graveyard entries from abyss_burns table with summon_bonus or abyss sources (not ascension)
                const burnableGraveyardEntries = entries.filter(
                  (entry) => {
                    const source = entry.source?.toLowerCase() || ''
                    return source === 'summon_bonus' || source === 'summon bonus' || source === 'abyss'
                  }
                )
                
                // Debug logging
                console.log('[second ascension warning] Available entries:', {
                  totalEntries: entries.length,
                  entrySources: entries.map(e => e.source),
                  burnableCount: burnableGraveyardEntries.length,
                  burnableSources: burnableGraveyardEntries.map(e => e.source),
                })
                
                // Filter limbo images (already ascended, waiting for choice)
                const burnableLimboImages = limboImages.filter(
                  (limbo) => !limbo.sourceInscriptionId.toLowerCase().startsWith('ascended_')
                )
                
                const totalBurnable = burnableGraveyardEntries.length + burnableLimboImages.length
                
                return totalBurnable > 0 ? (
                  <div className="mb-6">
                    <p className="mb-4 text-center text-sm font-mono uppercase tracking-[0.3em] text-red-300/90">
                      Select an image to burn first:
                    </p>
                    <div className="grid max-h-[500px] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                      {/* Graveyard entries from abyss_burns */}
                      {burnableGraveyardEntries.map((entry) => {
                        const isSelected = selectedLimboToBurn === `graveyard_${entry.inscriptionId}`
                        const imageUrl = entry.imageBlobUrl || `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(entry.inscriptionId)}`
                        return (
                          <div
                            key={`graveyard_${entry.inscriptionId}`}
                            className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-amber-500/40 bg-black/70 transition hover:border-amber-500/80"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (isSelected) {
                                setSelectedLimboToBurn(null)
                              } else {
                                setSelectedLimboToBurn(`graveyard_${entry.inscriptionId}`)
                              }
                            }}
                          >
                            <div className="absolute left-2 top-2 z-10">
                              <div
                                className={`flex h-6 w-6 items-center justify-center rounded border-2 ${
                                  isSelected
                                    ? 'border-red-500 bg-red-600'
                                    : 'border-amber-500/60 bg-black/80'
                                }`}
                              >
                                {isSelected && (
                                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            <div className="relative aspect-square">
                              <Image
                                src={imageUrl}
                                alt={entry.inscriptionId}
                                fill
                                sizes="(min-width: 640px) 33vw, 50vw"
                                className="object-cover"
                                unoptimized={imageUrl.includes('blob.vercel-storage.com')}
                              />
                              {isSelected && (
                                <div className="absolute inset-0 border-4 border-red-500 bg-red-500/20" />
                              )}
                            </div>
                            <div className="border-t border-amber-500/20 bg-black/80 px-2 py-2 text-center">
                              <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-amber-200/70">
                                {isSelected ? 'Selected' : 'Select to Burn'}
                              </p>
                              <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-amber-200/50 mt-1">
                                {entry.source.replace(/_/g, ' ')}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                      
                      {/* Limbo images */}
                      {burnableLimboImages.map((limbo) => {
                        const isSelected = selectedLimboToBurn === `limbo_${limbo.id}`
                        return (
                          <div
                            key={`limbo_${limbo.id}`}
                            className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-amber-500/40 bg-black/70 transition hover:border-amber-500/80"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (isSelected) {
                                setSelectedLimboToBurn(null)
                              } else {
                                setSelectedLimboToBurn(`limbo_${limbo.id}`)
                              }
                            }}
                          >
                            <div className="absolute left-2 top-2 z-10">
                              <div
                                className={`flex h-6 w-6 items-center justify-center rounded border-2 ${
                                  isSelected
                                    ? 'border-red-500 bg-red-600'
                                    : 'border-amber-500/60 bg-black/80'
                                }`}
                              >
                                {isSelected && (
                                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            <div className="relative aspect-square">
                              <Image
                                src={limbo.imageUrl}
                                alt="Limbo mutant monster"
                                fill
                                sizes="(min-width: 640px) 33vw, 50vw"
                                className="object-cover"
                                unoptimized
                              />
                              {isSelected && (
                                <div className="absolute inset-0 border-4 border-red-500 bg-red-500/20" />
                              )}
                            </div>
                            <div className="border-t border-amber-500/20 bg-black/80 px-2 py-2 text-center">
                              <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-amber-200/70">
                                {isSelected ? 'Selected' : 'Select to Burn'}
                              </p>
                              <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-amber-200/50 mt-1">
                                In Limbo
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 rounded-xl border border-amber-500/40 bg-black/70 p-6 text-center">
                    <p className="text-sm text-amber-200/70">
                      No burnable images available. You must first have ordinals from abyss or summon bonus sources in your graveyard.
                    </p>
                  </div>
                )
              })()}
              
              <div className="flex gap-4">
                <Button
                  type="button"
                  onClick={() => {
                    setSecondAscensionWarning(null)
                    setSelectedLimboToBurn(null)
                  }}
                  className="flex-1 rounded-full border border-gray-500/60 bg-gray-800/50 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-gray-300 transition hover:bg-gray-800/70"
                >
                  Cancel
                </Button>
                {(() => {
                  const burnableGraveyardEntries = entries.filter(
                    (entry) => entry.source === 'summon_bonus' || entry.source === 'abyss'
                  )
                  const burnableLimboImages = limboImages.filter(
                    (limbo) => !limbo.sourceInscriptionId.toLowerCase().startsWith('ascended_')
                  )
                  const totalBurnable = burnableGraveyardEntries.length + burnableLimboImages.length
                  
                  return totalBurnable > 0 ? (
                    <Button
                      type="button"
                      disabled={!selectedLimboToBurn}
                      onClick={async () => {
                        if (selectedLimboToBurn) {
                          if (selectedLimboToBurn.startsWith('limbo_')) {
                            // Handle limbo selection
                            const limboId = selectedLimboToBurn.replace('limbo_', '')
                            const selectedLimbo = burnableLimboImages.find((l) => l.id === limboId)
                            if (selectedLimbo) {
                              setSelectedLimbo(selectedLimbo)
                              setSecondAscensionWarning(null)
                              setSelectedLimboToBurn(null)
                            }
                          } else if (selectedLimboToBurn.startsWith('graveyard_')) {
                            // Handle graveyard entry selection - mark as hidden (burned), then proceed with second ascension
                            const inscriptionId = selectedLimboToBurn.replace('graveyard_', '')
                            const selectedEntry = burnableGraveyardEntries.find((e) => e.inscriptionId === inscriptionId)
                            if (selectedEntry && secondAscensionWarning) {
                              // Capture the original entry before closing modal
                              const originalEntry = secondAscensionWarning
                              
                              // Mark the selected entry as hidden (burned)
                              try {
                                console.log('[Second Ascension] Hiding selected entry:', inscriptionId)
                                const hideResponse = await fetch(
                                  `/api/abyss/burns/${encodeURIComponent(inscriptionId)}/hide`,
                                  {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ walletAddress: ordinalAddress }),
                                  },
                                )
                                
                                const hidePayload = await hideResponse.json().catch(() => null)
                                console.log('[Second Ascension] Hide response:', hidePayload)
                                
                                if (!hideResponse.ok || !hidePayload?.success) {
                                  throw new Error(hidePayload?.error ?? 'Failed to mark entry as burned.')
                                }
                                
                                // Close the warning modal
                                setSecondAscensionWarning(null)
                                setSelectedLimboToBurn(null)
                                
                                // Reload graveyard to reflect the hidden entry
                                await loadGraveyard()
                                
                                // Now proceed with the second ascension on the original entry
                                console.log('[Second Ascension] Starting ascension for:', originalEntry.inscriptionId)
                                setAscending(originalEntry.inscriptionId)
                                
                                const ascendResponse = await fetch(
                                  `/api/abyss/burns/${encodeURIComponent(originalEntry.inscriptionId)}/final-ascend`,
                                  {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ walletAddress: ordinalAddress }),
                                  },
                                )
                                
                                const ascendPayload = await ascendResponse.json().catch(() => null)
                                console.log('[Second Ascension] Ascend response:', ascendPayload)
                                
                                if (!ascendResponse.ok || !ascendPayload?.success) {
                                  throw new Error(ascendPayload?.error ?? 'Failed to ascend.')
                                }
                                
                                // Show limbo modal with generated image
                                setSelectedLimbo({
                                  id: ascendPayload.limboId,
                                  imageUrl: ascendPayload.imageUrl,
                                  sourceInscriptionId: originalEntry.inscriptionId,
                                })
                                
                                // Reload graveyard and limbo
                                await loadGraveyard()
                                await loadLimboAndMintQueue()
                                
                                toast.success('Entry burned. Mutant monster generated! Choose its fate.')
                              } catch (err) {
                                console.error('[Second Ascension] Error:', err)
                                const message = err instanceof Error ? err.message : 'Failed to process burn and ascension.'
                                toast.error(message)
                                setAscending(null)
                              }
                            }
                          }
                        }
                      }}
                      className="flex-1 rounded-full border border-red-500/80 bg-red-700/40 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-red-200 transition hover:bg-red-700/60 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Proceed to Burn Selected
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => {
                        setSecondAscensionWarning(null)
                        setSelectedLimboToBurn(null)
                        toast.error('You must have another ascended image in limbo to burn before attempting a second ascension.')
                      }}
                      className="flex-1 rounded-full border border-red-500/80 bg-red-700/40 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-red-200 transition hover:bg-red-700/60"
                    >
                      I Understand
                    </Button>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Limbo Modal */}
        {selectedLimbo && (() => {
          // Check if this is a second ascension (sourceInscriptionId starts with "ascended_")
          const isSecondAscension = selectedLimbo.sourceInscriptionId.toLowerCase().startsWith('ascended_')
          
          return (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-4 overflow-y-auto">
              <div className={`relative max-w-2xl rounded-3xl border bg-black/95 p-6 my-4 w-full ${
                isSecondAscension 
                  ? 'border-emerald-500/60 shadow-[0_0_50px_rgba(16,185,129,0.5)]' 
                  : 'border-amber-500/60 shadow-[0_0_50px_rgba(251,191,36,0.5)]'
              }`}>
                <h2 className={`mb-4 text-center text-xl font-mono uppercase tracking-[0.3em] ${
                  isSecondAscension ? 'text-emerald-200' : 'text-amber-200'
                }`}>
                  {isSecondAscension ? 'ASCENSION SUCCESSFUL!' : 'ASCENSION FAILED!'}
                </h2>
                <div className="mb-4 aspect-square overflow-hidden rounded-2xl border border-amber-500/40">
                  <Image
                    src={selectedLimbo.imageUrl}
                    alt="Generated mutant monster"
                    width={512}
                    height={512}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                </div>
                {isSecondAscension ? (
                  <p className="mb-4 text-center text-sm uppercase tracking-[0.3em] text-emerald-200/80">
                    The second ascension has succeeded! Save this ascended image for mint.
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-center text-sm uppercase tracking-[0.3em] text-red-200/80">
                      Choose the fate of this abomination:
                    </p>
                    {isFirstAscensionLimbo && (
                      <p className="mb-4 text-center text-xs leading-relaxed text-red-300/70">
                        ⚠️ WARNING: Sending this back to the abyss could bring about the end of the world. 
                        Ascension would require sacrificing a second Damned Ordinal, to attempt another ascend.
                      </p>
                    )}
                  </>
                )}
                <div className="flex gap-4">
                  <Button
                    type="button"
                    disabled={choosingLimbo}
                    onClick={() => handleLimboChoice('mint')}
                    className="flex-1 rounded-full border border-emerald-500/60 bg-emerald-600/30 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-emerald-100 transition hover:bg-emerald-600/45 disabled:opacity-50"
                  >
                    {choosingLimbo ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      'Save for Mint'
                    )}
                  </Button>
                  {!isSecondAscension && (
                    <Button
                      type="button"
                      disabled={choosingLimbo}
                      onClick={() => handleLimboChoice('abyss')}
                      className={`flex-1 rounded-full border border-red-500/60 bg-red-600/30 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-red-100 transition hover:bg-red-600/45 disabled:opacity-50 ${
                        isFirstAscensionLimbo ? 'animate-pulse' : ''
                      }`}
                      style={isFirstAscensionLimbo ? {
                        animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        boxShadow: '0 0 20px rgba(220, 38, 38, 0.8)',
                      } : {}}
                    >
                      {choosingLimbo ? (
                        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                      ) : (
                        'Throw in Abyss'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

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

              <p className="text-center text-xs uppercase tracking-[0.3em] text-purple-200/60">
                Choose which version to keep for minting
              </p>
            </div>
          </div>
        )}

        {/* Limbo Section */}
        {limboImages.length > 0 && (
          <section className="flex flex-col gap-5">
            <h2 className="text-xl font-mono uppercase tracking-[0.4em] text-amber-300">
              Awaiting Choice
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {limboImages.map((limbo) => (
                <article
                  key={limbo.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-amber-500/40 bg-black/70 shadow-[0_0_25px_rgba(251,191,36,0.35)]"
                >
                  <div className="relative aspect-square">
                    <Image
                      src={limbo.imageUrl}
                      alt="Limbo mutant monster"
                      fill
                      sizes="(min-width: 1280px) 220px, (min-width: 768px) 25vw, 50vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="border-t border-amber-500/20 bg-black/60 px-3 py-3">
                    <Button
                      type="button"
                      onClick={() => setSelectedLimbo(limbo)}
                      className="w-full rounded-full border border-amber-500/60 bg-amber-600/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-amber-100 transition hover:bg-amber-600/45"
                    >
                      Choose Fate
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Mint Queue Section */}
        {mintQueueImages.length > 0 && (
          <section className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-mono uppercase tracking-[0.4em] text-emerald-300">
                Waiting Release (Mint)
              </h2>
              {/* Regeneration allowance counter hidden for now */}
              {false && (
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
                        fetchMintQueueImages(true)
                      }}
                      onMintStart={() => {
                        toast.info('Minting started - Please sign the transaction in your wallet')
                        // Refresh to hide regenerate button once mint starts
                        fetchMintQueueImages(true)
                      }}
                    />
                    )}

                    {/* Regenerate button - Show if no mint has been started OR status is awaiting_mint */}
                    {(!mint.mintInscription || mint.mintInscription.status === 'awaiting_mint') && regenerationAllowance > 0 && (
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
          </>
        )}
      </main>
    </div>
  )
}

export default function GraveyardPage() {
  return <GraveyardContent />
}


