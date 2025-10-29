'use client'

import { ReactNode, useState, useEffect } from 'react'

interface LaserEyesWrapperProps {
  children: ReactNode
}

export default function LaserEyesWrapper({ children }: LaserEyesWrapperProps) {
  const [LaserEyesProvider, setLaserEyesProvider] = useState<any>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    // Dynamically import LaserEyes only on client side after mount
    // Always render children - don't block on LaserEyes loading
    import('@omnisat/lasereyes').then((module) => {
      setLaserEyesProvider(() => module.LaserEyesProvider)
    }).catch((err) => {
      console.error('Failed to load LaserEyes:', err)
      // Continue rendering even if LaserEyes fails to load
    })
  }, [])

  // Always render children immediately - don't wait for LaserEyes
  // Wrap in provider only if it's available
  if (isMounted && LaserEyesProvider) {
    return (
      <LaserEyesProvider config={{ network: 'mainnet' }}>
        {children}
      </LaserEyesProvider>
    )
  }

  // Render children immediately without provider
  return <>{children}</>
}

