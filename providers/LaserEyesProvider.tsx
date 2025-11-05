'use client'

import type React from "react"
import { LaserEyesProvider as LaserEyesProviderOriginal } from "@omnisat/lasereyes"
import { WalletProvider } from "@/lib/wallet/compatibility"

export function LaserEyesProvider({ children }: { children: React.ReactNode }) {
  return (
    <LaserEyesProviderOriginal config={{ network: "mainnet" }}>
      <WalletProvider>{children}</WalletProvider>
    </LaserEyesProviderOriginal>
  )
}

