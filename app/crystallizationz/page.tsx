'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Loader2, Gem, Clock, TrendingUp, History, X } from 'lucide-react'
import dynamicImport from 'next/dynamic'
import GlobalStartTimeLock from '@/components/GlobalStartTimeLock'

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

interface CrystallizationRecord {
  id: string
  inscriptionId: string
  enteredAt: string
  minutesElapsed: number
  powderEarned: number
  secondsUntilNextPowder: number
  imageUrl: string
  trait: 'Angelic' | 'Demonic' | null
}

interface DailyHistory {
  id: string
  date: string
  total_ascension_powder: number
}

export default function CrystallizationPage() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [ordinals, setOrdinals] = useState<BattleOrdinal[]>([])
  const [crystallizations, setCrystallizations] = useState<CrystallizationRecord[]>([])
  const [history, setHistory] = useState<DailyHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [entering, setEntering] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [exiting, setExiting] = useState<string | null>(null)

  const handleHolderVerified = useCallback((holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }, [])

  const handleVerifyingStart = useCallback(() => {
    setIsVerifying(true)
  }, [])

  const fetchOrdinals = useCallback(async () => {
    if (!address) {
      setOrdinals([])
      return
    }

    try {
      const response = await fetch(
        `/api/battle/ordinals?walletAddress=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch ordinals')
      }

      const data = await response.json()
      // Filter out dead ordinals and those in battle
      const availableOrdinals = (data.ordinals || []).filter(
        (ord: BattleOrdinal) => 
          (ord.lifeForce ?? 0) > 0 && 
          ord.status !== 'ready'
      )
      setOrdinals(availableOrdinals)
    } catch (error) {
      console.error('Error fetching ordinals:', error)
      setOrdinals([])
    }
  }, [address])

  const fetchCrystallizations = useCallback(async () => {
    if (!address) {
      setCrystallizations([])
      return
    }

    try {
      const response = await fetch(
        `/api/crystallization/status?walletAddress=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      )

      if (response.ok) {
        const data = await response.json()
        setCrystallizations(data.crystallizations || [])
      }
    } catch (error) {
      console.error('Error fetching crystallizations:', error)
    }
  }, [address])

  const fetchHistory = useCallback(async () => {
    if (!address) {
      setHistory([])
      return
    }

    try {
      const response = await fetch(
        `/api/crystallization/history?walletAddress=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      )

      if (response.ok) {
        const data = await response.json()
        setHistory(data.history || [])
      }
    } catch (error) {
      console.error('Error fetching history:', error)
    }
  }, [address])

  useEffect(() => {
    if (connected && address) {
      setLoading(true)
      Promise.all([
        fetchOrdinals(),
        fetchCrystallizations(),
        fetchHistory(),
      ]).finally(() => setLoading(false))
    } else {
      setOrdinals([])
      setCrystallizations([])
      setHistory([])
    }
  }, [connected, address, fetchOrdinals, fetchCrystallizations, fetchHistory])

  // Update timers every 30 seconds
  useEffect(() => {
    if (!connected || !address || crystallizations.length === 0) return

    const interval = setInterval(() => {
      fetchCrystallizations()
    }, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [connected, address, crystallizations.length, fetchCrystallizations])

  const handleEnter = useCallback(async (inscriptionId: string) => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    setEntering(inscriptionId)
    try {
      const response = await fetch('/api/crystallization/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, inscriptionId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to enter crystallization')
      }

      toast.success('Ordinal entered crystallization!')
      await fetchOrdinals()
      await fetchCrystallizations()
    } catch (error) {
      console.error('Error entering crystallization:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to enter crystallization')
    } finally {
      setEntering(null)
    }
  }, [address, toast, fetchOrdinals, fetchCrystallizations])

  const handleClaim = useCallback(async (inscriptionId: string) => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    setClaiming(inscriptionId)
    try {
      const response = await fetch('/api/crystallization/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, inscriptionId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to claim powder')
      }

      const data = await response.json()
      toast.success(`Claimed ${data.powderEarned} ascension powder!`)
      await fetchCrystallizations()
      await fetchHistory()
    } catch (error) {
      console.error('Error claiming powder:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to claim powder')
    } finally {
      setClaiming(null)
    }
  }, [address, toast, fetchCrystallizations, fetchHistory])

  const handleExit = useCallback(async (inscriptionId: string) => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    setExiting(inscriptionId)
    try {
      const response = await fetch('/api/crystallization/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, inscriptionId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to exit crystallization')
      }

      toast.success('Ordinal exited crystallization')
      // Optimistically remove from list
      setCrystallizations((prev) => prev.filter((c) => c.inscriptionId !== inscriptionId))
      await fetchOrdinals()
      await fetchCrystallizations()
    } catch (error) {
      console.error('Error exiting crystallization:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to exit crystallization')
      // Refresh on error to ensure state is correct
      await fetchCrystallizations()
    } finally {
      setExiting(null)
    }
  }, [address, toast, fetchOrdinals, fetchCrystallizations])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
    if (minutes > 0) return `${minutes}m ${secs}s`
    return `${secs}s`
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  // Filter out ordinals that are already crystallized
  const crystallizedIds = new Set(crystallizations.map(c => c.inscriptionId))
  const availableOrdinals = ordinals.filter(ord => !crystallizedIds.has(ord.inscriptionId))

  return (
    <GlobalStartTimeLock>
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

        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-black uppercase mb-4 text-purple-400 flex items-center justify-center gap-3">
              <Gem className="h-12 w-12" />
              Crystallization Chamber
            </h1>
            <p className="text-xl text-gray-400">
              Place your ordinals in crystallization to passively generate ascension powder. Earn +1 powder every 30 minutes.
            </p>
          </div>

          {!connected ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-400 mb-4">Please connect your wallet to access the Crystallization Chamber</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
          ) : (
            <>
              {/* Active Crystallizations */}
              {crystallizations.length > 0 && (
                <div className="bg-black/60 border-2 border-purple-500/50 rounded-lg p-6 mb-6">
                  <h2 className="text-2xl font-bold text-purple-400 mb-4 flex items-center gap-2">
                    <Gem className="h-6 w-6" />
                    Active Crystallizations
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {crystallizations.map((crystal) => (
                      <div
                        key={crystal.id}
                        className={`border-2 rounded-lg p-3 ${
                          crystal.trait === 'Angelic'
                            ? 'border-cyan-500/50 bg-cyan-950/20'
                            : 'border-red-500/50 bg-red-950/20'
                        }`}
                      >
                        <img
                          src={crystal.imageUrl}
                          alt="Crystallized"
                          className="w-full aspect-square object-cover rounded mb-2"
                        />
                        <div className="text-sm mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-bold ${crystal.trait === 'Angelic' ? 'text-cyan-400' : 'text-red-400'}`}>
                              {crystal.trait || 'Unknown'}
                            </span>
                          </div>
                          <div className="text-purple-400 font-semibold mb-1">
                            {crystal.powderEarned} Powder Earned
                          </div>
                          <div className="flex items-center gap-1 text-yellow-400 text-xs">
                            <Clock className="h-3 w-3" />
                            <span>{formatDuration(crystal.minutesElapsed)} elapsed</span>
                          </div>
                          {crystal.secondsUntilNextPowder < 1800 && (
                            <div className="text-green-400 text-xs mt-1">
                              Next +1 in {formatTime(crystal.secondsUntilNextPowder)}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Button
                            onClick={() => handleClaim(crystal.inscriptionId)}
                            disabled={claiming === crystal.inscriptionId || crystal.powderEarned === 0}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {claiming === crystal.inscriptionId ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Claiming...
                              </>
                            ) : (
                              <>
                                <TrendingUp className="h-4 w-4 mr-2" />
                                Claim {crystal.powderEarned} Powder
                              </>
                            )}
                          </Button>
                          <Button
                            onClick={() => handleExit(crystal.inscriptionId)}
                            disabled={exiting === crystal.inscriptionId || claiming === crystal.inscriptionId}
                            variant="outline"
                            className="w-full border-red-500/50 text-red-400 hover:bg-red-950/50 py-2 text-sm font-bold disabled:opacity-50"
                          >
                            {exiting === crystal.inscriptionId ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Exiting...
                              </>
                            ) : (
                              <>
                                <X className="h-4 w-4 mr-2" />
                                Exit Crystallization
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Ordinals */}
              <div className="bg-black/60 border-2 border-purple-500/50 rounded-lg p-6 mb-6">
                <h2 className="text-2xl font-bold text-purple-400 mb-4">Available Ordinals</h2>
                {availableOrdinals.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">
                    {crystallizations.length > 0 
                      ? 'All available ordinals are already in crystallization'
                      : 'No ordinals available for crystallization. Remove them from battle first.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {availableOrdinals.map((ordinal) => (
                      <div
                        key={ordinal.inscriptionId}
                        className={`border-2 rounded-lg p-3 ${
                          ordinal.trait === 'Angelic'
                            ? 'border-cyan-500/50 bg-cyan-950/20'
                            : 'border-red-500/50 bg-red-950/20'
                        }`}
                      >
                        <img
                          src={ordinal.imageUrl}
                          alt="Ordinal"
                          className="w-full aspect-square object-cover rounded mb-2"
                        />
                        <div className="text-sm mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-bold ${ordinal.trait === 'Angelic' ? 'text-cyan-400' : 'text-red-400'}`}>
                              {ordinal.trait}
                            </span>
                            <span className="text-gray-300">{ordinal.lifeForce}/100</span>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleEnter(ordinal.inscriptionId)}
                          disabled={entering === ordinal.inscriptionId}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 text-sm font-bold disabled:opacity-50"
                        >
                          {entering === ordinal.inscriptionId ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Entering...
                            </>
                          ) : (
                            <>
                              <Gem className="h-4 w-4 mr-2" />
                              Enter Crystallization
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* History */}
              <div className="bg-black/60 border-2 border-purple-500/50 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-purple-400 mb-4 flex items-center gap-2">
                  <History className="h-6 w-6" />
                  Daily Earnings History
                </h2>
                {history.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No crystallization history yet</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {history.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between p-3 bg-black/40 rounded border border-purple-500/30"
                      >
                        <div className="flex items-center gap-3">
                          <TrendingUp className="h-5 w-5 text-purple-400" />
                          <div>
                            <span className="text-white font-semibold">
                              {new Date(record.date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        </div>
                        <div className="text-purple-400 font-bold">
                          +{record.total_ascension_powder} Powder
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </LaserEyesWrapper>
    </GlobalStartTimeLock>
  )
}

