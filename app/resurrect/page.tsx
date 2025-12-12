'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Loader2, Skull, Clock, CheckCircle } from 'lucide-react'
import dynamicImport from 'next/dynamic'
import GlobalStartTimeLock from '@/components/GlobalStartTimeLock'

// LaserEyesWrapper is already provided by app/layout.tsx, no need to wrap again

interface DeadArmy {
  inscriptionId: string
  imageUrl: string
  trait: 'Angelic' | 'Demonic'
  deathTime: string
  resurrectionTime: string | null
  canResurrect: boolean
  timeRemaining: string | null
}

export default function ResurrectPage() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [deadArmies, setDeadArmies] = useState<DeadArmy[]>([])
  const [loading, setLoading] = useState(false)
  const [resurrecting, setResurrecting] = useState<string | null>(null)
  const [resurrectionHistory, setResurrectionHistory] = useState<Array<{ id: string; inscription_id: string; trait: string | null; resurrected_at: string }>>([])

  const handleHolderVerified = useCallback((holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }, [])

  const handleVerifyingStart = useCallback(() => {
    setIsVerifying(true)
  }, [])

  const fetchDeadArmies = useCallback(async () => {
    if (!address) {
      setDeadArmies([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `/api/resurrect/dead-armies?walletAddress=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch dead armies')
      }

      const data = await response.json()
      setDeadArmies(data.deadArmies || [])
    } catch (error) {
      console.error('Error fetching dead armies:', error)
      toast.error('Failed to load dead armies')
      setDeadArmies([])
    } finally {
      setLoading(false)
    }
  }, [address, toast])

  const fetchResurrectionHistory = useCallback(async () => {
    if (!address) {
      setResurrectionHistory([])
      return
    }

    try {
      const response = await fetch(
        `/api/resurrect/history?walletAddress=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      )

      if (response.ok) {
        const data = await response.json()
        setResurrectionHistory(data.history || [])
      }
    } catch (error) {
      console.error('Error fetching resurrection history:', error)
    }
  }, [address])

  useEffect(() => {
    if (connected && address) {
      fetchDeadArmies()
      fetchResurrectionHistory()
      // Refresh every minute to update countdown
      const interval = setInterval(() => {
        fetchDeadArmies()
        fetchResurrectionHistory()
      }, 60000)
      return () => clearInterval(interval)
    } else {
      setDeadArmies([])
      setResurrectionHistory([])
    }
  }, [connected, address, fetchDeadArmies, fetchResurrectionHistory])

  const handleResurrect = useCallback(async (inscriptionId: string) => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    setResurrecting(inscriptionId)
    try {
      const response = await fetch('/api/resurrect/resurrect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, inscriptionId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to resurrect army')
      }

      toast.success('Army resurrected! They are now ready for battle.')
      
      // Optimistically remove the resurrected army from the list without full refetch
      setDeadArmies((prev) => prev.filter((army) => army.inscriptionId !== inscriptionId))
      
      // Update resurrections count in profile (don't await to avoid blocking)
      fetch(`/api/profile/increment-resurrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      }).catch((err) => console.error('Error updating resurrections count:', err))
      
      // Refresh history in background (non-blocking)
      fetchResurrectionHistory().catch((err) => console.error('Error fetching resurrection history:', err))
    } catch (error) {
      console.error('Error resurrecting army:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to resurrect army')
      // On error, refetch to ensure state is correct
      fetchDeadArmies()
    } finally {
      setResurrecting(null)
    }
  }, [address, toast, fetchResurrectionHistory, fetchDeadArmies])

  const handleStartResurrection = useCallback(async (inscriptionId: string) => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    setResurrecting(inscriptionId)
    try {
      const response = await fetch('/api/resurrect/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, inscriptionId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to start resurrection')
      }

      toast.success('Resurrection process started. Your army will be locked for 1 hour.')
      await fetchDeadArmies()
    } catch (error) {
      console.error('Error starting resurrection:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to start resurrection')
    } finally {
      setResurrecting(null)
    }
  }, [address, toast, fetchDeadArmies])

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
            <h1 className="text-5xl font-black uppercase mb-4 text-red-400 flex items-center justify-center gap-3">
              <Skull className="h-12 w-12" />
              Resurrection Chamber
            </h1>
            <p className="text-xl text-gray-400">
              Bring your fallen armies back to life. Resurrection takes 1 hour.
            </p>
          </div>

          {!connected ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-400 mb-4">Please connect your wallet to access the Resurrection Chamber</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-red-400" />
            </div>
          ) : deadArmies.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-400 mb-4">No dead armies found. Your forces are all alive!</p>
            </div>
          ) : (
            <div className="bg-black/60 border-2 border-red-500/50 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-red-400 mb-4">Fallen Armies</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {deadArmies.map((army) => (
                  <div
                    key={army.inscriptionId}
                    className={`border-2 rounded-lg p-3 ${
                      army.trait === 'Angelic'
                        ? 'border-cyan-500/50 bg-cyan-950/20'
                        : 'border-red-500/50 bg-red-950/20'
                    }`}
                  >
                    <div className="relative">
                      <img
                        src={army.imageUrl}
                        alt="Dead Army"
                        className="w-full aspect-square object-cover rounded mb-2 opacity-50"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Skull className="h-12 w-12 text-red-500" />
                      </div>
                    </div>
                    <div className="text-sm mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-bold ${army.trait === 'Angelic' ? 'text-cyan-400' : 'text-red-400'}`}>
                          {army.trait}
                        </span>
                      </div>
                      <div className="text-gray-400 text-xs">
                        Died: {new Date(army.deathTime).toLocaleString()}
                      </div>
                    </div>
                    {army.canResurrect ? (
                      <Button
                        onClick={() => handleResurrect(army.inscriptionId)}
                        disabled={resurrecting === army.inscriptionId}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 text-sm font-bold disabled:opacity-50"
                      >
                        {resurrecting === army.inscriptionId ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Resurrecting...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Resurrect
                          </>
                        )}
                      </Button>
                    ) : army.resurrectionTime ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2 text-yellow-400 text-xs">
                          <Clock className="h-4 w-4" />
                          <span>{army.timeRemaining || 'Calculating...'}</span>
                        </div>
                        <Button
                          disabled
                          className="w-full bg-gray-600 text-gray-400 py-2 text-sm font-bold cursor-not-allowed"
                        >
                          Resurrection in Progress
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleStartResurrection(army.inscriptionId)}
                        disabled={resurrecting === army.inscriptionId}
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-2 text-sm font-bold disabled:opacity-50"
                      >
                        {resurrecting === army.inscriptionId ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Skull className="h-4 w-4 mr-2" />
                            Start Resurrection
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resurrection History */}
          {connected && (
            <div className="bg-black/60 border-2 border-red-500/50 rounded-lg p-6 mt-6">
              <h2 className="text-2xl font-bold text-red-400 mb-4">Resurrection History</h2>
              {resurrectionHistory.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No resurrection history yet</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {resurrectionHistory.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between p-3 bg-black/40 rounded border border-red-500/30"
                    >
                      <div className="flex items-center gap-3">
                        <Skull className={`h-5 w-5 ${record.trait === 'Angelic' ? 'text-cyan-400' : 'text-red-400'}`} />
                        <div>
                          <span className="text-white font-semibold">
                            Resurrected {record.inscription_id.slice(0, 8)}...
                          </span>
                          {record.trait && (
                            <span className={`ml-2 text-sm ${record.trait === 'Angelic' ? 'text-cyan-400' : 'text-red-400'}`}>
                              ({record.trait})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-gray-400 text-sm">
                        {new Date(record.resurrected_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </GlobalStartTimeLock>
  )
}

