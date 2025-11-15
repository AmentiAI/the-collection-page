'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useWallet } from '@/lib/wallet/compatibility'
import { useToast } from '@/components/Toast'

interface ChestCalloutProps {
  eventKey: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function ChestCallout({ eventKey, size = 'md', className = '' }: ChestCalloutProps) {
  const [chestOpen, setChestOpen] = useState(false)
  const [chestTooltipVisible, setChestTooltipVisible] = useState(false)
  const [chestGrantStatus, setChestGrantStatus] = useState<'idle' | 'loading' | 'granted' | 'claimed' | 'error'>(
    'idle',
  )
  const chestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wallet = useWallet()
  const toast = useToast()

  useEffect(() => {
    return () => {
      if (chestTimerRef.current) {
        clearTimeout(chestTimerRef.current)
      }
    }
  }, [])

  const handleChestClick = async () => {
    if (chestTimerRef.current) {
      clearTimeout(chestTimerRef.current)
      chestTimerRef.current = null
    }

    if (chestOpen) {
      setChestOpen(false)
      setChestTooltipVisible(false)
      setChestGrantStatus('idle')
      return
    }

    if (!wallet.currentAddress) {
      toast.error('Connect your wallet to claim the chest reward.')
      return
    }

    setChestOpen(true)
    setChestTooltipVisible(false)
    chestTimerRef.current = setTimeout(() => {
      setChestTooltipVisible(true)
    }, 1000)

    if (chestGrantStatus === 'granted' || chestGrantStatus === 'claimed') {
      return
    }

    setChestGrantStatus('loading')
    try {
      const response = await fetch('/api/ascension/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet.currentAddress, eventKey }),
      })
      const payload = await response.json().catch(() => null)

      // Handle requiresBurns error case
      if (payload?.requiresBurns) {
        setChestGrantStatus('error')
        toast.error(payload.error || 'You must have sacrificed at least one ordinal to the abyss before claiming ascension powder.')
        return
      }

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? 'Failed to grant ascension powder.')
      }

      if (payload.granted) {
        setChestGrantStatus('granted')
        toast.success('The chest reveals 20 ascension powder!')
      } else {
        setChestGrantStatus('claimed')
        toast.info('You have already claimed the treasure from this chest.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to grant ascension powder.'
      setChestGrantStatus('error')
      toast.error(message)
    }
  }

  const sizeClasses = {
    sm: 'w-20 h-auto',
    md: 'w-36 h-auto',
    lg: 'w-48 h-auto',
  }

  return (
    <div className={`relative z-10 flex justify-center ${className}`}>
      <div className="relative">
        <button
          type="button"
          onClick={handleChestClick}
          className="group relative inline-flex items-center justify-center rounded-full border border-amber-500/40 bg-black/40 p-3 shadow-[0_0_25px_rgba(251,191,36,0.35)] transition hover:border-amber-300/60 hover:bg-black/60"
          aria-label={chestOpen ? 'Close the mysterious chest' : 'Open the mysterious chest'}
        >
          <Image
            src={chestOpen ? '/chest-open.png' : '/chest-closed.png'}
            alt="Damned treasure chest"
            width={140}
            height={120}
            className={`${sizeClasses[size]} select-none drop-shadow-[0_0_20px_rgba(251,191,36,0.35)]`}
            priority={false}
          />
        </button>
        {chestTooltipVisible && (
          <div className="absolute -top-16 left-1/2 w-max -translate-x-1/2 rounded-xl border border-amber-400/60 bg-black/85 px-4 py-2 text-xs font-mono uppercase tracking-[0.35em] text-amber-200 shadow-[0_0_25px_rgba(251,191,36,0.4)]">
            You have found something!
          </div>
        )}
      </div>
    </div>
  )
}

