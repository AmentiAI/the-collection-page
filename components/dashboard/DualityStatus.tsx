'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/Toast'

interface DualityCycle {
  id: string
  weekStart: string
  weekEnd: string
  status: 'alignment' | 'active' | 'trial' | 'completed' | 'pending'
  activeEffect?: string | null
  effectExpiresAt?: string | null
}

interface DualityParticipant {
  id: string
  cycleId: string
  profileId: string
  alignment: 'good' | 'evil'
  fateMeter: number
  karmaSnapshot: number
  participationCount: number
  questCompleted: boolean
  eligibleForTrial: boolean
  lockedAt?: string | null
}

interface DualityPartnerInfo {
  alignment: 'good' | 'evil'
  walletAddress?: string
  username?: string | null
}

interface DualityEvent {
  id: string
  eventType: string
  result?: string | null
  karmaDeltaGood?: number
  karmaDeltaEvil?: number
  occurredAt: string
  metadata?: Record<string, any> | null
}

interface DualityTrial {
  id: string
  status: 'scheduled' | 'voting' | 'resolved' | 'cancelled'
  verdict?: string | null
  votesAbsolve: number
  votesCondemn: number
  scheduledAt: string
  voteEndsAt: string
}

const formatDuration = (ms: number) => {
  if (ms <= 0) return '0s'
  const seconds = Math.floor(ms / 1000)
  const s = seconds % 60
  const minutes = Math.floor(seconds / 60)
  const m = minutes % 60
  const hours = Math.floor(minutes / 60)
  const h = hours % 24
  const days = Math.floor(hours / 24)
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (h || parts.length) parts.push(`${h}h`)
  if (m || parts.length) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}

interface DualityStatusProps {
  walletAddress: string | null
  profileSide?: 'good' | 'evil' | null
}

const ALIGNMENT_DESCRIPTIONS = {
  good: {
    title: 'Good Holder',
    description: 'Embrace virtue. Cooperate to raise the Fate Meter and protect the realm.',
    emoji: '🕊️'
  },
  evil: {
    title: 'Evil Holder',
    description: 'Embrace mischief. Plot sabotage or seize fate-altering opportunities.',
    emoji: '😈'
  }
}

export default function DualityStatus({ walletAddress, profileSide }: DualityStatusProps) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [submittingAlignment, setSubmittingAlignment] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [data, setData] = useState<{
    cycle: DualityCycle | null
    participant: DualityParticipant | null
    partner: DualityPartnerInfo | null
    events: DualityEvent[]
    trial: DualityTrial | null
  }>({ cycle: null, participant: null, partner: null, events: [], trial: null })

  const fetchStatus = useCallback(async () => {
    if (!walletAddress) {
      setData({ cycle: null, participant: null, partner: null, events: [], trial: null })
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/duality/me?walletAddress=${encodeURIComponent(walletAddress)}`)
      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to load Duality status')
        setData({ cycle: null, participant: null, partner: null, events: [], trial: null })
        return
      }

      setData({
        cycle: result.cycle,
        participant: result.participant,
        partner: result.partner,
        events: result.events || [],
        trial: result.trial || null
      })
    } catch (error) {
      console.error('Duality status fetch error:', error)
      toast.error('Failed to load Duality status')
      setData({ cycle: null, participant: null, partner: null, events: [], trial: null })
    } finally {
      setLoading(false)
    }
  }, [walletAddress, toast])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleAlignment = useCallback(async (alignment: 'good' | 'evil') => {
    if (!walletAddress) return
    if (profileSide && alignment !== profileSide) {
      toast.warning('Duality alignment must match your chosen morality side.')
      return
    }
    setSubmittingAlignment(true)
    try {
      const response = await fetch('/api/duality/alignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, alignment })
      })

      const result = await response.json()
      if (!response.ok) {
        toast.error(result.error || 'Failed to lock alignment')
        return
      }

      toast.success(`Alignment locked: ${ALIGNMENT_DESCRIPTIONS[alignment].title}`)
      await fetchStatus()
    } catch (error) {
      console.error('Alignment error:', error)
      toast.error('Failed to lock alignment')
    } finally {
      setSubmittingAlignment(false)
    }
  }, [walletAddress, profileSide, toast, fetchStatus])

  const autoAlignAttemptedRef = useRef(false)

  useEffect(() => {
    autoAlignAttemptedRef.current = false
  }, [profileSide, data.cycle?.id])

  const cycle = data.cycle
  const participant = data.participant
  const partner = data.partner
  const events = data.events
  const trial = data.trial

  useEffect(() => {
    if (!walletAddress || !profileSide || !cycle || cycle.status !== 'alignment') return
    if (submittingAlignment) return
    if (participant && participant.alignment === profileSide) return
    if (autoAlignAttemptedRef.current) return
    autoAlignAttemptedRef.current = true
    handleAlignment(profileSide).catch((error) => {
      console.error('Auto alignment error:', error)
      autoAlignAttemptedRef.current = false
    })
  }, [walletAddress, profileSide, cycle?.id, cycle?.status, participant?.alignment, submittingAlignment, handleAlignment])

  const partnerName = useMemo(() => {
    if (!partner) return null
    if (partner.username) return partner.username
    if (partner.walletAddress) return `${partner.walletAddress.slice(0, 6)}…${partner.walletAddress.slice(-4)}`
    return null
  }, [partner])

  if (!walletAddress) {
    return (
      <div className="bg-black/60 border border-blue-600/40 rounded-lg p-6 text-center">
        <div className="text-blue-300 font-mono text-sm">
          Connect your wallet to join the Duality weekly cycle.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-black/60 border border-blue-600/40 rounded-lg p-6 text-center">
        <div className="text-blue-400 font-mono text-sm animate-pulse">Loading Duality status…</div>
      </div>
    )
  }

  if (!cycle) {
    return (
      <div className="bg-black/60 border border-blue-600/40 rounded-lg p-6 text-center">
        <div className="text-blue-300 font-mono text-sm">
          Duality Protocol is currently idle. Await the next weekly cycle.
        </div>
      </div>
    )
  }

  const cycleTitle = `Week ${cycle.weekStart} → ${cycle.weekEnd}`
  const alignmentInfo = participant ? ALIGNMENT_DESCRIPTIONS[participant.alignment] : null
  const profileAlignmentInfo = profileSide ? ALIGNMENT_DESCRIPTIONS[profileSide] : null
  const trialStartsIn = trial ? new Date(trial.scheduledAt).getTime() - now : null
  const trialEndsIn = trial ? new Date(trial.voteEndsAt).getTime() - now : null

  return (
    <div className="bg-black/60 border border-blue-600/40 rounded-lg p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-blue-200 font-mono text-sm uppercase tracking-wide">Duality Protocol</div>
        <span
          className={`px-3 py-1 text-xs font-mono uppercase rounded border ${
            cycle.status === 'alignment'
              ? 'border-yellow-500/60 text-yellow-300'
              : cycle.status === 'active'
              ? 'border-green-500/60 text-green-300'
              : cycle.status === 'trial'
              ? 'border-purple-500/60 text-purple-300'
              : 'border-gray-500/60 text-gray-300'
          }`}
        >
          {cycle.status}
        </span>
        <div className="text-xs text-gray-400 font-mono">{cycleTitle}</div>
      </div>

      {cycle.activeEffect && (
        <div className="bg-blue-900/20 border border-cyan-500/40 rounded-lg p-4 text-sm text-cyan-200 font-mono">
          <div className="uppercase text-xs text-cyan-300 mb-1">Global Effect</div>
          <div>{cycle.activeEffect}</div>
          {cycle.effectExpiresAt && (
            <div className="text-xs text-cyan-300/70 mt-2">
              Ends at {new Date(cycle.effectExpiresAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {participant && profileSide && participant.alignment !== profileSide && (
        <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4 text-xs font-mono text-yellow-200">
          Your Duality alignment is locked to <span className="font-bold">{participant.alignment.toUpperCase()}</span> for this week.
          Morality side changes will apply next cycle.
        </div>
      )}

      {trial && participant && (
        <div className="bg-purple-900/20 border border-purple-500/40 rounded-lg p-4 text-sm font-mono">
          <div className="uppercase text-xs text-purple-300 mb-2">Trial of Karma</div>
          <div className="text-gray-200 text-base font-bold mb-1">
            Status: {trial.status.toUpperCase()}
          </div>
          <div className="text-xs text-gray-400">
            Starts {new Date(trial.scheduledAt).toLocaleString()} • Voting ends {new Date(trial.voteEndsAt).toLocaleString()}
          </div>
          {trial.status !== 'resolved' && (
            <div className="text-xs text-gray-300 mt-1">
              {trial.status === 'scheduled'
                ? `Voting opens in ${formatDuration(trialStartsIn ?? 0)}`
                : `Voting closes in ${formatDuration(trialEndsIn ?? 0)}`}
            </div>
          )}
          <div className="text-xs text-gray-400 mt-2">
            Votes so far: ⚪ {trial.votesAbsolve} / 🔴 {trial.votesCondemn}
          </div>
          {trial.verdict && trial.status === 'resolved' && (
            <div className="text-xs text-purple-200 mt-2">
              Verdict: {trial.verdict}
            </div>
          )}
        </div>
      )}

      {!participant && cycle.status === 'alignment' && (
        <div className="space-y-4">
          {profileSide ? (
            <>
              <div className="text-sm text-gray-300 font-mono">
                Your Duality alignment follows your morality choice. We’ll lock you in as{' '}
                <span className="font-bold text-white">{profileAlignmentInfo?.title}</span> for this cycle.
              </div>
              <button
                onClick={() => handleAlignment(profileSide)}
                disabled={submittingAlignment}
                className={`w-full flex flex-col items-start bg-black/50 border rounded-lg p-4 transition ${
                  profileSide === 'good'
                    ? 'border-green-600/50 hover:border-green-500 hover:bg-green-900/5'
                    : 'border-red-600/50 hover:border-red-500 hover:bg-red-900/5'
                } ${submittingAlignment ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="text-2xl mb-2">{profileAlignmentInfo?.emoji}</div>
                <div className="text-lg font-mono text-white">{profileAlignmentInfo?.title}</div>
                <div className="text-xs text-gray-400 font-mono mt-2">
                  {profileAlignmentInfo?.description}
                </div>
                <div className="mt-3 text-xs text-gray-500 font-mono uppercase">
                  {submittingAlignment ? 'Locking alignment…' : 'Lock alignment for this cycle'}
                </div>
              </button>
            </>
          ) : (
            <div className="text-sm text-yellow-300 font-mono">
              Choose a morality side in your profile first, then you’ll be auto-enrolled here.
            </div>
          )}
        </div>
      )}

      {participant && alignmentInfo && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 border border-blue-500/30 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-3 text-white">
              <span className="text-3xl" aria-hidden>{alignmentInfo.emoji}</span>
              <div>
                <div className="text-lg font-mono font-bold">{alignmentInfo.title}</div>
                <div className="text-xs text-gray-400 font-mono">{alignmentInfo.description}</div>
              </div>
            </div>
            <div className="text-xs text-gray-400 font-mono uppercase">Fate Meter</div>
            <div className="w-full bg-black/60 h-2 rounded overflow-hidden">
              <div
                className={`h-full ${participant.alignment === 'good' ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, Math.max(0, participant.fateMeter || 0))}%` }}
              />
            </div>
            {partnerName && (
              <div className="text-sm text-gray-300 font-mono">
                Fate partner: <span className="text-white">{partnerName}</span>{' '}
                <span className="uppercase text-xs text-gray-500">({partner?.alignment} side)</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-400 font-mono">
              <div>
                <div className="uppercase text-gray-500 mb-1">Cycle Participation</div>
                <div className="text-white text-base">{participant.participationCount}</div>
              </div>
              <div>
                <div className="uppercase text-gray-500 mb-1">Trial Eligible</div>
                <div className={`text-base ${participant.eligibleForTrial ? 'text-yellow-300' : 'text-gray-500'}`}>
                  {participant.eligibleForTrial ? 'Yes' : 'No'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-black/40 border border-blue-500/30 rounded-lg p-5">
            <div className="text-xs text-gray-400 font-mono uppercase mb-3">Recent Events</div>
            {events.length === 0 ? (
              <div className="text-xs text-gray-500 font-mono">No events recorded yet this cycle.</div>
            ) : (
              <div className="space-y-3 max-h-48 overflow-auto pr-1">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="bg-black/40 border border-blue-500/20 rounded-md p-3 text-xs font-mono"
                  >
                    <div className="flex justify-between text-gray-300">
                      <span className="uppercase text-blue-300">{event.eventType}</span>
                      <span className="text-gray-500">
                        {new Date(event.occurredAt).toLocaleString(undefined, {
                          hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric'
                        })}
                      </span>
                    </div>
                    {event.result && (
                      <div className="text-gray-400 mt-1">Outcome: {event.result}</div>
                    )}
                    {(event.karmaDeltaGood || event.karmaDeltaEvil) && (
                      <div className="text-gray-400 mt-1">
                        {event.karmaDeltaGood ? (
                          <span className="text-green-400">+{event.karmaDeltaGood} good</span>
                        ) : null}
                        {event.karmaDeltaEvil ? (
                          <span className="text-red-400 ml-2">{event.karmaDeltaEvil > 0 ? '+' : ''}{event.karmaDeltaEvil} evil</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!participant && cycle.status !== 'alignment' && (
        <div className="text-sm text-gray-400 font-mono">
          You missed the alignment window for this week but can spectate ongoing events. Check back next cycle to participate.
        </div>
      )}
    </div>
  )
}

