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
    import('@omnisat/lasereyes').then((module) => {
      setLaserEyesProvider(() => module.LaserEyesProvider)
    }).catch((err) => {
      console.error('Failed to load LaserEyes:', err)
    })
  }, [])

  // Render children without provider until LaserEyes loads
  if (!isMounted || !LaserEyesProvider) {
    return <>{children}</>
  }

  return (
    <LaserEyesProvider config={{ network: 'mainnet' }}>
      {children}
    </LaserEyesProvider>
  )
}

