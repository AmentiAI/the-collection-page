'use client'

import { useLaserEyes, UNISAT, XVERSE, PHANTOM } from '@omnisat/lasereyes'
import { useState, useEffect } from 'react'

interface WalletConnectProps {
  onHolderVerified?: (isHolder: boolean, address?: string) => void
  onVerifyingStart?: () => void
}

const WALLET_OPTIONS = [
  { id: 'unisat', name: 'Unisat', icon: '🔗', wallet: UNISAT },
  { id: 'xverse', name: 'Xverse', icon: '⚡', wallet: XVERSE },
  { id: 'phantom', name: 'Phantom', icon: '👻', wallet: PHANTOM },
]

export default function WalletConnect({ onHolderVerified, onVerifyingStart }: WalletConnectProps) {
  const { connect, disconnect, connected, address, balance } = useLaserEyes()
  const [isVerifying, setIsVerifying] = useState(false)
  const [isHolder, setIsHolder] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [verificationCode, setVerificationCode] = useState<string | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)

  const handleConnect = async (wallet: any) => {
    try {
      setShowDropdown(false)
      await connect(wallet)
    } catch (error) {
      console.error('Failed to connect wallet:', error)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    setIsHolder(false)
    onHolderVerified?.(false)
  }

  // Check if user is a holder when wallet connects
  useEffect(() => {
    if (connected && address) {
      checkHolderStatus()
    } else {
      setIsHolder(false)
      onHolderVerified?.(false)
    }
  }, [connected, address])

  const checkHolderStatus = async () => {
    if (!address) return

    setIsVerifying(true)
    onVerifyingStart?.()
    try {
      // Check if the connected address has any ordinals from "The Damned" collection
      const hasOrdinals = await checkForOrdinals(address)
      setIsHolder(hasOrdinals)
      onHolderVerified?.(hasOrdinals, address)
      
      // If holder, get verification code
      if (hasOrdinals) {
        const response = await fetch('/api/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address })
        })
        const data = await response.json()
        if (data.verified && data.code) {
          setVerificationCode(data.code)
          setShowCodeModal(true)
        }
      }
    } catch (error) {
      console.error('Error checking holder status:', error)
      setIsHolder(false)
      onHolderVerified?.(false, address)
    } finally {
      setIsVerifying(false)
    }
  }

  const checkForOrdinals = async (walletAddress: string): Promise<boolean> => {
    try {
      // This is a placeholder - you'll need to implement actual ordinal checking
      // You might check against a specific inscription range or collection criteria
      
      // For now, we'll do a simple check - you can enhance this based on your collection
      const response = await fetch(`https://api.ordinals.com/v1/inscriptions?address=${walletAddress}`)
      const data = await response.json()
      
      // Check if user has any ordinals (you can make this more specific)
      return data.inscriptions && data.inscriptions.length > 0
    } catch (error) {
      console.error('Error fetching ordinals:', error)
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
                    onClick={() => handleConnect(wallet.wallet)}
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
        <div className="flex items-center gap-3">
          <div className="text-sm">
            <div className="text-[#ff6b6b] font-bold">
              {isVerifying ? (
                <span className="animate-pulse">Verifying...</span>
              ) : isHolder ? (
                <span className="text-[#00ff00]">✓ Holder Verified</span>
              ) : (
                <span className="text-[#ff6b6b]">Connected</span>
              )}
            </div>
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
      
      {/* Verification Code Modal */}
      {showCodeModal && verificationCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-[rgba(20,20,20,0.98)] border-2 border-[#ff0000] rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl text-[#ff0000] font-bold mb-4">Discord Verification Code</h3>
            <p className="text-[#ff6b6b] mb-4">
              Copy this code and use <code className="bg-black px-2 py-1 rounded">/verifycode</code> in Discord:
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
