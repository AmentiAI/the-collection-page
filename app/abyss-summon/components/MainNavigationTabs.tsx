'use client'

import Link from 'next/link'
import type { Mode } from './types'

interface MainNavigationTabsProps {
  mode: Mode
  onModeChange: (mode: Mode) => void
  onActiveTabReset: () => void
}

export default function MainNavigationTabs({
  mode,
  onModeChange,
  onActiveTabReset,
}: MainNavigationTabsProps) {
  const IS_POWDER_MODE = mode === 'powder'
  const IS_DAMNED_POOL_MODE = mode === 'damned_pool'
  const IS_DEAD_DEMONS_MODE = mode === 'dead_demons'

  const handleModeChange = (newMode: Mode) => {
    onModeChange(newMode)
    onActiveTabReset()
  }

  return (
    <div className="relative z-20 -mb-4 ml-0 md:ml-4 flex flex-wrap items-center justify-between gap-2 pr-4 max-w-full overflow-x-hidden px-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleModeChange('abyss')}
          className={[
            'rounded-full border px-3 py-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] sm:tracking-[0.35em] transition whitespace-normal break-words',
            !IS_POWDER_MODE && !IS_DAMNED_POOL_MODE && !IS_DEAD_DEMONS_MODE
              ? 'border-red-500 bg-red-700/80 text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.45)]'
              : 'border-red-700/50 bg-black/70 text-red-200/80 hover:border-red-500/70',
          ].join(' ')}
        >
          Abyss
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('powder')}
          className={[
            'rounded-full border px-3 py-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] sm:tracking-[0.35em] transition whitespace-normal break-words',
            IS_POWDER_MODE
              ? 'border-amber-400 bg-amber-600/80 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.45)]'
              : 'border-amber-600/50 bg-black/70 text-amber-200/80 hover:border-amber-400/70',
          ].join(' ')}
        >
          Ascension
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('damned_pool')}
          className={[
            'rounded-full border px-3 py-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.15em] sm:tracking-[0.35em] transition whitespace-normal break-words max-w-full',
            IS_DAMNED_POOL_MODE
              ? 'border-indigo-400 bg-indigo-700/80 text-indigo-100 shadow-[0_0_18px_rgba(99,102,241,0.45)]'
              : 'border-indigo-600/50 bg-black/70 text-indigo-200/80 hover:border-indigo-400/70',
          ].join(' ')}
        >
          Portal
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('dead_demons')}
          className={[
            'rounded-full border px-3 py-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.15em] sm:tracking-[0.35em] transition whitespace-normal break-words max-w-full',
            IS_DEAD_DEMONS_MODE
              ? 'border-purple-400 bg-purple-700/80 text-purple-100 shadow-[0_0_18px_rgba(168,85,247,0.45)]'
              : 'border-purple-600/50 bg-black/70 text-purple-200/80 hover:border-purple-400/70',
          ].join(' ')}
        >
          Dead Demons
        </button>
      </div>
      <div className="flex w-full flex-wrap items-center justify-center gap-2 gap-y-2 sm:w-auto sm:justify-start">
        <span className="text-[11px] font-mono uppercase tracking-[0.35em] text-red-200/80">Leaderboards:</span>
        <Link
          href="/abyss-summon/leaderboard"
          className="inline-flex items-center gap-2 rounded-full border border-red-500 bg-red-700/70 px-4 py-1.5 text-[11px] font-mono uppercase tracking-[0.35em] text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.35)] transition hover:bg-red-600"
        >
          Summoning
        </Link>
        <Link
          href="/ascension/leaderboard"
          className="inline-flex items-center gap-2 rounded-full border border-amber-400 bg-amber-600/70 px-4 py-1.5 text-[11px] font-mono uppercase tracking-[0.35em] text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.35)] transition hover:bg-amber-500"
        >
          Ascension
        </Link>
      </div>
    </div>
  )
}

