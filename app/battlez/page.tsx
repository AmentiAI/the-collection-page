'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Loader2, Shield, Sword, AlertCircle, CheckCircle2, Skull, Trophy } from 'lucide-react'
import GlobalStartTimeLock from '@/components/GlobalStartTimeLock'

// LaserEyesWrapper is already provided by app/layout.tsx, no need to wrap again

interface BattleOrdinal {
  inscriptionId: string
  imageUrl: string
  trait: 'Angelic' | 'Demonic'
  status: 'ready' | 'sanctuary' | null
  lifeForce: number
  maxLifeForce?: number
  blockChance?: number
  lifeForceCapBonus?: number
}

export default function BattlePage() {
  const searchParams = useSearchParams()
  const bypassTimer = searchParams.get('notime') === '1'
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [ordinals, setOrdinals] = useState<BattleOrdinal[]>([])
  const [loading, setLoading] = useState(false)
  const [hasListed, setHasListed] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [attackLogs, setAttackLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [rewardItems, setRewardItems] = useState<any[]>([])
  const [loadingRewardItems, setLoadingRewardItems] = useState(false)
  const [applyingReward, setApplyingReward] = useState<string | null>(null)
  const [showRewardModal, setShowRewardModal] = useState<string | null>(null)
  const [selectedOrdinalForItem, setSelectedOrdinalForItem] = useState<Record<string, string | null>>({})
  const [killingBlows, setKillingBlows] = useState<any[]>([])
  const [loadingKillingBlows, setLoadingKillingBlows] = useState(false)

  const handleHolderVerified = useCallback((holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }, [])

  const handleVerifyingStart = useCallback(() => {
    setIsVerifying(true)
  }, [])

  const fetchBattleOrdinals = useCallback(async () => {
    if (!address) {
      setOrdinals([])
      return
    }

    setLoading(true)
    setHasListed(false)

    try {
      const response = await fetch(
        `/api/battle/ordinals?walletAddress=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      )

      if (!response.ok) {
        const data = await response.json()
        if (data.hasListed) {
          setHasListed(true)
          setOrdinals([])
          toast.error('You have listed ordinals. Please delist them before entering battle.')
          return
        }
        throw new Error(data.error || 'Failed to fetch battle ordinals')
      }

      const data = await response.json()
      setOrdinals(data.ordinals || [])
      setHasListed(false)
    } catch (error) {
      console.error('Error fetching battle ordinals:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to load battle ordinals')
      setOrdinals([])
    } finally {
      setLoading(false)
    }
  }, [address, toast])

  const fetchAttackLogs = useCallback(async () => {
    if (!address) {
      setAttackLogs([])
      return
    }

    setLoadingLogs(true)
    try {
      const response = await fetch(
        `/api/battle/attack-logs?walletAddress=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch attack logs')
      }

      const data = await response.json()
      setAttackLogs(data.logs || [])
    } catch (error) {
      console.error('Error fetching attack logs:', error)
      setAttackLogs([])
    } finally {
      setLoadingLogs(false)
    }
  }, [address])

  const fetchRewardItems = useCallback(async () => {
    if (!address) {
      setRewardItems([])
      return
    }

    setLoadingRewardItems(true)
    try {
      const response = await fetch(`/api/dungeon-crawls/reward-items?wallet=${encodeURIComponent(address)}`)
      if (!response.ok) throw new Error('Failed to fetch reward items')
      const data = await response.json()
      if (data.success) {
        setRewardItems(data.items || [])
      }
    } catch (error) {
      console.error('Error fetching reward items:', error)
    } finally {
      setLoadingRewardItems(false)
    }
  }, [address])

  const fetchKillingBlows = useCallback(async () => {
    if (!address) {
      setKillingBlows([])
      return
    }

    setLoadingKillingBlows(true)
    try {
      const response = await fetch(
        `/api/battle/killing-blows?walletAddress=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      )
      if (!response.ok) throw new Error('Failed to fetch killing blows')
      const data = await response.json()
      if (data.success) {
        setKillingBlows(data.killingBlows || [])
      }
    } catch (error) {
      console.error('Error fetching killing blows:', error)
      setKillingBlows([])
    } finally {
      setLoadingKillingBlows(false)
    }
  }, [address])

  useEffect(() => {
    if (connected && address && !hasListed) {
      fetchBattleOrdinals()
      fetchAttackLogs()
      fetchRewardItems()
      fetchKillingBlows()
    } else {
      setOrdinals([])
      setAttackLogs([])
      setRewardItems([])
      setKillingBlows([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, address, hasListed])

  const updateStatus = useCallback(
    async (inscriptionId: string, newStatus: 'ready' | 'sanctuary') => {
      if (!address) return

      // Prevent duplicate requests for the same inscription
      if (updatingStatus === inscriptionId) {
        return
      }

      setUpdatingStatus(inscriptionId)

      try {
        // Find the ordinal to get its trait
        const ordinal = ordinals.find((o) => o.inscriptionId === inscriptionId)
        let trait = ordinal?.trait

        // If trait is missing, try to fetch from Magic Eden API as fallback
        if (!trait && address) {
          try {
            const magicEdenResponse = await fetch(
              `/api/magic-eden?ownerAddress=${encodeURIComponent(address)}&collectionSymbol=the-damned&fetchAll=true`,
              { cache: 'no-store' }
            )
            if (magicEdenResponse.ok) {
              const magicEdenData = await magicEdenResponse.json()
              const tokens = Array.isArray(magicEdenData.tokens) ? magicEdenData.tokens : []
              const token = tokens.find((t: any) => (t.id || t.inscriptionId) === inscriptionId)
              
              if (token) {
                let attributes: Array<{ trait_type?: string; traitType?: string; value?: string }> = []
                if (token.meta?.attributes) attributes = token.meta.attributes
                else if (token.metadata?.attributes) attributes = token.metadata.attributes
                else if (token.attributes) attributes = token.attributes

                const ascendedTrait = attributes.find(
                  (attr) =>
                    (attr.trait_type === 'Ascended' || attr.traitType === 'Ascended') &&
                    (attr.value === 'Angelic' || attr.value === 'Demonic')
                )
                
                if (ascendedTrait?.value) {
                  trait = ascendedTrait.value as 'Angelic' | 'Demonic'
                }
              }
            }
          } catch (error) {
            console.error('Error fetching trait from Magic Eden:', error)
            // Continue anyway - API will try database fallback
          }
        }

        // Send request even if trait is missing - API has database fallback
        const response = await fetch('/api/battle/status', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: address,
            inscriptionId,
            status: newStatus,
            trait: trait || null, // Send trait if found, API will try database fallback
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to update status')
        }

        // Optimistically update local state immediately (functional update)
        setOrdinals((prev) =>
          prev.map((ord) =>
            ord.inscriptionId === inscriptionId
              ? { ...ord, status: newStatus }
              : ord
          )
        )

        // Clear loading state before showing toast
        setUpdatingStatus(null)

        toast.success(
          `Ordinal ${newStatus === 'ready' ? 'readied' : 'sanctuaried'} for battle`
        )
      } catch (error) {
        console.error('Error updating status:', error)
        setUpdatingStatus(null)
        toast.error(
          error instanceof Error ? error.message : 'Failed to update status'
        )
      }
    },
    [address, toast, updatingStatus]
  )

  const handleApplyReward = async (itemId: string, inscriptionId: string) => {
    if (!address) return

    setApplyingReward(itemId)
    try {
      const response = await fetch('/api/dungeon-crawls/reward-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          itemId,
          inscriptionId,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast.success('Reward applied successfully!')
        setSelectedOrdinalForItem(prev => {
          const newState = { ...prev }
          delete newState[itemId]
          return newState
        })
        await fetchRewardItems()
        await fetchBattleOrdinals() // Refresh to show updated stats
      } else {
        toast.error(data.error || 'Failed to apply reward')
        setSelectedOrdinalForItem(prev => {
          const newState = { ...prev }
          delete newState[itemId]
          return newState
        })
      }
    } catch (error) {
      console.error('Error applying reward:', error)
      toast.error('Failed to apply reward')
    } finally {
      setApplyingReward(null)
    }
  }

  const angelicOrdinals = ordinals.filter((o) => o.trait === 'Angelic')
  const demonicOrdinals = ordinals.filter((o) => o.trait === 'Demonic')
  
  // Calculate army composition and bonus status
  const readyAngels = angelicOrdinals.filter((o) => o.status === 'ready' && o.lifeForce > 0).length
  const readyDemons = demonicOrdinals.filter((o) => o.status === 'ready' && o.lifeForce > 0).length
  const totalReady = readyAngels + readyDemons
  
  // Balanced army bonus: All angels OR all demons OR equal mix
  const isBalanced = totalReady > 0 && (
    (readyAngels > 0 && readyDemons === 0) || // All angels
    (readyDemons > 0 && readyAngels === 0) || // All demons
    (readyAngels > 0 && readyDemons > 0 && readyAngels === readyDemons) // Equal mix
  )
  
  const armyComposition = totalReady > 0
    ? readyAngels > 0 && readyDemons === 0
      ? 'All Angels'
      : readyDemons > 0 && readyAngels === 0
      ? 'All Demons'
      : readyAngels === readyDemons
      ? 'Even Mix'
      : 'Unbalanced'
    : 'No Ready Armies'

  const content = (
    <div className="min-h-screen bg-black text-white">
      <Header
          isHolder={isHolder}
          isVerifying={isVerifying}
          connected={connected}
          onHolderVerified={handleHolderVerified}
          onVerifyingStart={handleVerifyingStart}
          onConnectedChange={() => {}}
        />

        <main className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-8">
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-[0.2em] text-red-500 mb-4">
              Battle Arena
            </h1>
            <p className="text-lg text-gray-400 font-mono uppercase tracking-wider">
              Prepare your damned ordinals for battle
            </p>
          </div>
          
          {/* Killing Blows Section */}
          {connected && killingBlows.length > 0 && (
            <div className="mb-6 rounded-lg border-2 border-red-500/70 bg-red-950/30 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Trophy className="h-8 w-8 text-yellow-400" />
                <h2 className="text-2xl font-black uppercase tracking-wide text-yellow-400">
                  Killing Blows
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {killingBlows.map((kill) => (
                  <div
                    key={kill.id}
                    className="relative bg-black/60 border-2 border-yellow-500/50 rounded-lg overflow-hidden hover:border-yellow-400 transition-all"
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Skull className="h-5 w-5 text-red-400" />
                        <span className="text-sm font-bold text-yellow-400 uppercase">
                          You delivered the killing blow to:
                        </span>
                      </div>
                      {kill.imageUrl ? (
                        <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden mb-3 border-2 border-yellow-500/30">
                          <Image
                            src={kill.imageUrl}
                            alt={kill.name || kill.prompt}
                            fill
                            className="object-cover"
                            unoptimized={kill.imageUrl.startsWith('data:')}
                          />
                        </div>
                      ) : (
                        <div className="w-full aspect-square bg-gray-900 rounded-lg flex items-center justify-center mb-3 border-2 border-yellow-500/30">
                          <Skull className="h-16 w-16 text-gray-600" />
                        </div>
                      )}
                      {kill.name && (
                        <h3 className="text-lg font-bold text-yellow-300 mb-1">{kill.name}</h3>
                      )}
                      <p className="text-xs text-gray-400">
                        Killed: {new Date(kill.killedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Army Bonus Status */}
          {connected && totalReady > 0 && (
            <div className={`mb-6 rounded-lg border-2 p-4 ${
              isBalanced 
                ? 'border-green-500/70 bg-green-950/30' 
                : 'border-yellow-500/70 bg-yellow-950/30'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide mb-1">
                    Army Composition
                  </div>
                  <div className="text-lg font-mono">
                    {armyComposition} ({readyAngels} Angels, {readyDemons} Demons)
                  </div>
                </div>
                <div className={`px-4 py-2 rounded-lg font-bold text-sm uppercase tracking-wide ${
                  isBalanced
                    ? 'bg-green-600/80 text-green-100'
                    : 'bg-yellow-600/80 text-yellow-100'
                }`}>
                  {isBalanced ? '✓ Balanced Bonus Active' : '✗ No Bonus'}
                </div>
              </div>
              {isBalanced && (
                <div className="mt-2 text-sm text-green-300">
                  Balanced armies receive 30% damage reduction from horde attacks
                </div>
              )}
            </div>
          )}

          {!connected && (
            <div className="rounded-2xl border-2 border-red-500/70 bg-red-950/30 p-8 text-center">
              <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-red-200 mb-2">
                Connect Your Wallet
              </h2>
              <p className="text-gray-400 mb-6">
                Connect your wallet to view your battle-ready ordinals
              </p>
            </div>
          )}

          {connected && hasListed && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
              <div className="rounded-2xl border-2 border-amber-500/70 bg-amber-950/30 p-8 text-center max-w-md mx-4">
              <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-amber-200 mb-2">
                Listed Ordinals Detected
              </h2>
              <p className="text-gray-400 mb-4">
                  You must delist to continue playing.
              </p>
              <Button
                onClick={fetchBattleOrdinals}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Check Again
              </Button>
              </div>
            </div>
          )}

          {connected && !hasListed && (
            <>
              {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-12 w-12 animate-spin text-red-500" />
            </div>
          )}

              {!loading && ordinals.length === 0 && (
            <div className="rounded-2xl border-2 border-gray-600/50 bg-gray-900/30 p-8 text-center">
              <Sword className="h-16 w-16 text-gray-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-300 mb-2">
                No Battle-Ready Ordinals
              </h2>
              <p className="text-gray-500">
                You don&apos;t have any ordinals with Angelic or Demonic traits, or
                they are all listed.
              </p>
            </div>
          )}

          {/* Reward Items Section */}
              {rewardItems.length > 0 && (
            <div className="mb-8 rounded-2xl border-2 border-purple-500/70 bg-purple-950/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-purple-200 flex items-center gap-2">
                  <Shield className="h-6 w-6" />
                  Available Reward Items ({rewardItems.length})
                </h2>
                <Button
                  onClick={() => setShowRewardModal(showRewardModal ? null : 'all')}
                  variant="outline"
                  className="text-sm px-3 py-1.5"
                >
                  {showRewardModal ? 'Hide' : 'View Items'}
                </Button>
              </div>
              {showRewardModal && (
                <div className="space-y-6 mt-4">
                  {rewardItems.map((item) => {
                    const selectedOrdinal = selectedOrdinalForItem[item.id] || null
                    return (
                    <div
                      key={item.id}
                      className="border border-purple-500/50 rounded-lg p-4 bg-purple-900/20"
                    >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className="font-bold text-purple-200 text-lg">
                          +{item.rewardValue}{' '}
                          {item.rewardType === 'block_chance' ? '% Block Chance' : ' Life Force Cap'}
                        </span>
                            <p className="text-xs text-gray-400 mt-1">
                        Earned: {new Date(item.earnedAt).toLocaleDateString()}
                      </p>
                          </div>
                        </div>
                        <p className="text-sm text-purple-300 mb-4">Select an ordinal to apply this reward:</p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                          {ordinals.map((ord) => {
                            const currentBlockChance = ord.blockChance ?? 0
                            const currentLifeForceCap = ord.lifeForceCapBonus ?? 0
                            const hasBonuses = currentBlockChance > 0 || currentLifeForceCap > 0
                            const isSelected = selectedOrdinal === ord.inscriptionId
                            const isApplying = applyingReward === item.id && selectedOrdinal === ord.inscriptionId
                            
                            return (
                              <button
                                key={ord.inscriptionId}
                                onClick={() => {
                                  if (!isApplying) {
                                    setSelectedOrdinalForItem(prev => ({ ...prev, [item.id]: ord.inscriptionId }))
                                    handleApplyReward(item.id, ord.inscriptionId)
                          }
                        }}
                                disabled={isApplying}
                                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                                  isSelected
                                    ? 'border-purple-400 ring-2 ring-purple-400 shadow-lg shadow-purple-500/50'
                                    : 'border-gray-600 hover:border-purple-500/50'
                                } ${isApplying ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                              >
                                <div className="aspect-square relative">
                                  <Image
                                    src={ord.imageUrl}
                                    alt={ord.inscriptionId}
                                    fill
                                    className={`object-cover transition-all duration-300 ${
                                      ord.lifeForce === 0 ? 'grayscale' : ''
                                    }`}
                                    unoptimized
                                  />
                                  {isApplying && (
                                    <div className="absolute inset-0 bg-purple-900/80 flex items-center justify-center">
                                      <Loader2 className="w-6 h-6 animate-spin text-purple-300" />
                                    </div>
                                  )}
                                </div>
                                <div className="p-2 bg-black/90">
                                  <div className="text-xs text-center mb-1.5">
                                    <div className={`font-bold ${ord.trait === 'Angelic' ? 'text-cyan-400' : 'text-red-400'}`}>
                                      {ord.trait}
                                    </div>
                                  </div>
                                  {item.rewardType === 'block_chance' ? (
                                    <div className="space-y-1">
                                      <div className="text-sm text-gray-100 text-center font-bold">
                                        Block: {10 + currentBlockChance}%
                                      </div>
                                      {currentBlockChance > 0 ? (
                                        <div className="text-xs text-green-400 text-center">+{currentBlockChance}% bonus</div>
                                      ) : (
                                        <div className="text-xs text-gray-400 text-center">base 10%</div>
                                      )}
                                      <div className="text-xs text-purple-300 text-center">+{item.rewardValue}% if applied</div>
                                      <div className="text-xs text-gray-300 text-center mt-1">
                                        HP Cap: {ord.maxLifeForce ?? 100}
                                        {currentLifeForceCap > 0 && <span className="text-green-400"> (+{currentLifeForceCap})</span>}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      <div className="text-sm text-gray-100 text-center font-bold">
                                        HP Cap: {ord.maxLifeForce ?? 100}
                                      </div>
                                      {currentLifeForceCap > 0 ? (
                                        <div className="text-xs text-green-400 text-center">+{currentLifeForceCap} bonus</div>
                                      ) : (
                                        <div className="text-xs text-gray-400 text-center">base 100</div>
                                      )}
                                      <div className="text-xs text-purple-300 text-center">+{item.rewardValue} if applied</div>
                                      <div className="text-xs text-gray-300 text-center mt-1">
                                        Block: {10 + currentBlockChance}%
                                        {currentBlockChance > 0 && <span className="text-green-400"> (+{currentBlockChance}%)</span>}
                                      </div>
                        </div>
                      )}
                    </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

              {!loading && ordinals.length > 0 && (
            <div className="space-y-12">
              {angelicOrdinals.length > 0 && (
                <section>
                  <h2 className="text-3xl font-black uppercase tracking-[0.3em] text-cyan-400 mb-6 flex items-center gap-3">
                    <Shield className="h-8 w-8" />
                    Angelic Forces
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {angelicOrdinals.map((ordinal) => (
                      <div
                        key={ordinal.inscriptionId}
                        className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                          ordinal.status === 'ready'
                            ? 'border-red-600 bg-red-950/30 ring-2 ring-red-500/70 shadow-lg shadow-red-500/30'
                            : ordinal.status === 'sanctuary'
                            ? 'border-cyan-600 bg-cyan-950/40 ring-2 ring-cyan-500/50'
                            : 'border-cyan-500/50 bg-cyan-950/20 hover:border-cyan-400'
                        }`}
                      >
                        <div className="aspect-square relative">
                          <Image
                            src={ordinal.imageUrl}
                            alt={`Angelic ${ordinal.inscriptionId}`}
                            fill
                            className={`object-cover transition-all duration-300 ${
                              ordinal.lifeForce === 0 ? 'grayscale' : ''
                            }`}
                            unoptimized
                          />
                        </div>
                        <div className="p-1.5 bg-black/80">
                          {/* Life Force Bar */}
                          {ordinal.status && (
                            <div className="mb-1.5">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] text-cyan-300/70 font-mono uppercase font-semibold">Life Force</span>
                                <span className="text-[12px] text-cyan-300 font-mono font-bold">
                                  {ordinal.lifeForce}/{ordinal.maxLifeForce ?? 100}
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-cyan-950/50 rounded-full overflow-hidden border border-cyan-500/30">
                                <div
                                  className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-all duration-300"
                                  style={{ width: `${(ordinal.lifeForce / (ordinal.maxLifeForce ?? 100)) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {/* Block Chance Display */}
                          <div className="mb-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-cyan-300/70 font-mono uppercase font-semibold">Block</span>
                              <span className="text-[13px] text-cyan-300 font-mono font-bold">
                                {10 + (ordinal.blockChance ?? 0)}%
                                {(ordinal.blockChance ?? 0) > 0 && (
                                  <span className="text-green-400 ml-0.5 text-[11px]">(+{ordinal.blockChance}%)</span>
                                )}
                              </span>
                            </div>
                          </div>
                          {ordinal.status && (
                            <div className="flex items-center justify-center mb-1">
                              {ordinal.status === 'ready' ? (
                                <div className="flex items-center gap-1.5 bg-red-900/60 px-2.5 py-1 rounded border-2 border-red-500 shadow-md shadow-red-500/50">
                                  <Sword className="h-4 w-4 text-red-400" />
                                  <span className="text-[11px] text-red-300 font-bold uppercase tracking-wide">Ready</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 bg-cyan-900/50 px-2 py-0.5 rounded border border-cyan-500/50">
                                  <Shield className="h-3.5 w-3.5 text-cyan-300" />
                                  <span className="text-[9px] text-cyan-300 font-bold uppercase">Sanctuary</span>
                                </div>
                              )}
                            </div>
                          )}
                          {ordinal.lifeForce === 0 ? (
                            <Link href="/resurrect" className="block">
                              <Button
                                className="w-full text-[10px] py-1 bg-red-600 hover:bg-red-700 text-white border border-red-500"
                              >
                                Dead
                              </Button>
                            </Link>
                          ) : !ordinal.status ? (
                            <Button
                              className="w-full text-[10px] py-1 bg-cyan-600 hover:bg-cyan-700 text-white border border-cyan-500"
                              onClick={() => updateStatus(ordinal.inscriptionId, 'ready')}
                              disabled={updatingStatus === ordinal.inscriptionId}
                            >
                              {updatingStatus === ordinal.inscriptionId ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                'Ready'
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              className={`w-full text-[10px] py-1 ${
                                ordinal.status === 'ready'
                                  ? 'border-2 border-red-500/70 bg-red-950/40 text-red-300 hover:bg-red-950/60 font-bold'
                                  : 'border border-cyan-500/50 text-cyan-400 hover:bg-cyan-950/50'
                              }`}
                              onClick={() => updateStatus(ordinal.inscriptionId, ordinal.status === 'ready' ? 'sanctuary' : 'ready')}
                              disabled={updatingStatus === ordinal.inscriptionId}
                            >
                              {updatingStatus === ordinal.inscriptionId ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : ordinal.status === 'ready' ? (
                                'Switch to Sanctuary'
                              ) : (
                                'Ready'
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {demonicOrdinals.length > 0 && (
                <section>
                  <h2 className="text-3xl font-black uppercase tracking-[0.3em] text-red-500 mb-6 flex items-center gap-3">
                    <Sword className="h-8 w-8" />
                    Demonic Forces
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {demonicOrdinals.map((ordinal) => (
                      <div
                        key={ordinal.inscriptionId}
                        className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                          ordinal.status === 'ready'
                            ? 'border-red-600 bg-red-950/30 ring-2 ring-red-500/70 shadow-lg shadow-red-500/30'
                            : ordinal.status === 'sanctuary'
                            ? 'border-red-600 bg-red-950/40 ring-2 ring-red-500/50'
                            : 'border-red-500/50 bg-red-950/20 hover:border-red-400'
                        }`}
                      >
                        <div className="aspect-square relative">
                          <Image
                            src={ordinal.imageUrl}
                            alt={`Demonic ${ordinal.inscriptionId}`}
                            fill
                            className={`object-cover transition-all duration-300 ${
                              ordinal.lifeForce === 0 ? 'grayscale' : ''
                            }`}
                            unoptimized
                          />
                        </div>
                        <div className="p-1.5 bg-black/80">
                          {/* Life Force Bar */}
                          {ordinal.status && (
                            <div className="mb-1.5">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] text-red-300/70 font-mono uppercase font-semibold">Life Force</span>
                                <span className="text-[12px] text-red-300 font-mono font-bold">
                                  {ordinal.lifeForce}/{ordinal.maxLifeForce ?? 100}
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-red-950/50 rounded-full overflow-hidden border border-red-500/30">
                                <div
                                  className="h-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-300"
                                  style={{ width: `${(ordinal.lifeForce / (ordinal.maxLifeForce ?? 100)) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {/* Block Chance Display */}
                          <div className="mb-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-red-300/70 font-mono uppercase font-semibold">Block</span>
                              <span className="text-[13px] text-red-300 font-mono font-bold">
                                {10 + (ordinal.blockChance ?? 0)}%
                                {(ordinal.blockChance ?? 0) > 0 && (
                                  <span className="text-green-400 ml-0.5 text-[11px]">(+{ordinal.blockChance}%)</span>
                                )}
                              </span>
                            </div>
                          </div>
                          {ordinal.status && (
                            <div className="flex items-center justify-center mb-1">
                              {ordinal.status === 'ready' ? (
                                <div className="flex items-center gap-1.5 bg-red-900/60 px-2.5 py-1 rounded border-2 border-red-500 shadow-md shadow-red-500/50">
                                  <Sword className="h-4 w-4 text-red-400" />
                                  <span className="text-[11px] text-red-300 font-bold uppercase tracking-wide">Ready</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 bg-red-900/50 px-2 py-0.5 rounded border border-red-500/50">
                                  <Shield className="h-3.5 w-3.5 text-red-300" />
                                  <span className="text-[9px] text-red-300 font-bold uppercase">Sanctuary</span>
                                </div>
                              )}
                            </div>
                          )}
                          {ordinal.lifeForce === 0 ? (
                            <Link href="/resurrect" className="block">
                              <Button
                                className="w-full text-[10px] py-1 bg-red-600 hover:bg-red-700 text-white border border-red-500"
                              >
                                Dead
                              </Button>
                            </Link>
                          ) : !ordinal.status ? (
                            <Button
                              className="w-full text-[10px] py-1 bg-red-600 hover:bg-red-700 text-white border border-red-500"
                              onClick={() => updateStatus(ordinal.inscriptionId, 'ready')}
                              disabled={updatingStatus === ordinal.inscriptionId}
                            >
                              {updatingStatus === ordinal.inscriptionId ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                'Ready'
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              className={`w-full text-[10px] py-1 ${
                                ordinal.status === 'ready'
                                  ? 'border-2 border-red-500/70 bg-red-950/40 text-red-300 hover:bg-red-950/60 font-bold'
                                  : 'border border-red-500/50 text-red-400 hover:bg-red-950/50'
                              }`}
                              onClick={() => updateStatus(ordinal.inscriptionId, ordinal.status === 'ready' ? 'sanctuary' : 'ready')}
                              disabled={updatingStatus === ordinal.inscriptionId}
                            >
                              {updatingStatus === ordinal.inscriptionId ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : ordinal.status === 'ready' ? (
                                'Switch to Sanctuary'
                              ) : (
                                'Ready'
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Attack Logs Section */}
              {attackLogs.length > 0 && (
                <section>
                  <h2 className="text-3xl font-black uppercase tracking-[0.3em] text-yellow-500 mb-6 flex items-center gap-3">
                    <Sword className="h-8 w-8" />
                    Horde Attack Log
                  </h2>
                  <div className="bg-black/60 border-2 border-yellow-500/50 rounded-lg p-6 max-h-96 overflow-y-auto">
                    {loadingLogs ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-yellow-500" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {attackLogs.map((log) => {
                          // Find the army image from the ordinals data already loaded
                          const armyOrdinal = ordinals.find(o => o.inscriptionId === log.inscription_id)
                          const armyImageUrl = armyOrdinal?.imageUrl || null
                          
                          return (
                            <div
                              key={log.id}
                              className="flex items-center gap-4 p-3 bg-black/40 rounded border border-yellow-500/30"
                            >
                              {/* Monster Image */}
                              <div className="flex-shrink-0">
                                {log.monster_image_url ? (
                                  <div className="relative w-16 h-16 rounded border-2 border-yellow-500/50 overflow-hidden">
                                    <Image
                                      src={log.monster_image_url}
                                      alt="Horde Monster"
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                  </div>
                                ) : (
                                  <div className="w-16 h-16 rounded border-2 border-yellow-500/50 bg-gray-800 flex items-center justify-center">
                                    <Sword className="h-6 w-6 text-yellow-500" />
                                  </div>
                                )}
                              </div>

                              {/* Attack Arrow */}
                              <div className="flex-shrink-0 text-yellow-500">
                                <Sword className="h-5 w-5 rotate-90" />
                              </div>

                              {/* Army Image */}
                              <div className="flex-shrink-0">
                                {armyImageUrl ? (
                                  <div className="relative w-16 h-16 rounded border-2 border-red-500/50 overflow-hidden">
                                    <Image
                                      src={armyImageUrl}
                                      alt="Army"
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                  </div>
                                ) : (
                                  <div className="w-16 h-16 rounded border-2 border-red-500/50 bg-gray-800 flex items-center justify-center">
                                    <Shield className="h-6 w-6 text-red-500" />
                                  </div>
                                )}
                              </div>

                              {/* Attack Details */}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-400 mb-1">
                                  {log.was_blocked ? (
                                    <span className="text-green-400 font-bold">🛡️ BLOCKED</span>
                                  ) : (
                                    <span>
                                      <span className="text-red-400 font-bold">-{log.damage} damage</span>
                                      {' '}({log.life_force_before} → {log.life_force_after} HP)
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 font-mono">
                                  {log.inscription_id?.slice(0, 8)}...
                                </div>
                              </div>

                              {/* Timestamp */}
                              <div className="flex-shrink-0 text-xs text-gray-500 ml-4">
                                {new Date(log.created_at).toLocaleTimeString()}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
              )}
            </>
          )}
        </main>
      </div>
  )

  // Bypass global timer if ?notime=1 is in URL
  if (bypassTimer) {
    return content
  }

  return (
    <GlobalStartTimeLock>
      {content}
    </GlobalStartTimeLock>
  )
}

