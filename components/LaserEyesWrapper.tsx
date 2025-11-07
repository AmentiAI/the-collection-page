'use client'

import { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { WalletProvider } from '@/lib/wallet/compatibility'

const DynamicLaserEyesProvider = dynamic(
  () => import('@omnisat/lasereyes').then((mod) => mod.LaserEyesProvider),
  { ssr: false, loading: () => null }
)

interface LaserEyesWrapperProps {
  children: ReactNode
}

export default function LaserEyesWrapper({ children }: LaserEyesWrapperProps) {
  return (
    <DynamicLaserEyesProvider config={{ network: 'mainnet' }}>
      <WalletProvider>{children}</WalletProvider>
    </DynamicLaserEyesProvider>
  )
}

