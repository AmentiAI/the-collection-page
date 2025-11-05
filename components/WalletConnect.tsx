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
  const { connect, disconnect, connected, address, balance } = useLaserEyes()
  const toast = useToast()
  
  // Notify parent when connection status changes
  useEffect(() => {
    onConnectedChange?.(connected)
  }, [connected, onConnectedChange])
  const [isVerifying, setIsVerifying] = useState(false)
  const [isHolder, setIsHolder] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [verificationCode, setVerificationCode] = useState<string | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)

  const handleConnect = async (wallet: any, walletType: string = 'lasereyes') => {
    try {
      setShowDropdown(false)
      if (walletType === 'custom') {
        // Handle custom wallet connections (Magic Eden, OYO)
        const address = await wallet.connect()
        // Manually set connected state for custom wallets
        // Note: This is a simplified implementation - you may need to integrate with LaserEyes differently
        console.log('Custom wallet connected:', address)
        // You'll need to handle the custom wallet connection state here
      } else {
        // Use LaserEyes for standard wallets
        await connect(wallet)
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to connect wallet')
    }
  }

  const handleDisconnect = () => {
    disconnect()
    setIsHolder(false)
    onHolderVerified?.(false)
  }

  // Check if user is a holder when wallet connects and create profile
  useEffect(() => {
    console.log('🔄 useEffect triggered - connected:', connected, 'address:', address)
    if (connected && address) {
      console.log('✅ Wallet connected, creating profile and starting holder check...')
      
      // Auto-create profile
      fetch('/api/profile/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          paymentAddress: address // Initially same as wallet address
        })
      }).then(res => res.json()).then(data => {
        console.log('✅ Profile created/updated:', data)
      }).catch(err => {
        console.error('Failed to create profile:', err)
      })
      
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

    console.log('🚀 Starting holder check for address:', address)
    setIsVerifying(true)
    onVerifyingStart?.()
    try {
      // Check if the connected address has any ordinals from "The Damned" collection (the-damned)
      console.log('🔍 Calling checkForOrdinals for the-damned collection...')
      const hasOrdinals = await checkForOrdinals(address)
      console.log('✅ checkForOrdinals returned:', hasOrdinals)
      setIsHolder(hasOrdinals)
      onHolderVerified?.(hasOrdinals, address)
      
      // If holder, get verification code
      if (hasOrdinals) {
        console.log('🎫 Holder detected! Getting verification code...')
        try {
          const response = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
          })
          const data = await response.json()
          console.log('📝 Verification API response:', data)
          if (data.verified && data.code) {
            console.log('✅ Verification code generated:', data.code)
            setVerificationCode(data.code)
            // Don't auto-show modal - user must click "Show Code" button
          } else {
            console.error('❌ Verification failed:', data.message || 'Unknown error')
          }
        } catch (error) {
          console.error('❌ Error getting verification code:', error)
        }
      } else {
        console.log('❌ Not a holder - no verification code will be generated')
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
      
      console.log('🔍🔍🔍 CHECKING THE DAMNED COLLECTION 🔍🔍🔍')
      console.log('📍 Wallet address:', walletAddress)
      console.log('🏷️ Collection: the-damned')
      console.log('🔗 Using proxy API route:', apiUrl)
      
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
      console.log('📦 FULL Magic Eden API response:', JSON.stringify(data, null, 2))
      console.log('📊 Response keys:', Object.keys(data))
      
      // Check multiple possible response formats
      let total = 0
      if (typeof data.total === 'number') {
        total = data.total
        console.log('✓ Found data.total:', total)
      } else if (Array.isArray(data.tokens)) {
        total = data.tokens.length
        console.log('✓ Found data.tokens array with length:', total)
      } else if (Array.isArray(data)) {
        total = data.length
        console.log('✓ Response is array with length:', total)
      } else if (typeof data.count === 'number') {
        total = data.count
        console.log('✓ Found data.count:', total)
      } else {
        // If no total/count, check if tokens array exists
        if (Array.isArray(data.tokens) && data.tokens.length > 0) {
          total = data.tokens.length
          console.log('✓ Found tokens array with items:', total)
        } else {
          console.warn('⚠️ Could not find total in response structure')
          console.log('📋 Full data structure:', JSON.stringify(data, null, 2))
          // If we have any data, assume they might be a holder
          total = Object.keys(data).length > 0 ? 1 : 0
        }
      }
      
      const hasOrdinals = total > 0
      console.log('🎯 FINAL RESULT - Total ordinals:', total, '| Is holder:', hasOrdinals)
      
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
                       onClick={() => handleConnect(wallet.wallet, wallet.type)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[rgba(139,0,0,0.3)] rounded transition-all group"
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
          
          {/* Show verification code button if holder */}
          {isHolder && verificationCode && !showCodeModal && (
            <button
              onClick={() => setShowCodeModal(true)}
              className="px-3 py-1 bg-[#8B0000] text-white rounded hover:bg-[#ff0000] text-xs font-bold transition-all"
            >
              Show Code
            </button>
          )}
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
      
      {/* Verification Code Modal */}
      {showCodeModal && verificationCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-[rgba(20,20,20,0.98)] border-2 border-[#ff0000] rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl text-[#ff0000] font-bold mb-2">✓ The Damned Holder</h3>
                        <p className="text-[#ff6b6b] mb-4">
              Copy this code and type <code className="bg-black px-2 py-1 rounded">/verify code:</code> then paste your code in Discord to join the holders chat:            
            </p>
            <div className="bg-black p-4 rounded mb-4">
              <code className="text-lg text-white font-bold select-all">{verificationCode}</code>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(verificationCode)
                }}
                className="flex-1 px-4 py-2 bg-[#8B0000] text-white rounded hover:bg-[#ff0000] font-bold"
              >
                Copy Code
              </button>
              <button
                onClick={() => setShowCodeModal(false)}
                className="flex-1 px-4 py-2 bg-[#333] text-white rounded hover:bg-[#555] font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
