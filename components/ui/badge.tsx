'use client'

import { HTMLAttributes } from 'react'

function mergeClasses(base: string, extra?: string) {
  return extra ? `${base} ${extra}`.trim() : base
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={mergeClasses('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide', className)} {...props} />
}

