'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'

interface RouletteWheelProps {
  onSpinComplete?: (won: boolean, resultColor: string) => void
}

export default function RouletteWheel({ onSpinComplete }: RouletteWheelProps) {
  const { currentAddress, isConnected } = useWallet()
  const [isSpinning, setIsSpinning] = useState(false)
  const [hasSpun, setHasSpun] = useState(false)
  const [canSpin, setCanSpin] = useState(false)
  const [selectedColor, setSelectedColor] = useState<'red' | 'black' | 'green' | null>(null)
  const [resultColor, setResultColor] = useState<'red' | 'black' | 'green' | null>(null)
  const [won, setWon] = useState<boolean | null>(null)
  const [rotation, setRotation] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [badgeInfo, setBadgeInfo] = useState<{
    badgeName: string
    badgeDescription: string
    badgeRarity: string | null
    color: string
  } | null>(null)
  const [showBadge, setShowBadge] = useState(false)
  const wheelRef = useRef<HTMLDivElement>(null)

  // Check if user can spin
  useEffect(() => {
    if (!isConnected || !currentAddress) {
      setCanSpin(false)
      return
    }

    const checkSpinStatus = async () => {
      try {
        const response = await fetch(`/api/roulette/spin?walletAddress=${encodeURIComponent(currentAddress)}`)
        const data = await response.json()
        
        if (data.hasSpun) {
          setHasSpun(true)
          setCanSpin(false)
          if (data.previousResult) {
            setSelectedColor(data.previousResult.guessedColor)
            setResultColor(data.previousResult.resultColor)
            setWon(data.previousResult.won)
            
            // Set badge info if they won
            if (data.previousResult.won) {
              const isLegendary = data.previousResult.resultColor === 'green'
              setBadgeInfo({
                badgeName: isLegendary 
                  ? '🌟 LEGENDARY: Roulette Green Winner' 
                  : `Roulette ${data.previousResult.resultColor.charAt(0).toUpperCase() + data.previousResult.resultColor.slice(1)} Winner`,
                badgeDescription: isLegendary
                  ? 'Legendary achievement! Correctly guessed the rare green (4% chance) on the roulette wheel'
                  : `Correctly guessed ${data.previousResult.resultColor} on the roulette wheel`,
                badgeRarity: isLegendary ? 'legendary' : 'common',
                color: data.previousResult.resultColor
              })
            }
          }
        } else {
          setHasSpun(false)
          setCanSpin(true)
        }
      } catch (err) {
        console.error('Error checking spin status:', err)
      }
    }

    checkSpinStatus()
  }, [isConnected, currentAddress])

  const handleSpin = async () => {
    if (!canSpin || !selectedColor || isSpinning || !currentAddress) return

    setIsSpinning(true)
    setError(null)

    try {
      // Start spinning animation
      const spinDuration = 3000 // 3 seconds
      const spins = 5 + Math.random() * 5 // 5-10 full rotations
      const baseRotation = 360 * spins
      
      // Animate the spin
      const startTime = Date.now()
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / spinDuration, 1)
        const easeOut = 1 - Math.pow(1 - progress, 3) // Ease out cubic
        const currentRotation = baseRotation * easeOut
        
        if (wheelRef.current) {
          setRotation(currentRotation)
        }
        
        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }
      animate()

      // Call API to process the spin
      const response = await fetch('/api/roulette/spin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: currentAddress,
          guessedColor: selectedColor,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.alreadySpun) {
          setHasSpun(true)
          setCanSpin(false)
          if (data.previousResult) {
            setResultColor(data.previousResult.resultColor)
            setWon(data.previousResult.won)
          }
        }
        throw new Error(data.error || 'Failed to spin')
      }

      // Set final result immediately (API already determined it)
      const finalColor = data.result.resultColor
      
      // Wait for animation to complete
      await new Promise((resolve) => setTimeout(resolve, spinDuration))

      // Calculate final rotation position based on result
      // Wheel segments: Red (0-172.8deg), Black (172.8-345.6deg), Green (345.6-360deg)
      // We want the color's center to end up at the top (pointing to 0 degrees)
      const colorCenterPositions: Record<string, number> = {
        red: 86.4,    // Center of red segment (0-172.8deg)
        black: 259.2, // Center of black segment (172.8-345.6deg)
        green: 352.8, // Center of green segment (345.6-360deg)
      }
      
      // Calculate final rotation: we want the color center to be at the top (0deg)
      // So we rotate the wheel so that the color center ends up at 0
      const targetAngle = colorCenterPositions[finalColor] || 0
      // Add some randomness within the segment
      const segmentSizes: Record<string, number> = {
        red: 172.8,
        black: 172.8,
        green: 14.4,
      }
      const segmentSize = segmentSizes[finalColor] || 172.8
      const randomOffset = (Math.random() - 0.5) * segmentSize * 0.6 // Random within 60% of segment
      const finalPosition = (360 - targetAngle + randomOffset + 360) % 360
      
      // Final rotation is base rotation plus adjustment to land on target
      const finalRotation = baseRotation + finalPosition
      setRotation(finalRotation)

      // Update state after animation
      setResultColor(finalColor)
      setWon(data.result.won)
      setHasSpun(true)
      setCanSpin(false)

      // If they won, fetch and show the badge
      if (data.result.won) {
        const isLegendary = finalColor === 'green'
        setBadgeInfo({
          badgeName: isLegendary 
            ? '🌟 LEGENDARY: Roulette Green Winner' 
            : `Roulette ${finalColor.charAt(0).toUpperCase() + finalColor.slice(1)} Winner`,
          badgeDescription: isLegendary
            ? 'Legendary achievement! Correctly guessed the rare green (4% chance) on the roulette wheel'
            : `Correctly guessed ${finalColor} on the roulette wheel`,
          badgeRarity: isLegendary ? 'legendary' : 'common',
          color: finalColor
        })
        // Show badge after a brief delay
        setTimeout(() => {
          setShowBadge(true)
        }, 500)
      }

      if (onSpinComplete) {
        onSpinComplete(data.result.won, finalColor)
      }
    } catch (err) {
      console.error('Spin error:', err)
      setError(err instanceof Error ? err.message : 'Failed to spin')
    } finally {
      setIsSpinning(false)
    }
  }

  // Roulette wheel segments: red, black, green
  const segments = [
    { color: 'red', angle: 0 },
    { color: 'black', angle: 180 },
    { color: 'green', angle: 90 },
  ]

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-black/50 rounded-lg border border-red-600/30">
        <p className="text-red-600/70 text-lg font-mono mb-4">Connect your wallet to spin the roulette wheel</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-black/50 rounded-lg border border-red-600/30">
        <h2 className="text-red-600 text-3xl font-mono mb-6 text-glow">DAMNED ROULETTE</h2>
      
      {error && (
        <div className="mb-4 p-4 bg-red-600/20 border border-red-600/50 rounded text-red-400 font-mono text-sm">
          {error}
        </div>
      )}

      {/* Badge Display - INSANE ANIMATION */}
      {showBadge && badgeInfo && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md"
          style={{
            animation: 'badgeFadeIn 0.5s ease-out',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowBadge(false)
            }
          }}
        >
          <div 
            className={`relative p-10 rounded-3xl border-4 max-w-lg w-full mx-4 ${
              badgeInfo.badgeRarity === 'legendary'
                ? 'bg-gradient-to-br from-yellow-600/30 via-amber-700/40 to-yellow-600/30 border-yellow-400'
                : 'bg-gradient-to-br from-red-600/30 via-black/60 to-red-600/30 border-red-500'
            }`}
            style={{
              animation: 'badgeScaleIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
              boxShadow: badgeInfo.badgeRarity === 'legendary'
                ? '0 0 100px rgba(234, 179, 8, 0.9), inset 0 0 80px rgba(251, 191, 36, 0.4), 0 0 200px rgba(234, 179, 8, 0.5)'
                : '0 0 80px rgba(220, 38, 38, 0.9), inset 0 0 50px rgba(239, 68, 68, 0.3)'
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setShowBadge(false)}
              className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl font-bold z-10 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-all"
            >
              ×
            </button>

            {/* Badge Icon/Visual */}
            <div className="flex flex-col items-center mb-6">
              <div 
                className="relative w-56 h-56 mb-6"
                style={{
                  animation: badgeInfo.badgeRarity === 'legendary' 
                    ? 'badgeSpin 4s linear infinite, badgeFloat 3s ease-in-out infinite' 
                    : 'badgeFloat 3s ease-in-out infinite'
                }}
              >
                {/* Outer glow rings for legendary */}
                {badgeInfo.badgeRarity === 'legendary' && (
                  <>
                    <div 
                      className="absolute inset-0 rounded-full border-4 border-yellow-400/60"
                      style={{ animation: 'badgePing 2s cubic-bezier(0, 0, 0.2, 1) infinite' }}
                    ></div>
                    <div 
                      className="absolute inset-0 rounded-full border-4 border-amber-400/40"
                      style={{ animation: 'badgePing 2s cubic-bezier(0, 0, 0.2, 1) infinite 0.7s' }}
                    ></div>
                    <div 
                      className="absolute inset-0 rounded-full border-4 border-yellow-300/30"
                      style={{ animation: 'badgePing 2s cubic-bezier(0, 0, 0.2, 1) infinite 1.4s' }}
                    ></div>
                  </>
                )}
                
                {/* Badge Circle */}
                <div 
                  className={`absolute inset-0 rounded-full flex items-center justify-center ${
                    badgeInfo.badgeRarity === 'legendary'
                      ? 'bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600 border-8 border-yellow-300'
                      : badgeInfo.color === 'red'
                      ? 'bg-gradient-to-br from-red-500 to-red-700 border-8 border-red-400'
                      : 'bg-gradient-to-br from-gray-700 to-black border-8 border-gray-500'
                  }`}
                  style={{
                    boxShadow: badgeInfo.badgeRarity === 'legendary'
                      ? '0 0 60px rgba(234, 179, 8, 1), inset 0 0 40px rgba(251, 191, 36, 0.6), 0 0 120px rgba(234, 179, 8, 0.8)'
                      : badgeInfo.color === 'red'
                      ? '0 0 50px rgba(220, 38, 38, 0.9), inset 0 0 30px rgba(239, 68, 68, 0.4)'
                      : '0 0 40px rgba(0, 0, 0, 0.9)',
                    animation: badgeInfo.badgeRarity === 'legendary' ? 'badgeGlow 2s ease-in-out infinite' : 'none'
                  }}
                >
                  {/* Badge Symbol */}
                  <div className="text-8xl drop-shadow-2xl">
                    {badgeInfo.badgeRarity === 'legendary' ? '🌟' : badgeInfo.color === 'red' ? '🔴' : '⚫'}
                  </div>
                </div>
                
                {/* Sparkle effects for legendary */}
                {badgeInfo.badgeRarity === 'legendary' && (
                  <>
                    {[...Array(12)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-1/2 left-1/2 w-3 h-3 bg-yellow-300 rounded-full"
                        style={{
                          transform: `rotate(${i * 30}deg) translateY(-130px)`,
                          animation: `badgeSparkle 2s ease-in-out infinite ${i * 0.15}s`,
                          boxShadow: '0 0 10px rgba(234, 179, 8, 1)'
                        }}
                      />
                    ))}
                  </>
                )}
              </div>

              {/* Badge Title */}
              <h3 
                className={`text-4xl font-black text-center mb-3 uppercase tracking-wider ${
                  badgeInfo.badgeRarity === 'legendary'
                    ? 'text-yellow-300'
                    : 'text-white'
                }`}
                style={{
                  textShadow: badgeInfo.badgeRarity === 'legendary'
                    ? '0 0 30px rgba(234, 179, 8, 1), 0 0 60px rgba(251, 191, 36, 0.8), 0 0 90px rgba(234, 179, 8, 0.6)'
                    : '0 0 20px rgba(220, 38, 38, 0.8), 0 0 40px rgba(239, 68, 68, 0.6)'
                }}
              >
                {badgeInfo.badgeName}
              </h3>

              {/* Badge Description */}
              <p className={`text-center text-base mb-5 px-4 ${
                badgeInfo.badgeRarity === 'legendary' ? 'text-yellow-200' : 'text-gray-300'
              }`}>
                {badgeInfo.badgeDescription}
              </p>

              {/* Rarity Label */}
              {badgeInfo.badgeRarity === 'legendary' && (
                <div 
                  className="px-6 py-3 bg-gradient-to-r from-yellow-600/60 to-amber-600/60 border-2 border-yellow-400 rounded-full text-yellow-200 font-black text-lg uppercase tracking-widest"
                  style={{
                    animation: 'pulse 1.5s ease-in-out infinite',
                    textShadow: '0 0 20px rgba(234, 179, 8, 1)',
                    boxShadow: '0 0 30px rgba(234, 179, 8, 0.8), inset 0 0 20px rgba(251, 191, 36, 0.3)'
                  }}
                >
                  ⭐ LEGENDARY ⭐
                </div>
              )}
            </div>

            {/* Celebration Text */}
            <div 
              className={`text-center text-2xl font-black mb-4 uppercase tracking-wider ${
                badgeInfo.badgeRarity === 'legendary'
                  ? 'text-yellow-300'
                  : 'text-green-400'
              }`}
              style={{
                animation: 'badgeFloat 2s ease-in-out infinite',
                textShadow: badgeInfo.badgeRarity === 'legendary'
                  ? '0 0 30px rgba(234, 179, 8, 1)'
                  : '0 0 20px rgba(34, 197, 94, 0.8)'
              }}
            >
              🎉 CONGRATULATIONS! 🎉
            </div>

            <p className="text-center text-white/80 text-base font-mono">
              This badge has been added to your profile!
            </p>
          </div>
        </div>
      )}
      
      {/* Debug: Show if showBadge is true but badgeInfo is missing */}
      {showBadge && !badgeInfo && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90">
          <div className="bg-red-600 p-8 rounded-lg text-white">
            <p>Error: Badge info not found. showBadge: {showBadge ? 'true' : 'false'}</p>
            <button onClick={() => setShowBadge(false)} className="mt-4 px-4 py-2 bg-white text-black rounded">
              Close
            </button>
          </div>
        </div>
      )}

      {hasSpun && won && !showBadge && badgeInfo && (
        <div className={`mb-4 p-4 border rounded text-sm font-mono cursor-pointer hover:scale-105 transition-transform ${
          resultColor === 'green'
            ? 'bg-gradient-to-r from-yellow-600/30 to-amber-600/30 border-yellow-500/70 text-yellow-300 shadow-[0_0_30px_rgba(234,179,8,0.5)]'
            : 'bg-green-600/20 border-green-600/50 text-green-400'
        }`}
        onClick={() => {
          if (!badgeInfo && resultColor) {
            // Reconstruct badgeInfo if missing
            const isLegendary = resultColor === 'green'
            setBadgeInfo({
              badgeName: isLegendary 
                ? '🌟 LEGENDARY: Roulette Green Winner' 
                : `Roulette ${resultColor.charAt(0).toUpperCase() + resultColor.slice(1)} Winner`,
              badgeDescription: isLegendary
                ? 'Legendary achievement! Correctly guessed the rare green (4% chance) on the roulette wheel'
                : `Correctly guessed ${resultColor} on the roulette wheel`,
              badgeRarity: isLegendary ? 'legendary' : 'common',
              color: resultColor
            })
          }
          setShowBadge(true)
        }}
        >
          {resultColor === 'green' ? (
            <div className="text-center">
              <div className="text-2xl mb-2">🌟 LEGENDARY WIN! 🌟</div>
              <div>You correctly guessed GREEN (4% chance)!</div>
              <div className="text-xs mt-2 opacity-80">Click to view your legendary badge!</div>
            </div>
          ) : (
            <div className="text-center">
              <div>🎉 You won! Click to view your badge!</div>
            </div>
          )}
        </div>
      )}
      
      {/* Debug info */}
      {hasSpun && won && !badgeInfo && (
        <div className="mb-4 p-4 bg-yellow-600/20 border border-yellow-600/50 rounded text-yellow-400 font-mono text-sm">
          Debug: Won but badgeInfo not set. Result: {resultColor}, Won: {won ? 'true' : 'false'}
        </div>
      )}

      {hasSpun && !won && (
        <div className="mb-4 p-4 bg-red-600/20 border border-red-600/50 rounded text-red-400 font-mono text-sm">
          You guessed {selectedColor}, but the wheel landed on {resultColor}. Better luck next time!
        </div>
      )}

      {/* Roulette Wheel */}
      <div className="relative mb-6">
        {/* Outer ring with border */}
        <div className="relative w-72 h-72 mx-auto">
          {/* Pointer at top (fixed) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 border-l-[15px] border-r-[15px] border-t-[25px] border-transparent border-t-yellow-400 z-20 drop-shadow-lg" />
          
          {/* Wheel - Simplified: 48% red, 48% black, 4% green */}
          <div
            ref={wheelRef}
            className="relative w-full h-full rounded-full border-8 border-yellow-600 shadow-[0_0_40px_rgba(220,38,38,0.8)]"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning ? 'none' : 'transform 0.3s ease-out',
              background: `conic-gradient(
                from 0deg,
                #dc2626 0deg 172.8deg,
                #000000 172.8deg 345.6deg,
                #059669 345.6deg 360deg
              )`,
            }}
          >
            {/* Segment dividers */}
            {[0, 172.8, 345.6].map((angle, idx) => (
              <div
                key={idx}
                className="absolute top-1/2 left-1/2 w-1/2 h-1 origin-bottom"
                style={{
                  transform: `translate(-50%, -100%) rotate(${angle}deg)`,
                }}
              >
                <div className="w-full h-full bg-white/50" />
              </div>
            ))}
          </div>
          
          {/* Center circle (fixed) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-gradient-to-br from-yellow-600 to-yellow-800 rounded-full border-4 border-red-600 flex items-center justify-center z-10 shadow-lg">
            <div className="text-black font-bold text-xs">SPIN</div>
          </div>
        </div>
      </div>

      {/* Color Selection */}
      {!hasSpun && (
        <div className="mb-6">
          <p className="text-red-600/80 text-lg font-mono mb-4 text-center">Choose your color:</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setSelectedColor('red')}
              disabled={isSpinning || !canSpin}
              className={`px-6 py-3 font-bold uppercase transition-all duration-300 ${
                selectedColor === 'red'
                  ? 'bg-red-600 text-white scale-110 shadow-[0_0_20px_rgba(220,38,38,0.8)]'
                  : 'bg-red-600/30 text-red-400 hover:bg-red-600/50'
              } ${isSpinning || !canSpin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              RED
            </button>
            <button
              onClick={() => setSelectedColor('black')}
              disabled={isSpinning || !canSpin}
              className={`px-6 py-3 font-bold uppercase transition-all duration-300 ${
                selectedColor === 'black'
                  ? 'bg-black text-white scale-110 shadow-[0_0_20px_rgba(0,0,0,0.8)] border-2 border-gray-600'
                  : 'bg-black/30 text-gray-400 hover:bg-black/50'
              } ${isSpinning || !canSpin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              BLACK
            </button>
            <button
              onClick={() => setSelectedColor('green')}
              disabled={isSpinning || !canSpin}
              className={`px-6 py-3 font-bold uppercase transition-all duration-300 ${
                selectedColor === 'green'
                  ? 'bg-green-600 text-white scale-110 shadow-[0_0_20px_rgba(5,150,105,0.8)]'
                  : 'bg-green-600/30 text-green-400 hover:bg-green-600/50'
              } ${isSpinning || !canSpin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              GREEN
            </button>
          </div>
        </div>
      )}

      {/* Spin Button */}
      {!hasSpun && (
        <button
          onClick={handleSpin}
          disabled={!canSpin || !selectedColor || isSpinning}
          className={`px-8 py-4 font-bold uppercase text-lg transition-all duration-300 ${
            canSpin && selectedColor && !isSpinning
              ? 'bg-red-600 text-white hover:bg-red-700 transform hover:scale-110 shadow-[0_0_30px_rgba(220,38,38,0.6)]'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
          }`}
        >
          {isSpinning ? 'SPINNING...' : 'SPIN THE WHEEL'}
        </button>
      )}

      {hasSpun && (
        <p className="text-red-600/50 text-sm font-mono mt-4 text-center">
          You have already used your one spin.
        </p>
      )}

      <p className="text-red-600/40 text-xs font-mono mt-6 text-center max-w-md">
        Each user gets one spin. Guess the correct color to earn a badge on your profile!
      </p>
    </div>
  )
}

