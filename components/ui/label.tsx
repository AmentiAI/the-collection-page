'use client'

import { LabelHTMLAttributes } from 'react'

function mergeClasses(base: string, extra?: string) {
  return extra ? `${base} ${extra}`.trim() : base
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={mergeClasses('text-sm font-medium text-zinc-300', className)} {...props} />
}



