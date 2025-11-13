'use client'

import { forwardRef, InputHTMLAttributes } from 'react'

function mergeClasses(base: string, extra?: string) {
  return extra ? `${base} ${extra}`.trim() : base
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type = 'text', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={mergeClasses(
        'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white shadow-inner placeholder:text-zinc-500 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/60',
        className
      )}
      {...props}
    />
  )
})




