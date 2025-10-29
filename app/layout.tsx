import type { Metadata } from 'next'
import './globals.css'
import dynamicImport from 'next/dynamic'

export const dynamic = 'force-dynamic'

// Dynamically import LaserEyesWrapper with SSR disabled to avoid client-side errors
const LaserEyesWrapper = dynamicImport(
  () => import('@/components/LaserEyesWrapper'),
  { 
    ssr: false,
    loading: () => null // Don't show loading indicator
  }
)

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
