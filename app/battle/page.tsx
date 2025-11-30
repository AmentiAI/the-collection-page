'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Loader2, Shield, Sword, AlertCircle, CheckCircle2 } from 'lucide-react'
import dynamicImport from 'next/dynamic'

const LaserEyesWrapper = dynamicImport(
  () => import('@/components/LaserEyesWrapper'),
  { ssr: false, loading: () => null },
)

interface BattleOrdinal {
  inscriptionId: string
  imageUrl: string
  trait: 'Angelic' | 'Demonic'
  status: 'ready' | 'sanctuary' | null
  lifeForce: number
}

export default function BattlePage() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [ordinals, setOrdinals] = useState<BattleOrdinal[]>([])
  const [loading, setLoading] = useState(false)
  const [hasListed, setHasListed] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

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

  useEffect(() => {
    if (connected && address && !hasListed) {
      fetchBattleOrdinals()
    } else {
      setOrdinals([])
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
        const response = await fetch('/api/battle/status', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: address,
            inscriptionId,
            status: newStatus,
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

  const angelicOrdinals = ordinals.filter((o) => o.trait === 'Angelic')
  const demonicOrdinals = ordinals.filter((o) => o.trait === 'Demonic')

  return (
    <LaserEyesWrapper>
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
            <div className="rounded-2xl border-2 border-amber-500/70 bg-amber-950/30 p-8 text-center">
              <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-amber-200 mb-2">
                Listed Ordinals Detected
              </h2>
              <p className="text-gray-400 mb-4">
                You have ordinals listed on Magic Eden. Please delist them before
                entering battle.
              </p>
              <Button
                onClick={fetchBattleOrdinals}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Check Again
              </Button>
            </div>
          )}

          {connected && !hasListed && loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-12 w-12 animate-spin text-red-500" />
            </div>
          )}

          {connected && !hasListed && !loading && ordinals.length === 0 && (
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

          {connected && !hasListed && !loading && ordinals.length > 0 && (
            <div className="space-y-12">
              {angelicOrdinals.length > 0 && (
                <section>
                  <h2 className="text-3xl font-black uppercase tracking-[0.3em] text-cyan-400 mb-6 flex items-center gap-3">
                    <Shield className="h-8 w-8" />
                    Angelic Forces
                  </h2>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                    {angelicOrdinals.map((ordinal) => (
                      <div
                        key={ordinal.inscriptionId}
                        className="relative group rounded-lg overflow-hidden border-2 border-cyan-500/50 bg-cyan-950/20 hover:border-cyan-400 transition-all"
                      >
                        <div className="aspect-square relative">
                          <Image
                            src={ordinal.imageUrl}
                            alt={`Angelic ${ordinal.inscriptionId}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        <div className="p-1.5 bg-black/80">
                          {/* Life Force Bar */}
                          {ordinal.status && (
                            <div className="mb-1.5">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[8px] text-cyan-300/70 font-mono uppercase">Life Force</span>
                                <span className="text-[8px] text-cyan-300 font-mono">{ordinal.lifeForce}/100</span>
                              </div>
                              <div className="w-full h-1.5 bg-cyan-950/50 rounded-full overflow-hidden border border-cyan-500/30">
                                <div
                                  className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-all duration-300"
                                  style={{ width: `${ordinal.lifeForce}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {ordinal.status && (
                            <div className="flex items-center justify-center mb-1">
                              {ordinal.status === 'ready' ? (
                                <Sword className="h-3 w-3 text-cyan-400" />
                              ) : (
                                <Shield className="h-3 w-3 text-cyan-600" />
                              )}
                            </div>
                          )}
                          {!ordinal.status ? (
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
                              className="w-full text-[10px] py-1 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-950/50"
                              onClick={() => updateStatus(ordinal.inscriptionId, ordinal.status === 'ready' ? 'sanctuary' : 'ready')}
                              disabled={updatingStatus === ordinal.inscriptionId}
                            >
                              {updatingStatus === ordinal.inscriptionId ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : ordinal.status === 'ready' ? (
                                'Sanctuary'
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
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                    {demonicOrdinals.map((ordinal) => (
                      <div
                        key={ordinal.inscriptionId}
                        className="relative group rounded-lg overflow-hidden border-2 border-red-500/50 bg-red-950/20 hover:border-red-400 transition-all"
                      >
                        <div className="aspect-square relative">
                          <Image
                            src={ordinal.imageUrl}
                            alt={`Demonic ${ordinal.inscriptionId}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        <div className="p-1.5 bg-black/80">
                          {/* Life Force Bar */}
                          {ordinal.status && (
                            <div className="mb-1.5">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[8px] text-red-300/70 font-mono uppercase">Life Force</span>
                                <span className="text-[8px] text-red-300 font-mono">{ordinal.lifeForce}/100</span>
                              </div>
                              <div className="w-full h-1.5 bg-red-950/50 rounded-full overflow-hidden border border-red-500/30">
                                <div
                                  className="h-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-300"
                                  style={{ width: `${ordinal.lifeForce}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {ordinal.status && (
                            <div className="flex items-center justify-center mb-1">
                              {ordinal.status === 'ready' ? (
                                <Sword className="h-3 w-3 text-red-400" />
                              ) : (
                                <Shield className="h-3 w-3 text-red-600" />
                              )}
                            </div>
                          )}
                          {!ordinal.status ? (
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
                              className="w-full text-[10px] py-1 border border-red-500/50 text-red-400 hover:bg-red-950/50"
                              onClick={() => updateStatus(ordinal.inscriptionId, ordinal.status === 'ready' ? 'sanctuary' : 'ready')}
                              disabled={updatingStatus === ordinal.inscriptionId}
                            >
                              {updatingStatus === ordinal.inscriptionId ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : ordinal.status === 'ready' ? (
                                'Sanctuary'
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
            </div>
          )}
        </main>
      </div>
    </LaserEyesWrapper>
  )
}

