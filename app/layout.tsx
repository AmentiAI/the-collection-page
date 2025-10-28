import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'The Damned - Ordinals Collection',
  description: 'Explore The Damned Bitcoin Ordinals Collection',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
