'use client'

import { useEffect, useState } from 'react'

export default function TotalSacrifices({ className = '' }: { className?: string }) {
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const res = await fetch('/api/abyss/burns/total', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        const data = await res.json()
        if (mounted) setTotal(Number(data?.total ?? 0))
      } catch (e) {
        if (mounted) setError('—')
      }
    }
    void load()
    const id = setInterval(load, 30_000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  return (
    <div
      className={[
        'rounded-full border border-red-600/50 bg-red-900/20 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.35em] text-red-200',
        className,
      ].join(' ')}
    >
      Total Sacrifices: <span className="text-red-100">{total ?? error ?? '…'}</span>
    </div>
  )
}


