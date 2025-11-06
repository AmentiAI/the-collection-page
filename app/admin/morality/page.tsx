'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/Toast'

type SocialPlatform = 'twitter' | 'discord' | 'instagram' | 'youtube' | 'tiktok' | 'facebook'
type PlatformOption = 'none' | SocialPlatform

const ADMIN_HEADER_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN

interface AdminTask {
  id: string
  title: string
  description: string | null
  type: 'good' | 'evil'
  points: number
  category: string | null
  is_active: boolean
  proof_required: boolean
  required_platform: PlatformOption
}

interface DualityCycle {
  id: string
  weekStart: string
  weekEnd: string
  status: 'pending' | 'alignment' | 'active' | 'trial' | 'completed'
  activeEffect?: string | null
  effectExpiresAt?: string | null
  createdAt?: string
  updatedAt?: string
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
  lockedAt: string | null
  walletAddress?: string
  username?: string
  netKarma?: number
}

interface DualityPair {
  id: string
  cycleId: string
  goodParticipantId: string
  evilParticipantId: string
  fateMeter: number
  status: string
  goodWalletAddress?: string
  goodUsername?: string
  evilWalletAddress?: string
  evilUsername?: string
}

interface DualityTrial {
  id: string
  cycleId: string
  participantId: string
  status: 'scheduled' | 'voting' | 'resolved' | 'cancelled'
  verdict?: string | null
  votesAbsolve: number
  votesCondemn: number
  scheduledAt: string
  voteEndsAt: string
  alignment: 'good' | 'evil'
  walletAddress?: string
  username?: string | null
  discordUserId?: string | null
  metadata?: Record<string, any> | null
}

interface DualityEventSummary {
  id: string
  cycleId: string
  pairId: string
  participantId?: string | null
  cycleDay?: number | null
  eventType: string
  result?: string | null
  karmaDeltaGood: number
  karmaDeltaEvil: number
  occurredAt: string
  metadata?: Record<string, any> | null
}

type EventFormState = {
  pairId: string
  eventType: string
  result: string
  karmaDeltaGood: string
  karmaDeltaEvil: string
  fateMeter: string
}

type TrialFormState = {
  participantId: string
  scheduledAt: string
  voteEndsAt: string
}

const PLATFORM_OPTIONS: PlatformOption[] = ['none', 'twitter', 'discord', 'instagram', 'youtube', 'tiktok', 'facebook']
const GLOBAL_EFFECT_OPTIONS = [
  { value: '', label: 'None (clear effect)' },
  { value: 'Dark Surge – Evil karma x2 (12h)', label: 'Dark Surge – Evil karma x2' },
  { value: 'Mercy Hour – Good karma x2 (12h)', label: 'Mercy Hour – Good karma x2' },
  { value: 'Mischief Winds – Temporary side swap', label: 'Mischief Winds – side swap' },
  { value: 'Karmic Eclipse – Pairings reshuffled', label: 'Karmic Eclipse – reshuffle' }
]

const emptyTask: Omit<AdminTask, 'id'> = {
  title: '',
  description: '',
  type: 'good',
  points: 5,
  category: '',
  is_active: true,
  proof_required: false,
  required_platform: 'none'
}

const formatPlatform = (platform: PlatformOption) => {
  if (!platform || platform === 'none') return 'None'
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}

const mapTasksForState = (tasks: any[]): AdminTask[] =>
  tasks.map((task) => ({
    ...task,
    proof_required: !!task.proof_required,
    required_platform: (task.required_platform ?? 'none') as PlatformOption
  }))

const serializePlatform = (platform: PlatformOption) => (platform === 'none' ? null : platform)

const formatKarmaText = (good: number, evil: number) => {
  const parts: string[] = []
  if (good) parts.push(`Good ${good > 0 ? '+' : ''}${good}`)
  if (evil) parts.push(`Evil ${evil > 0 ? '+' : ''}${evil}`)
  if (parts.length === 0) return '0'
  return parts.join(' / ')
}

const truncateText = (value?: string | null, length = 80) => {
  if (!value) return '—'
  return value.length > length ? `${value.slice(0, length)}…` : value
}

export default function MoralityAdminPage() {
  const toast = useToast()
  const [goodTasks, setGoodTasks] = useState<AdminTask[]>([])
  const [evilTasks, setEvilTasks] = useState<AdminTask[]>([])
  const [loading, setLoading] = useState(true)
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [newTask, setNewTask] = useState(emptyTask)
  const [cycleData, setCycleData] = useState<{
    cycle: DualityCycle | null
    participants: DualityParticipant[]
    pairs: DualityPair[]
    trials: DualityTrial[]
    events: DualityEventSummary[]
  } | null>(null)
  const [loadingCycle, setLoadingCycle] = useState(true)
  const [startingCycle, setStartingCycle] = useState(false)
  const [pairingCycle, setPairingCycle] = useState(false)
  const [submittingEvent, setSubmittingEvent] = useState(false)
  const [schedulingTrial, setSchedulingTrial] = useState(false)
  const [eventForm, setEventForm] = useState<EventFormState>({
    pairId: '',
    eventType: '',
    result: '',
    karmaDeltaGood: '',
    karmaDeltaEvil: '',
    fateMeter: ''
  })
  const [trialForm, setTrialForm] = useState<TrialFormState>({
    participantId: '',
    scheduledAt: '',
    voteEndsAt: ''
  })
  const [effectForm, setEffectForm] = useState({
    effect: '',
    durationHours: '12',
    statusOverride: ''
  })
  const [summary, setSummary] = useState<{
    participants: { good: number; evil: number }
    pairCount: number
    trials: Record<string, number>
    eventsTotal: number
    eventsToday: number
    karma: { good: number; evil: number }
  } | null>(null)

  useEffect(() => {
    const loadTasks = async () => {
      setLoading(true)
      try {
        const [goodRes, evilRes] = await Promise.all([
          fetch('/api/tasks?type=good&includeInactive=true'),
          fetch('/api/tasks?type=evil&includeInactive=true')
        ])

        const goodData = await goodRes.json()
        const evilData = await evilRes.json()

        setGoodTasks(mapTasksForState(goodData.tasks || []))
        setEvilTasks(mapTasksForState(evilData.tasks || []))
      } catch (error) {
        console.error('Failed to load tasks', error)
        toast.error('Failed to load tasks')
      } finally {
        setLoading(false)
      }
    }

    loadTasks()
  }, [toast])

  const refreshTasks = async () => {
    try {
      const [goodRes, evilRes] = await Promise.all([
        fetch('/api/tasks?type=good&includeInactive=true'),
        fetch('/api/tasks?type=evil&includeInactive=true')
      ])
      const goodData = await goodRes.json()
      const evilData = await evilRes.json()
      setGoodTasks(mapTasksForState(goodData.tasks || []))
      setEvilTasks(mapTasksForState(evilData.tasks || []))
    } catch (error) {
      console.error('Failed to refresh tasks', error)
      toast.error('Failed to refresh tasks')
    }
  }

  const fetchCycleStatus = useCallback(async () => {
    setLoadingCycle(true)
    try {
      const response = await fetch('/api/duality/cycle')
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        toast.error(data.error || 'Failed to load Duality cycle')
        setCycleData(null)
        return
      }
      const data = await response.json()
      setCycleData({
        cycle: data.cycle,
        participants: data.participants || [],
        pairs: data.pairs || [],
        trials: data.trials || [],
        events: data.events || []
      })
      const defaultPairId = data.pairs?.[0]?.id || ''
      const defaultParticipantId = data.participants?.[0]?.id || ''
      setEventForm((prev) => ({
        ...prev,
        pairId: prev.pairId || defaultPairId
      }))
      setTrialForm((prev) => ({
        ...prev,
        participantId: prev.participantId || defaultParticipantId
      }))
    setEffectForm((prev) => ({
      ...prev,
      effect: data.cycle?.activeEffect || '',
      statusOverride: ''
    }))
    } catch (error) {
      console.error('Failed to fetch Duality cycle', error)
      toast.error('Failed to load Duality cycle')
      setCycleData(null)
    } finally {
      setLoadingCycle(false)
    }
  }, [toast])

  useEffect(() => {
    fetchCycleStatus()
  }, [fetchCycleStatus])

  const fetchSummary = useCallback(async () => {
    try {
      const response = await fetch('/api/duality/summary')
      if (!response.ok) return
      const data = await response.json()
      if (data.metrics) {
        setSummary(data.metrics)
      }
    } catch (error) {
      console.error('Failed to fetch Duality summary', error)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const handleStartCycle = async () => {
    setStartingCycle(true)
    try {
      const response = await fetch('/api/duality/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        toast.error(data.error || 'Failed to start Duality cycle')
        return
      }

      toast.success('New Duality cycle started')
      await fetchCycleStatus()
    } catch (error) {
      console.error('Failed to start cycle', error)
      toast.error('Failed to start cycle')
    } finally {
      setStartingCycle(false)
    }
  }

  const handleGeneratePairings = async () => {
    setPairingCycle(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (ADMIN_HEADER_TOKEN) {
        headers['x-admin-token'] = ADMIN_HEADER_TOKEN
      }

      const response = await fetch('/api/duality/pairings', {
        method: 'POST',
        headers
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        toast.error(data.error || 'Failed to generate pairings')
        return
      }

      toast.success('Pairings generated')
      await fetchCycleStatus()
    } catch (error) {
      console.error('Failed to generate pairings', error)
      toast.error('Failed to generate pairings')
    } finally {
      setPairingCycle(false)
    }
  }

  const currentCycle = cycleData?.cycle ?? null
  const cycleParticipants = cycleData?.participants ?? []
  const cyclePairs = cycleData?.pairs ?? []
  const cycleTrials = cycleData?.trials ?? []
  const cycleEvents = cycleData?.events ?? []
  const goodCount = cycleParticipants.filter((p) => p.alignment === 'good').length
  const evilCount = cycleParticipants.filter((p) => p.alignment === 'evil').length
  const alignmentBalanced = goodCount === evilCount

  const handleEventFieldChange = (field: keyof EventFormState, value: string) => {
    setEventForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleTrialFieldChange = (field: keyof TrialFormState, value: string) => {
    setTrialForm((prev) => ({ ...prev, [field]: value }))
  }

  const toISOStringLocal = (value: string) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
  }

  const handleEffectFieldChange = (field: 'effect' | 'durationHours' | 'statusOverride', value: string) => {
    setEffectForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmitEvent = async () => {
    if (!eventForm.pairId || !eventForm.eventType) {
      toast.warning('Select a pair and event type before posting an event')
      return
    }
    setSubmittingEvent(true)
    try {
      const payload: Record<string, any> = {
        pairId: eventForm.pairId,
        eventType: eventForm.eventType.trim()
      }
      if (eventForm.result) payload.result = eventForm.result.trim()
      if (eventForm.karmaDeltaGood !== '') payload.karmaDeltaGood = Number(eventForm.karmaDeltaGood)
      if (eventForm.karmaDeltaEvil !== '') payload.karmaDeltaEvil = Number(eventForm.karmaDeltaEvil)
      if (eventForm.fateMeter !== '') payload.fateMeter = Number(eventForm.fateMeter)

      const response = await fetch('/api/duality/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Failed to record event')
        return
      }

      toast.success('Duality event recorded')
      setEventForm((prev) => ({ ...prev, eventType: '', result: '', karmaDeltaGood: '', karmaDeltaEvil: '', fateMeter: '' }))
      await fetchCycleStatus()
    } catch (error) {
      console.error('Failed to submit duality event', error)
      toast.error('Failed to record event')
    } finally {
      setSubmittingEvent(false)
    }
  }

  const handleScheduleTrial = async () => {
    if (!trialForm.participantId || !trialForm.scheduledAt || !trialForm.voteEndsAt) {
      toast.warning('Select participant and enter schedule times for the trial')
      return
    }
    const scheduledIso = toISOStringLocal(trialForm.scheduledAt)
    const endsIso = toISOStringLocal(trialForm.voteEndsAt)
    if (!scheduledIso || !endsIso) {
      toast.error('Invalid date values for trial scheduling')
      return
    }
    setSchedulingTrial(true)
    try {
      const response = await fetch('/api/duality/trials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: trialForm.participantId,
          scheduledAt: scheduledIso,
          voteEndsAt: endsIso
        })
      })

      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Failed to schedule trial')
        return
      }

      toast.success('Trial scheduled')
      await fetchCycleStatus()
    } catch (error) {
      console.error('Failed to schedule trial', error)
      toast.error('Failed to schedule trial')
    } finally {
      setSchedulingTrial(false)
    }
  }

  const handleApplyEffect = async () => {
    if (!currentCycle) {
      toast.error('No active cycle to update')
      return
    }

    const payload: Record<string, any> = {}

    if (effectForm.effect !== undefined) {
      if (!effectForm.effect) {
        payload.activeEffect = null
        payload.clearEffectExpiry = true
      } else {
        payload.activeEffect = effectForm.effect
      }
    }

    if (effectForm.durationHours) {
      const hours = Number(effectForm.durationHours)
      if (!Number.isNaN(hours) && hours > 0) {
        payload.effectDurationHours = hours
      }
    }

    if (effectForm.statusOverride) {
      payload.status = effectForm.statusOverride
    }

    if (Object.keys(payload).length === 0) {
      toast.warning('Select an effect or status update before applying changes')
      return
    }

    try {
      const response = await fetch('/api/duality/cycle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Failed to update cycle')
        return
      }

      toast.success('Cycle updated')
      await fetchCycleStatus()
    } catch (error) {
      console.error('Failed to update cycle', error)
      toast.error('Failed to update cycle')
    }
  }

  const handleTaskFieldChange = (
    type: 'good' | 'evil',
    id: string,
    field: keyof AdminTask,
    value: any
  ) => {
    const updater = type === 'good' ? setGoodTasks : setEvilTasks

    updater((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              [field]: field === 'points' ? Number(value) : value
            }
          : task
      )
    )
  }

  const handleSaveTask = async (task: AdminTask) => {
    setSavingTaskId(task.id)
    try {
      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          title: task.title,
          description: task.description,
          type: task.type,
          points: task.points,
          category: task.category,
          isActive: task.is_active,
          proofRequired: task.proof_required,
          requiredPlatform: serializePlatform(task.required_platform)
        })
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || 'Failed to save task')
        return
      }

      toast.success('Task updated')
      await refreshTasks()
    } catch (error) {
      console.error('Failed to save task', error)
      toast.error('Failed to save task')
    } finally {
      setSavingTaskId(null)
    }
  }

  const handleDeleteTask = async (task: AdminTask) => {
    if (!confirm(`Delete task "${task.title}"?`)) return
    setDeletingTaskId(task.id)
    try {
      const response = await fetch(`/api/tasks?id=${task.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || 'Failed to delete task')
        return
      }

      toast.success('Task deleted')
      await refreshTasks()
    } catch (error) {
      console.error('Failed to delete task', error)
      toast.error('Failed to delete task')
    } finally {
      setDeletingTaskId(null)
    }
  }

  const handleToggleTaskActive = async (task: AdminTask) => {
    const updated = { ...task, is_active: !task.is_active }
    handleTaskFieldChange(task.type, task.id, 'is_active', updated.is_active)
    await handleSaveTask(updated)
  }

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) {
      toast.warning('Title is required')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description,
          type: newTask.type,
          points: newTask.points,
          category: newTask.category,
          proofRequired: newTask.proof_required,
          requiredPlatform: serializePlatform(newTask.required_platform),
          createdBy: 'admin'
        })
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || 'Failed to create task')
        return
      }

      toast.success('Task created')
      setNewTask({ ...emptyTask, type: newTask.type })
      await refreshTasks()
    } catch (error) {
      console.error('Failed to create task', error)
      toast.error('Failed to create task')
    } finally {
      setCreating(false)
    }
  }

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId))
  }

  const renderTaskTable = (tasks: AdminTask[], type: 'good' | 'evil') => (
    <div className="overflow-x-auto bg-black/40 border border-red-600/30 rounded-lg">
      <table className="w-full text-sm font-mono">
        <thead className="bg-black/70 border-b border-red-600/40">
          <tr>
            <th className="px-4 py-3 text-left text-red-500 uppercase text-xs">Quest</th>
            <th className="px-4 py-3 text-left text-red-500 uppercase text-xs">Points</th>
            <th className="px-4 py-3 text-left text-red-500 uppercase text-xs">Category</th>
            <th className="px-4 py-3 text-left text-red-500 uppercase text-xs">Proof</th>
            <th className="px-4 py-3 text-left text-red-500 uppercase text-xs">Platform</th>
            <th className="px-4 py-3 text-left text-red-500 uppercase text-xs">Status</th>
            <th className="px-4 py-3 text-right text-red-500 uppercase text-xs">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const expanded = expandedTaskId === task.id
            return (
              <>
                <tr
                  key={task.id}
                  className={`border-b border-red-600/20 ${expanded ? 'bg-black/60' : 'hover:bg-black/50'} transition-colors`}
                >
                  <td className="px-4 py-3 flex items-center gap-2">
                    <button
                      onClick={() => toggleTaskExpansion(task.id)}
                      className="px-2 py-1 border border-red-600/50 rounded text-xs text-red-400 hover:bg-red-600/20"
                      aria-expanded={expanded}
                    >
                      {expanded ? 'Hide' : 'Edit'}
                    </button>
                    <span className="font-bold text-white">{task.title}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-200">{task.points}</td>
                  <td className="px-4 py-3 text-gray-400">{task.category || '—'}</td>
                  <td className="px-4 py-3">
                    {task.proof_required ? (
                      <span className="px-3 py-1 rounded border border-yellow-600/60 text-yellow-400 text-xs uppercase">Required</span>
                    ) : (
                      <span className="px-3 py-1 rounded border border-gray-600/40 text-gray-400 text-xs uppercase">Optional</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{formatPlatform(task.required_platform)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-3 py-1 rounded text-xs uppercase ${
                        task.is_active
                          ? 'bg-green-600/20 text-green-400 border border-green-600/50'
                          : 'bg-gray-700/40 text-gray-300 border border-gray-600/50'
                      }`}
                    >
                      {task.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggleTaskActive(task)}
                      className="px-3 py-1 border border-yellow-600/60 text-yellow-400 rounded text-xs uppercase hover:bg-yellow-600/10 mr-2"
                    >
                      {task.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task)}
                      disabled={deletingTaskId === task.id}
                      className="px-3 py-1 border border-red-700 text-red-400 rounded text-xs uppercase hover:bg-red-700/20 disabled:opacity-50"
                    >
                      {deletingTaskId === task.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr key={`${task.id}-detail`} className="border-b border-red-600/10 bg-black/70">
                    <td colSpan={7} className="px-6 py-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-mono text-gray-400 mb-1">Title</label>
                          <input
                            value={task.title}
                            onChange={(e) => handleTaskFieldChange(type, task.id, 'title', e.target.value)}
                            className="w-full bg-black/40 border border-red-600/40 rounded px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-gray-400 mb-1">Points</label>
                          <input
                            type="number"
                            value={task.points}
                            onChange={(e) => handleTaskFieldChange(type, task.id, 'points', e.target.value)}
                            className="w-full bg-black/40 border border-red-600/40 rounded px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-gray-400 mb-1">Category</label>
                          <input
                            value={task.category || ''}
                            onChange={(e) => handleTaskFieldChange(type, task.id, 'category', e.target.value)}
                            className="w-full bg-black/40 border border-red-600/40 rounded px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-gray-400 mb-1">Required Platform</label>
                          <select
                            value={task.required_platform}
                            onChange={(e) => handleTaskFieldChange(type, task.id, 'required_platform', e.target.value as PlatformOption)}
                            className="w-full bg-black/40 border border-red-600/40 rounded px-3 py-2 text-sm"
                          >
                            {PLATFORM_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {formatPlatform(option)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-gray-400 mb-1">Proof Required</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={task.proof_required}
                              onChange={(e) => handleTaskFieldChange(type, task.id, 'proof_required', e.target.checked)}
                              className="h-4 w-4"
                            />
                            <span className="text-xs text-gray-400">Requires image/video proof</span>
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-mono text-gray-400 mb-1">Description</label>
                          <textarea
                            value={task.description || ''}
                            onChange={(e) => handleTaskFieldChange(type, task.id, 'description', e.target.value)}
                            className="w-full bg-black/40 border border-red-600/40 rounded px-3 py-2 text-sm h-24"
                          />
                        </div>
                        <div className="md:col-span-2 flex justify-end gap-3">
                          <button
                            onClick={() => handleSaveTask(task)}
                            disabled={savingTaskId === task.id}
                            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs uppercase disabled:opacity-50"
                          >
                            {savingTaskId === task.id ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button
                            onClick={() => toggleTaskExpansion(task.id)}
                            className="px-5 py-2 border border-gray-600 text-gray-300 rounded text-xs uppercase hover:bg-gray-700/30"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-10">
        <header>
          <h1 className="text-3xl font-bold text-red-600 mb-2 font-mono">Morality Quest Admin</h1>
          <p className="text-sm text-gray-400 font-mono">
            Manage the good and evil morality quests shown on the dashboard. Adjust point values, toggle proof requirements, and configure social platform prerequisites.
            (Gate this page behind admin authentication before production use.)
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-blue-400 font-mono mb-4">Duality Cycle</h2>
          {loadingCycle ? (
            <div className="text-gray-500 font-mono">Loading cycle data...</div>
          ) : currentCycle ? (
            <div className="bg-black/60 border border-blue-500/40 rounded-lg p-6 space-y-5">
              {summary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
                  <div className="bg-black/40 border border-blue-500/30 rounded p-3">
                    <div className="text-blue-300 uppercase mb-1">Participants</div>
                    <div className="text-gray-200">Good: {summary.participants.good}</div>
                    <div className="text-gray-200">Evil: {summary.participants.evil}</div>
                  </div>
                  <div className="bg-black/40 border border-purple-500/30 rounded p-3">
                    <div className="text-purple-300 uppercase mb-1">Trials</div>
                    <div className="text-gray-200">Scheduled: {summary.trials.scheduled || 0}</div>
                    <div className="text-gray-200">Voting: {summary.trials.voting || 0}</div>
                    <div className="text-gray-200">Resolved: {summary.trials.resolved || 0}</div>
                  </div>
                  <div className="bg-black/40 border border-green-500/30 rounded p-3">
                    <div className="text-green-300 uppercase mb-1">Karma Delta</div>
                    <div className="text-gray-200">Good: {summary.karma.good}</div>
                    <div className="text-gray-200">Evil: {summary.karma.evil}</div>
                  </div>
                  <div className="bg-black/40 border border-cyan-500/30 rounded p-3">
                    <div className="text-cyan-300 uppercase mb-1">Events</div>
                    <div className="text-gray-200">Total: {summary.eventsTotal}</div>
                    <div className="text-gray-200">Today: {summary.eventsToday}</div>
                    <div className="text-gray-200">Pairs: {summary.pairCount}</div>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <span
                  className={`px-3 py-1 rounded text-xs uppercase font-bold ${
                    currentCycle.status === 'alignment'
                      ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/40'
                      : currentCycle.status === 'active'
                      ? 'bg-green-600/20 text-green-400 border border-green-600/40'
                      : currentCycle.status === 'trial'
                      ? 'bg-purple-600/20 text-purple-400 border border-purple-600/40'
                      : currentCycle.status === 'completed'
                      ? 'bg-gray-700/40 text-gray-300 border border-gray-600/50'
                      : 'bg-blue-600/20 text-blue-300 border border-blue-600/40'
                  }`}
                >
                  {currentCycle.status.toUpperCase()}
                </span>
                <div className="text-sm text-gray-300 font-mono">
                  Week: {currentCycle.weekStart} → {currentCycle.weekEnd}
                </div>
                <div className="text-sm text-gray-300 font-mono">
                  Participants: {goodCount} Good / {evilCount} Evil
                </div>
                {currentCycle.activeEffect && (
                  <div className="text-sm text-cyan-300 font-mono">
                    Effect: {currentCycle.activeEffect}
                    {currentCycle.effectExpiresAt && ` (until ${new Date(currentCycle.effectExpiresAt).toLocaleString()})`}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleStartCycle}
                  disabled={startingCycle || currentCycle.status !== 'completed'}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs uppercase disabled:opacity-40"
                >
                  {startingCycle ? 'Starting...' : currentCycle.status === 'completed' ? 'Start New Cycle' : 'New Cycle'}
                </button>
                {currentCycle.status === 'alignment' && (
                  <button
                    onClick={handleGeneratePairings}
                    disabled={pairingCycle || goodCount === 0 || evilCount === 0 || !alignmentBalanced}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs uppercase disabled:opacity-40"
                  >
                    {pairingCycle ? 'Pairing...' : alignmentBalanced ? 'Generate Pairings' : 'Await Balance'}
                  </button>
                )}
                {currentCycle.status !== 'completed' && (
                  <button
                    onClick={fetchCycleStatus}
                    className="px-4 py-2 border border-gray-600 text-gray-300 rounded text-xs uppercase hover:bg-gray-700/30"
                  >
                    Refresh
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-black/40 border border-blue-500/30 rounded p-4">
                  <div className="text-sm text-blue-300 font-mono mb-2">Participants</div>
                  {cycleParticipants.length === 0 ? (
                    <div className="text-xs text-gray-500 font-mono">No participants yet.</div>
                  ) : (
                    <div className="max-h-48 overflow-auto">
                      <table className="w-full text-xs font-mono">
                        <thead className="text-blue-400">
                          <tr>
                            <th className="text-left pb-1">Holder</th>
                            <th className="text-left pb-1">Align</th>
                            <th className="text-right pb-1">Net Karma</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cycleParticipants.map((p) => (
                            <tr key={p.id} className="border-t border-blue-500/10">
                              <td className="py-1 text-gray-200">{p.username || p.walletAddress || p.profileId.slice(0, 6)}</td>
                              <td className="py-1 text-gray-400">{p.alignment.toUpperCase()}</td>
                              <td className="py-1 text-right text-gray-300">{p.netKarma ?? p.karmaSnapshot ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="bg-black/40 border border-purple-500/30 rounded p-4">
                  <div className="text-sm text-purple-300 font-mono mb-2">Pairs</div>
                  {cyclePairs.length === 0 ? (
                    <div className="text-xs text-gray-500 font-mono">No pairings yet.</div>
                  ) : (
                    <div className="max-h-48 overflow-auto">
                      <table className="w-full text-xs font-mono">
                        <thead className="text-purple-400">
                          <tr>
                            <th className="text-left pb-1">Good</th>
                            <th className="text-left pb-1">Evil</th>
                            <th className="text-right pb-1">Fate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cyclePairs.map((pair) => (
                            <tr key={pair.id} className="border-t border-purple-500/10">
                              <td className="py-1 text-green-300">{pair.goodUsername || pair.goodWalletAddress || pair.goodParticipantId.slice(0, 6)}</td>
                              <td className="py-1 text-red-300">{pair.evilUsername || pair.evilWalletAddress || pair.evilParticipantId.slice(0, 6)}</td>
                              <td className="py-1 text-right text-gray-300">{pair.fateMeter}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-black/40 border border-emerald-500/30 rounded p-4">
                <div className="text-sm text-emerald-300 font-mono mb-2">Trials</div>
                {cycleTrials.length === 0 ? (
                  <div className="text-xs text-gray-500 font-mono">No trials scheduled.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead className="text-emerald-300">
                        <tr>
                          <th className="text-left pb-1">Holder</th>
                          <th className="text-left pb-1">Status</th>
                          <th className="text-left pb-1">Verdict</th>
                          <th className="text-left pb-1">Starts</th>
                          <th className="text-left pb-1">Ends</th>
                          <th className="text-right pb-1">Votes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cycleTrials.map((trial) => (
                          <tr key={trial.id} className="border-t border-emerald-500/10">
                            <td className="py-2 text-gray-200">
                              {trial.username || trial.walletAddress || trial.id.slice(0, 6)}
                              <span className="text-xs text-gray-500 ml-2">({trial.alignment})</span>
                            </td>
                            <td className="py-2 text-gray-300 uppercase">{trial.status}</td>
                            <td className="py-2 text-gray-400">
                              {trial.verdict ? trial.verdict.toUpperCase() : '—'}
                            </td>
                            <td className="py-2 text-gray-400">
                              {new Date(trial.scheduledAt).toLocaleString()}
                            </td>
                            <td className="py-2 text-gray-400">
                              {new Date(trial.voteEndsAt).toLocaleString()}
                            </td>
                            <td className="py-2 text-right text-gray-300">
                              {trial.votesAbsolve} ⚪ / {trial.votesCondemn} 🔴
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-black/40 border border-blue-500/30 rounded p-4">
                <div className="text-sm text-blue-300 font-mono mb-2">Recent Events</div>
                {cycleEvents.length === 0 ? (
                  <div className="text-xs text-gray-500 font-mono">No events logged yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead className="text-blue-300">
                        <tr>
                          <th className="text-left pb-1">Day</th>
                          <th className="text-left pb-1">Event</th>
                          <th className="text-left pb-1">Pair</th>
                          <th className="text-left pb-1">Result</th>
                          <th className="text-right pb-1">Karma</th>
                          <th className="text-left pb-1">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cycleEvents.slice(0, 12).map((event) => {
                          const pair = cyclePairs.find((p) => p.id === event.pairId)
                          return (
                            <tr key={event.id} className="border-t border-blue-500/10">
                              <td className="py-2 text-gray-400">{event.cycleDay ?? '-'}</td>
                              <td className="py-2 text-gray-200 uppercase">{event.eventType}</td>
                              <td className="py-2 text-gray-300">
                                {pair
                                  ? `${pair.goodUsername || pair.goodWalletAddress || 'Good'} / ${pair.evilUsername || pair.evilWalletAddress || 'Evil'}`
                                  : event.pairId.slice(0, 6)}
                              </td>
                              <td className="py-2 text-gray-400">
                                {truncateText(event.result)}
                              </td>
                              <td className="py-2 text-right text-gray-300">
                                {formatKarmaText(event.karmaDeltaGood, event.karmaDeltaEvil)}
                              </td>
                              <td className="py-2 text-gray-500">
                                {new Date(event.occurredAt).toLocaleString()}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-black/40 border border-cyan-500/30 rounded p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-sm text-cyan-300 font-mono uppercase">Global Effect & Cycle Status</div>
                  <span className="text-xs text-gray-500 font-mono">Quick controls for RNG events</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="block text-xs text-gray-400 font-mono uppercase">Global Effect</label>
                    <select
                      value={effectForm.effect}
                      onChange={(e) => handleEffectFieldChange('effect', e.target.value)}
                      className="w-full bg-black/50 border border-cyan-500/40 rounded px-3 py-2 text-sm font-mono"
                    >
                      {GLOBAL_EFFECT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs text-gray-400 font-mono uppercase">Duration (hours)</label>
                    <input
                      type="number"
                      min="1"
                      value={effectForm.durationHours}
                      onChange={(e) => handleEffectFieldChange('durationHours', e.target.value)}
                      className="w-full bg-black/50 border border-cyan-500/40 rounded px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs text-gray-400 font-mono uppercase">Cycle Status</label>
                    <select
                      value={effectForm.statusOverride}
                      onChange={(e) => handleEffectFieldChange('statusOverride', e.target.value)}
                      className="w-full bg-black/50 border border-cyan-500/40 rounded px-3 py-2 text-sm font-mono"
                    >
                      <option value="">Keep current</option>
                      <option value="alignment">Alignment</option>
                      <option value="active">Active</option>
                      <option value="trial">Trial</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleApplyEffect}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-xs uppercase"
                  >
                    Apply Changes
                  </button>
                  <button
                    onClick={() => {
                      setEffectForm({ effect: '', durationHours: '12', statusOverride: '' })
                    }}
                    className="px-4 py-2 border border-gray-600 text-gray-300 rounded text-xs uppercase hover:bg-gray-700/30"
                  >
                    Reset Form
                  </button>
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  Active effect: {currentCycle.activeEffect ? (
                    <span className="text-cyan-200">{currentCycle.activeEffect}</span>
                  ) : (
                    <span className="text-gray-400">None</span>
                  )}{' '}
                  {currentCycle.effectExpiresAt && (
                    <span className="text-gray-400">
                      • ends {new Date(currentCycle.effectExpiresAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-black/40 border border-blue-500/30 rounded p-4 space-y-4">
                  <div className="text-sm text-blue-300 font-mono uppercase">Post Daily Event</div>
                  <div className="text-xs text-gray-500 font-mono">
                    Use this form to log manual event outcomes (temporary until automation is live).
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs text-gray-400 font-mono uppercase">Pair</label>
                    <select
                      value={eventForm.pairId}
                      onChange={(e) => handleEventFieldChange('pairId', e.target.value)}
                      className="w-full bg-black/50 border border-blue-500/40 rounded px-3 py-2 text-sm font-mono"
                    >
                      <option value="">Select pair…</option>
                      {cyclePairs.map((pair) => (
                        <option key={pair.id} value={pair.id}>
                          {pair.id.slice(0, 8)}… fate {pair.fateMeter ?? 50}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs text-gray-400 font-mono uppercase">Event Type</label>
                    <input
                      value={eventForm.eventType}
                      onChange={(e) => handleEventFieldChange('eventType', e.target.value)}
                      placeholder="Blessing, Temptation, Fate Roll…"
                      className="w-full bg-black/50 border border-blue-500/40 rounded px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs text-gray-400 font-mono uppercase">Result / Notes</label>
                    <textarea
                      value={eventForm.result}
                      onChange={(e) => handleEventFieldChange('result', e.target.value)}
                      className="w-full bg-black/50 border border-blue-500/40 rounded px-3 py-2 text-sm font-mono h-20"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm font-mono">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase mb-1">+Good Karma</label>
                      <input
                        type="number"
                        value={eventForm.karmaDeltaGood}
                        onChange={(e) => handleEventFieldChange('karmaDeltaGood', e.target.value)}
                        className="w-full bg-black/50 border border-blue-500/40 rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 uppercase mb-1">+/- Evil Karma</label>
                      <input
                        type="number"
                        value={eventForm.karmaDeltaEvil}
                        onChange={(e) => handleEventFieldChange('karmaDeltaEvil', e.target.value)}
                        className="w-full bg-black/50 border border-blue-500/40 rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 uppercase mb-1">Fate Meter</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={eventForm.fateMeter}
                        onChange={(e) => handleEventFieldChange('fateMeter', e.target.value)}
                        className="w-full bg-black/50 border border-blue-500/40 rounded px-3 py-2"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleSubmitEvent}
                    disabled={submittingEvent}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs uppercase disabled:opacity-50"
                  >
                    {submittingEvent ? 'Posting…' : 'Record Event'}
                  </button>
                </div>
                <div className="bg-black/40 border border-purple-500/30 rounded p-4 space-y-4">
                  <div className="text-sm text-purple-300 font-mono uppercase">Schedule Trial</div>
                  <div className="text-xs text-gray-500 font-mono">
                    Pick an eligible holder and specify start/vote end (UTC). Discord automation will be added later.
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs text-gray-400 font-mono uppercase">Participant</label>
                    <select
                      value={trialForm.participantId}
                      onChange={(e) => handleTrialFieldChange('participantId', e.target.value)}
                      className="w-full bg-black/50 border border-purple-500/40 rounded px-3 py-2 text-sm font-mono"
                    >
                      <option value="">Select participant…</option>
                      {cycleParticipants.map((participant) => (
                        <option key={participant.id} value={participant.id}>
                          {participant.username || participant.walletAddress || participant.id.slice(0, 6)} — {participant.alignment}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs text-gray-400 font-mono uppercase">Trial Starts</label>
                    <input
                      type="datetime-local"
                      value={trialForm.scheduledAt}
                      onChange={(e) => handleTrialFieldChange('scheduledAt', e.target.value)}
                      className="w-full bg-black/50 border border-purple-500/40 rounded px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs text-gray-400 font-mono uppercase">Voting Ends</label>
                    <input
                      type="datetime-local"
                      value={trialForm.voteEndsAt}
                      onChange={(e) => handleTrialFieldChange('voteEndsAt', e.target.value)}
                      className="w-full bg-black/50 border border-purple-500/40 rounded px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <button
                    onClick={handleScheduleTrial}
                    disabled={schedulingTrial}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs uppercase disabled:opacity-50"
                  >
                    {schedulingTrial ? 'Scheduling…' : 'Schedule Trial'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-black/60 border border-blue-500/30 rounded-lg p-6 flex flex-col gap-3">
              <div className="text-sm text-gray-400 font-mono">
                No Duality cycle is active. Start a new cycle to begin the weekly karma game.
              </div>
              <button
                onClick={handleStartCycle}
                disabled={startingCycle}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs uppercase disabled:opacity-40"
              >
                {startingCycle ? 'Starting...' : 'Start Cycle'}
              </button>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl font-bold text-green-500 font-mono mb-4">Good Karma Quests</h2>
          {loading ? <div className="text-gray-500 font-mono">Loading tasks...</div> : renderTaskTable(goodTasks, 'good')}
        </section>

        <section>
          <h2 className="text-xl font-bold text-red-500 font-mono mb-4">Evil Karma Quests</h2>
          {loading ? <div className="text-gray-500 font-mono">Loading tasks...</div> : renderTaskTable(evilTasks, 'evil')}
        </section>

        <section>
          <h2 className="text-xl font-bold text-yellow-400 font-mono mb-4">Create New Quest</h2>
          <div className="bg-black/60 border border-yellow-500/40 rounded-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1">Title</label>
              <input
                value={newTask.title}
                onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full bg-black/40 border border-yellow-500/40 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1">Type</label>
              <select
                value={newTask.type}
                onChange={(e) => setNewTask((prev) => ({ ...prev, type: e.target.value as 'good' | 'evil' }))}
                className="w-full bg-black/40 border border-yellow-500/40 rounded px-3 py-2 text-sm"
              >
                <option value="good">Good</option>
                <option value="evil">Evil</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1">Points</label>
              <input
                type="number"
                value={newTask.points}
                onChange={(e) => setNewTask((prev) => ({ ...prev, points: Number(e.target.value) }))}
                className="w-full bg-black/40 border border-yellow-500/40 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1">Category</label>
              <input
                value={newTask.category || ''}
                onChange={(e) => setNewTask((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full bg-black/40 border border-yellow-500/40 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1">Required Platform</label>
              <select
                value={newTask.required_platform}
                onChange={(e) => setNewTask((prev) => ({ ...prev, required_platform: e.target.value as PlatformOption }))}
                className="w-full bg-black/40 border border-yellow-500/40 rounded px-3 py-2 text-sm"
              >
                {PLATFORM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatPlatform(option)}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-mono text-gray-400 mb-1">Description</label>
              <textarea
                value={newTask.description || ''}
                onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full bg-black/40 border border-yellow-500/40 rounded px-3 py-2 text-sm h-20"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <input
                type="checkbox"
                checked={newTask.proof_required}
                onChange={(e) => setNewTask((prev) => ({ ...prev, proof_required: e.target.checked }))}
                className="h-4 w-4"
              />
              <span className="text-xs text-gray-400">Requires proof upload (image/video)</span>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button
                onClick={handleCreateTask}
                disabled={creating}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-xs uppercase disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Quest'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

