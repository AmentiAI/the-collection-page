'use client'

import { LaserEyesProvider } from '@omnisat/lasereyes'
import { ReactNode, useState, useEffect } from 'react'

interface LaserEyesWrapperProps {
  children: ReactNode
}

export default function LaserEyesWrapper({ children }: LaserEyesWrapperProps) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Only render LaserEyesProvider on client side
  if (!isMounted) {
    return <>{children}</>
  }

  return (
    <LaserEyesProvider config={{ network: 'mainnet' }}>
      {children}
    </LaserEyesProvider>
  )
}

