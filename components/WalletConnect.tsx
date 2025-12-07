'use client'

import { useLaserEyes, UNISAT, XVERSE, PHANTOM, MAGIC_EDEN } from '@omnisat/lasereyes'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/Toast'

interface WalletConnectProps {
  onHolderVerified?: (isHolder: boolean, address?: string) => void
  onVerifyingStart?: () => void
  onConnectedChange?: (connected: boolean) => void
}

// Custom wallet connector for OYO (Magic Eden is supported by LaserEyes)
const OYO_WALLET = {
  id: 'oyo',
  name: 'OYO',
  icon: '🦉',
  connect: async () => {
    if (typeof window !== 'undefined' && (window as any).oyowallet) {
      try {
        const accounts = await (window as any).oyowallet.requestAccounts()
        return accounts[0]
      } catch (error) {
        throw new Error('Failed to connect OYO wallet')
      }
    }
    throw new Error('OYO wallet not found. Please install the OYO wallet extension.')
  }
}
 
const WALLET_OPTIONS = [
  { id: 'unisat', name: 'Unisat', icon: '🔗', wallet: UNISAT, type: 'lasereyes' },
  { id: 'xverse', name: 'Xverse', icon: '⚡', wallet: XVERSE, type: 'lasereyes' },
  { id: 'phantom', name: 'Phantom', icon: '👻', wallet: PHANTOM, type: 'lasereyes' },
  { id: 'magiceden', name: 'Magic Eden', icon: '✨', wallet: MAGIC_EDEN, type: 'lasereyes' },
  { id: 'oyo', name: 'OYO', icon: '🦉', wallet: OYO_WALLET, type: 'custom' },
]

export default function WalletConnect({ onHolderVerified, onVerifyingStart, onConnectedChange }: WalletConnectProps) {
  const { connect, disconnect, connected, address, balance, client } = useLaserEyes()
  const toast = useToast()
  const [isConnecting, setIsConnecting] = useState(false)
  
  // Notify parent when connection status changes
  useEffect(() => {
    onConnectedChange?.(connected)
  }, [connected, onConnectedChange])
  const [isVerifying, setIsVerifying] = useState(false)
  const [isHolder, setIsHolder] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const handleConnect = async (wallet: any, walletType: string = 'lasereyes') => {
    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
      return
    }

    try {
      setIsConnecting(true)
      setShowDropdown(false)
      
      if (walletType === 'custom') {
        // Handle custom wallet connections (Magic Eden, OYO)
        const address = await wallet.connect()
        // Manually set connected state for custom wallets
        // Note: This is a simplified implementation - you may need to integrate with LaserEyes differently
        console.log('Custom wallet connected:', address)
        // You'll need to handle the custom wallet connection state here
      } else {
        // Check if client is available before connecting
        if (!client && typeof window !== 'undefined') {
          // Wait a bit for client to initialize
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        // Use LaserEyes for standard wallets
        if (!connect) {
          throw new Error('Wallet connection not available. Please refresh the page.')
        }
        
        await connect(wallet)
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet'
      
      // Provide more helpful error messages
      if (errorMessage.includes('disposed') || errorMessage.includes('Client disposed')) {
        toast.error('Connection was interrupted. Please refresh the page and try again.')
      } else {
        toast.error(errorMessage)
      }
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    setIsHolder(false)
    onHolderVerified?.(false)
  }

  // Check if user is a holder when wallet connects (profile auto-created by API if needed)
  useEffect(() => {
   
    if (connected && address) {
      checkHolderStatus()
    } else {
      console.log('❌ Wallet not connected or no address')
      setIsHolder(false)
      onHolderVerified?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, address])

  const checkHolderStatus = async () => {
    if (!address) {
      console.log('⚠️ No address to check')
      return
    }

    
    setIsVerifying(true)
    onVerifyingStart?.()
    try {
      // Check if the connected address has any ordinals from "The Damned" collection (the-damned)
      const hasOrdinals = await checkForOrdinals(address)
      
      // Also check if wallet has abyss_burns records (they deserve access too)
      let hasBurns = false
      try {
        const burnsResponse = await fetch(`/api/holders/check-access?walletAddress=${encodeURIComponent(address)}`)
        if (burnsResponse.ok) {
          const burnsData = await burnsResponse.json()
          hasBurns = burnsData.success && burnsData.hasBurns
          console.log('✅ Has abyss burns:', hasBurns)
        }
      } catch (error) {
        console.error('Error checking abyss burns:', error)
      }
      
      // User is considered a holder if they have ordinals OR have burned in the abyss
      const isHolder = hasOrdinals || hasBurns
      setIsHolder(isHolder)
      onHolderVerified?.(isHolder, address)
      
      if (!isHolder) {
        console.log('❌ Not a holder and no abyss burns - skipping verification code flow')
      }
    } catch (error) {
      console.error('Error checking holder status:', error)
      setIsHolder(false)
      onHolderVerified?.(false, address)
    } finally {
      setIsVerifying(false)
    }
  }

  const checkForOrdinals = async (walletAddress: string, retryCount = 0): Promise<boolean> => {
    try {
      // Proxy through our API route to avoid CORS issues
      const apiUrl = `/api/magic-eden?ownerAddress=${encodeURIComponent(walletAddress)}&collectionSymbol=the-damned`
      
 
      // Call our proxy API route (handles CORS and API key server-side)
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      })
      
      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}))
        const retryAfter = errorData.message?.match(/retry in (\d+) (minute|second)/i)
        const waitTime = retryAfter 
          ? parseInt(retryAfter[1]) * (retryAfter[2].toLowerCase() === 'minute' ? 60000 : 1000)
          : Math.min(1000 * Math.pow(2, retryCount), 60000) // Max 60 seconds
        
        if (retryCount < 2) {
          console.log(`⏳ Rate limit hit (429). Waiting ${Math.round(waitTime/1000)}s... (attempt ${retryCount + 1}/2)`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          return checkForOrdinals(walletAddress, retryCount + 1)
        } else {
          console.error('❌ Rate limit exceeded. Please wait a minute before trying again.')
          return false
        }
      }
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Magic Eden API error:', response.status, response.statusText)
        console.error('Error response body:', errorText)
        return false
      }
      
      console.log('📡 Response status:', response.status, response.statusText)
      
      const data = await response.json()
      
      
      // Check multiple possible response formats
      const tokens = Array.isArray(data.tokens) ? data.tokens : (Array.isArray(data) ? data : [])
      // Must have at least one NFT with listed: false AND no listed ordinals at all
      const hasUnlisted = tokens.some((token: { listed?: boolean }) => token.listed === false)
      const hasAnyListed = tokens.some((token: { listed?: boolean }) => token.listed === true)
      const hasOrdinals = hasUnlisted && !hasAnyListed
      const total = tokens.length
      console.log('🎯 FINAL RESULT - Total ordinals:', total, '| Has unlisted:', hasUnlisted, '| Has any listed:', hasAnyListed, '| Is holder:', hasOrdinals)
      
      return hasOrdinals
    } catch (error) {
      console.error('Error fetching ordinals from Magic Eden:', error)
      return false
    }
  }

  return (
    <div className="relative">
      {!connected ? (
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="px-4 py-2 bg-[#8B0000] text-white rounded hover:bg-[#ff0000] hover:shadow-[0_0_15px_rgba(255,0,0,0.5)] font-bold text-sm uppercase transition-all flex items-center gap-2"
          >
            Connect Wallet
            <span className={`transform transition-transform ${showDropdown ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          
          {showDropdown && (
            <div className="absolute top-full left-0 mt-2 w-48 bg-[rgba(20,20,20,0.95)] border-2 border-[#8B0000] rounded-lg shadow-[0_0_20px_rgba(139,0,0,0.5)] z-50">
              <div className="p-2">
                {WALLET_OPTIONS.map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleConnect(wallet.wallet, wallet.type)
                    }}
                    disabled={isConnecting}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[rgba(139,0,0,0.3)] rounded transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-lg">{wallet.icon}</span>
                    <span className="text-[#ff6b6b] group-hover:text-[#ff0000] font-medium">
                      {wallet.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm">
            <div className="text-xs text-gray-400 truncate max-w-[200px]">
              {address?.slice(0, 8)}...{address?.slice(-8)}
            </div>
          </div>
          
          <button
            onClick={handleDisconnect}
            className="px-3 py-1 bg-[#333] text-[#ff6b6b] rounded hover:bg-[#8B0000] hover:text-white text-xs font-bold transition-all"
          >
            Disconnect
          </button>
        </div>
      )}
      
      {/* Click outside to close dropdown */}
      {showDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowDropdown(false)}
        />
      )}
      
      {/* Verification Code Modal removed */}
    </div>
  )
}
