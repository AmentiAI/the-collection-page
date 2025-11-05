"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useLaserEyes } from "@omnisat/lasereyes"

interface WalletContextType {
  isConnected: boolean
  currentAddress: string | null
  client: any
  isVerified: boolean
  isVerifying: boolean
  verifyWallet: () => Promise<boolean>
  connect: (provider: any) => Promise<void>
  disconnect: () => void
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { connected, address, client, connect: laserEyesConnect, disconnect: laserEyesDisconnect } = useLaserEyes()
  
  const [isVerified, setIsVerified] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [userCancelled, setUserCancelled] = useState(false)

  useEffect(() => {
    console.log('WalletProvider state:', { connected, address, client: !!client })
  }, [connected, address, client])

  const verifyWallet = useCallback(async (): Promise<boolean> => {
    if (!connected || !address || !client || isVerifying || userCancelled) {
      return false
    }

    try {
      setIsVerifying(true)
      const message = `Verify wallet ownership for ${address} at ${Date.now()}`
      
      try {
        const signature = await client.signMessage(message)
        
        const verificationKey = `wallet_verified_${address}`
        sessionStorage.setItem(verificationKey, 'true')
        setIsVerified(true)
        setUserCancelled(false)
        return true
      } catch (signError) {
        console.log("Wallet verification cancelled or failed:", signError)
        setIsVerified(false)
        setUserCancelled(true)
        
        if (client && client.disconnect) {
          client.disconnect()
        }
        return false
      }
    } catch (error) {
      console.log("Wallet verification error:", error)
      setIsVerified(false)
      setUserCancelled(true)
      return false
    } finally {
      setIsVerifying(false)
    }
  }, [connected, address, client, isVerifying, userCancelled])

  const connect = async (provider: any) => {
    try {
      console.log('🔌 WalletProvider connecting to:', provider)
      await laserEyesConnect(provider)
      console.log('✅ WalletProvider connected')
    } catch (error) {
      console.error('❌ WalletProvider connection failed:', error)
      throw error
    }
  }

  const disconnect = () => {
    try {
      laserEyesDisconnect()
      setIsVerified(false)
      setUserCancelled(false)
    } catch (error) {
      console.error('Disconnect error:', error)
    }
  }

  const value: WalletContextType = {
    isConnected: connected,
    currentAddress: address,
    client,
    isVerified,
    isVerifying,
    verifyWallet,
    connect,
    disconnect,
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider")
  }
  return context
}

