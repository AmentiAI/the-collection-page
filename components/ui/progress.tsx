'use client'

import { forwardRef, HTMLAttributes } from 'react'

function mergeClasses(base: string, extra?: string) {
  return extra ? `${base} ${extra}`.trim() : base
}

type ProgressProps = HTMLAttributes<HTMLDivElement> & {
  value?: number
  max?: number
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { className, value = 0, max = 100, ...props },
  ref
) {
  const safeMax = max && max > 0 ? max : 100
  const boundedValue = Math.min(Math.max(value, 0), safeMax)
  const percentage = (boundedValue / safeMax) * 100

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuenow={boundedValue}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      className={mergeClasses('w-full h-3 rounded-full bg-[#1a1a1a] shadow-inner overflow-hidden', className)}
      {...props}
    >
      <div
        className="h-full bg-[#ff0000] transition-[width] duration-300 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
})
