'use client'

import { ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'default' | 'outline'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

function mergeClasses(base: string, extra?: string) {
  return extra ? `${base} ${extra}`.trim() : base
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, type = 'button', variant: _variant = 'default', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={mergeClasses(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
})

