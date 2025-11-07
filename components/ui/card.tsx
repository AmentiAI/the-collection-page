'use client'

import { HTMLAttributes } from 'react'

function mergeClasses(base: string, extra?: string) {
  return extra ? `${base} ${extra}`.trim() : base
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={mergeClasses('rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-lg', className)} {...props} />
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={mergeClasses('p-6 border-b border-zinc-800/80', className)} {...props} />
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={mergeClasses('text-lg font-bold text-white', className)} {...props} />
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={mergeClasses('text-sm text-zinc-400', className)} {...props} />
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={mergeClasses('p-6 space-y-4', className)} {...props} />
}

