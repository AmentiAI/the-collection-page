import type { Metadata } from 'next'
import './globals.css'
import LaserEyesWrapper from '@/components/LaserEyesWrapper'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Damned - Ordinals Collection',
  description: 'Explore The Damned Bitcoin Ordinals Collection',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </head>
      <body>
        <LaserEyesWrapper>
          {children}
        </LaserEyesWrapper>
      </body>
    </html>
  )
}
