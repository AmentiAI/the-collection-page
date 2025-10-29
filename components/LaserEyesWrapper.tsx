'use client'

import { LaserEyesProvider } from '@omnisat/lasereyes'
import { ReactNode } from 'react'

interface LaserEyesWrapperProps {
  children: ReactNode
}

export default function LaserEyesWrapper({ children }: LaserEyesWrapperProps) {
  return (
    <LaserEyesProvider config={{ network: 'mainnet' }}>
      {children}
    </LaserEyesProvider>
  )
}

