'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/components/Toast'

interface KarmaTask {
  id: string
  title: string
  description: string | null
  type: 'good' | 'bad'
  points: number
  category: string | null
  isCompleted?: boolean
}

interface MoralityProps {
  walletAddress: string | null
  chosenSide: 'good' | 'evil'
}

export default function Morality({ walletAddress, chosenSide }: MoralityProps) {
  const toast = useToast()
  const [tasks, setTasks] = useState<KarmaTask[]>([])
  const [loading, setLoading] = useState(true)
  const [completingTask, setCompletingTask] = useState<string | null>(null)

  useEffect(() => {
    fetchTasks()
  }, [walletAddress, chosenSide])

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const includeCompleted = walletAddress ? 'true' : 'false'
      const walletParam = walletAddress ? `&walletAddress=${encodeURIComponent(walletAddress)}` : ''
      
      // Only fetch tasks for the chosen side
      const response = await fetch(`/api/tasks?type=${chosenSide}&includeCompleted=${includeCompleted}${walletParam}`)
      const data = await response.json()
      
      setTasks(data.tasks || [])
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteTask = async (taskId: string) => {
    if (!walletAddress) {
      toast.warning('Please connect your wallet to complete tasks')
      return
    }

    if (completingTask) return // Prevent double-click

    setCompletingTask(taskId)
    try {
      const response = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          taskId,
          proof: null // Can be extended to include proof
        })
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to complete task')
        return
      }

      // Refresh tasks to show completion
      await fetchTasks()
      toast.success(`Task completed! You earned ${data.karmaAwarded} ${data.karmaAwarded > 0 ? 'good' : 'bad'} karma points!`)
    } catch (error) {
      console.error('Error completing task:', error)
      toast.error('Failed to complete task')
    } finally {
      setCompletingTask(null)
    }
  }

  return (
    <div className="space-y-6">

      {loading ? (
        <div className="text-center py-12">
          <div className="text-red-600 font-mono text-lg animate-pulse">Loading tasks...</div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 font-mono text-lg">No {chosenSide === 'good' ? 'good' : 'evil'} tasks available</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => (
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
                  onClick={() => handleCompleteTask(task.id)}
                  disabled={completingTask === task.id || !walletAddress}
                  className={`w-full px-4 py-2 rounded font-mono font-bold text-sm uppercase transition-all ${
                    completingTask === task.id
                      ? 'opacity-50 cursor-not-allowed'
                      : chosenSide === 'good'
                      ? 'bg-green-600/80 hover:bg-green-600 text-white border border-green-600'
                      : 'bg-red-600/80 hover:bg-red-600 text-white border border-red-600'
                  }`}
                >
                  {completingTask === task.id ? 'Completing...' : !walletAddress ? 'Connect Wallet' : 'Complete Task'}
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
    </div>
  )
}


