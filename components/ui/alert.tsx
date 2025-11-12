'use client'

import { HTMLAttributes } from 'react'

function mergeClasses(base: string, extra?: string) {
  return extra ? `${base} ${extra}`.trim() : base
}

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={mergeClasses('flex items-start gap-3 rounded-lg border px-4 py-3', className)} {...props} />
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={mergeClasses('text-sm text-zinc-300', className)} {...props} />
}



