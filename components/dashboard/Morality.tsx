'use client'

import { useState, useEffect, useRef, ChangeEvent, useCallback } from 'react'
import { useToast } from '@/components/Toast'

interface KarmaTask {
  id: string
  title: string
  description: string | null
  type: 'good' | 'bad'
  points: number
  category: string | null
  isCompleted?: boolean
  proof_required?: boolean
  required_platform?: string | null
}

interface MoralityProps {
  walletAddress: string | null
  chosenSide: 'good' | 'evil'
  filterPlatforms?: string[]
  limit?: number
  compact?: boolean
  disabled?: boolean
}

export default function Morality({ walletAddress, chosenSide, filterPlatforms, limit, compact = false, disabled = false }: MoralityProps) {
  const toast = useToast()
  const [tasks, setTasks] = useState<KarmaTask[]>([])
  const [loading, setLoading] = useState(true)
  const [completingTask, setCompletingTask] = useState<string | null>(null)
  const [taskRequiringProof, setTaskRequiringProof] = useState<KarmaTask | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const formatPlatformRequirement = (platform?: string | null) => {
    if (!platform || platform === 'none') return null
    return platform.charAt(0).toUpperCase() + platform.slice(1)
  }

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const includeCompleted = walletAddress ? 'true' : 'false'
      const walletParam = walletAddress ? `&walletAddress=${encodeURIComponent(walletAddress)}` : ''
      const taskType = chosenSide === 'evil' ? 'bad' : 'good'
      
      // Only fetch tasks for the chosen side
      const response = await fetch(`/api/tasks?type=${taskType}&includeCompleted=${includeCompleted}${walletParam}`)
      const data = await response.json()
      
      setTasks(data.tasks || [])
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }, [walletAddress, chosenSide])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const handleCompleteTask = async (task: KarmaTask, proofUrl?: string) => {
    if (!walletAddress) {
      toast.warning('Please connect your wallet to complete tasks')
      return
    }

    if (disabled) {
      toast.warning('Link the required social account to complete this task')
      return
    }

    if (completingTask && completingTask !== task.id) return // Prevent double-click

    if (task.proof_required && !proofUrl) {
      setTaskRequiringProof(task)
      // trigger file picker
      fileInputRef.current?.click()
      return
    }

    setCompletingTask(task.id)
    try {
      const response = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          taskId: task.id,
          proof: proofUrl || null
        })
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to complete task')
        return
      }

      // Refresh tasks to show completion
      await fetchTasks()
      toast.success(`Task completed! You earned ${Math.abs(data.karmaAwarded)} ${data.karmaAwarded > 0 ? 'good' : 'bad'} karma points!`)
    } catch (error) {
      console.error('Error completing task:', error)
      toast.error('Failed to complete task')
    } finally {
      setCompletingTask(null)
      setTaskRequiringProof(null)
    }
  }

  const handleProofSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !taskRequiringProof) {
      setTaskRequiringProof(null)
      event.target.value = ''
      return
    }

    setUploadingProof(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const uploadResponse = await fetch('/api/uploads/proof', {
        method: 'POST',
        body: formData
      })

      const uploadData = await uploadResponse.json()

      if (!uploadResponse.ok || !uploadData.success || !uploadData.url) {
        toast.error(uploadData.error || 'Failed to upload proof')
        return
      }

      await handleCompleteTask(taskRequiringProof, uploadData.url)
    } catch (error) {
      console.error('Proof upload error:', error)
      toast.error('Failed to upload proof')
    } finally {
      setUploadingProof(false)
      setTaskRequiringProof(null)
      if (event.target) {
        event.target.value = ''
      }
    }
  }

  const normalizedFilters = filterPlatforms?.map((platform) => platform.toLowerCase())
  const filteredTasks = normalizedFilters?.length
    ? tasks.filter((task) => normalizedFilters.includes((task.required_platform || '').toLowerCase()))
    : tasks

  const displayedTasks = limit ? filteredTasks.slice(0, limit) : filteredTasks
  const gridClass = compact
    ? 'grid grid-cols-1 gap-4'
    : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'

  const emptyStateMessage = normalizedFilters?.length
    ? 'No matching tasks available right now.'
    : `No ${chosenSide === 'good' ? 'good' : 'evil'} tasks available`

  return (
    <div className="space-y-6">

      {loading ? (
        <div className="text-center py-12">
          <div className="text-red-600 font-mono text-lg animate-pulse">Loading tasks...</div>
        </div>
      ) : displayedTasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 font-mono text-lg">{emptyStateMessage}</div>
        </div>
      ) : (
        <div className={gridClass}>
          {displayedTasks.map((task) => (
            <div
              key={task.id}
              className={`bg-black/60 backdrop-blur-sm border rounded-lg p-6 transition-all ${
                task.isCompleted
                  ? 'border-gray-600/50 opacity-60'
                  : chosenSide === 'good'
                  ? 'border-green-600/50 hover:border-green-600'
                  : 'border-red-600/50 hover:border-red-600'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-bold font-mono mb-2">
                    <span className={chosenSide === 'good' ? 'text-green-500' : 'text-red-500'}>
                      {task.title}
                    </span>
                  </h3>
                  {task.category && (
                    <span className="text-xs text-gray-500 font-mono uppercase mb-2 block">
                      {task.category}
                    </span>
                  )}
                    {task.proof_required && (
                      <span className="inline-flex items-center gap-2 text-xs text-yellow-400 font-mono uppercase">
                        <span className="text-lg">📸</span> Proof required
                      </span>
                    )}
                    {formatPlatformRequirement(task.required_platform) && (
                      <span className="block text-xs text-blue-400 font-mono uppercase mt-1">
                        Platform: {formatPlatformRequirement(task.required_platform)}
                    </span>
                  )}
                </div>
                <div className={`px-3 py-1 rounded font-mono font-bold text-sm ${
                  chosenSide === 'good'
                    ? 'bg-green-600/20 text-green-500 border border-green-600/50'
                    : 'bg-red-600/20 text-red-500 border border-red-600/50'
                }`}>
                  {chosenSide === 'good' ? '+' : '-'}{Math.abs(task.points)}
                </div>
              </div>

              {task.description && (
                <p className="text-gray-400 text-sm font-mono mb-4">
                  {task.description}
                </p>
              )}

              {task.isCompleted ? (
                <div className="flex items-center gap-2 text-green-500 font-mono text-sm">
                  <span>✓</span>
                  <span>Completed</span>
                </div>
              ) : (
                <button
                  onClick={() => handleCompleteTask(task)}
                  disabled={completingTask === task.id || !walletAddress || uploadingProof || disabled}
                  className={`w-full px-4 py-2 rounded font-mono font-bold text-sm uppercase transition-all ${
                    completingTask === task.id
                      ? 'opacity-50 cursor-not-allowed'
                      : disabled
                      ? 'bg-gray-700 text-gray-300 border border-gray-600 cursor-not-allowed'
                      : chosenSide === 'good'
                      ? 'bg-green-600/80 hover:bg-green-600 text-white border border-green-600'
                      : 'bg-red-600/80 hover:bg-red-600 text-white border border-red-600'
                  } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {completingTask === task.id
                    ? 'Completing...'
                    : uploadingProof && taskRequiringProof?.id === task.id
                    ? 'Uploading proof...'
                    : !walletAddress
                    ? 'Connect Wallet'
                    : disabled
                    ? 'Link Discord'
                    : task.proof_required
                    ? 'Submit Proof'
                    : 'Complete Task'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!walletAddress && (
        <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6 text-center mt-6">
          <div className="text-gray-400 font-mono text-sm mb-2">
            Connect your wallet to complete tasks and earn karma points
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleProofSelected}
      />
    </div>
  )
}


