/**
 * UTXO Exclusion Service
 * 
 * Tracks UTXOs that are currently being used in pending transactions
 * to prevent "fee too low" or RBF errors when creating multiple transactions
 */

// In-memory storage for excluded UTXOs (per address)
const excludedUtxos = new Map<string, Set<string>>()

// Store with expiration (auto-cleanup after 1 hour)
const exclusionTimestamps = new Map<string, number>()
const EXCLUSION_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

/**
 * Add UTXOs to the exclusion list for an address
 */
export function addExcludedUtxos(address: string, outpoints: string[]): void {
  const normalizedAddress = address.toLowerCase()
  
  if (!excludedUtxos.has(normalizedAddress)) {
    excludedUtxos.set(normalizedAddress, new Set())
  }
  
  const addressSet = excludedUtxos.get(normalizedAddress)!
  const timestamp = Date.now()
  
  outpoints.forEach(outpoint => {
    addressSet.add(outpoint)
    exclusionTimestamps.set(`${normalizedAddress}:${outpoint}`, timestamp)
  })
  
  console.log(`🚫 Added ${outpoints.length} UTXOs to exclusion list for ${address.substring(0, 10)}...`)
  console.log(`   Total excluded: ${addressSet.size}`)
}

/**
 * Get all excluded UTXOs for an address (with auto-cleanup of expired ones)
 */
export function getExcludedUtxos(address: string): string[] {
  const normalizedAddress = address.toLowerCase()
  const addressSet = excludedUtxos.get(normalizedAddress)
  
  if (!addressSet || addressSet.size === 0) {
    return []
  }
  
  // Clean up expired exclusions
  const now = Date.now()
  const expired: string[] = []
  
  addressSet.forEach(outpoint => {
    const key = `${normalizedAddress}:${outpoint}`
    const timestamp = exclusionTimestamps.get(key) || 0
    
    if (now - timestamp > EXCLUSION_EXPIRY_MS) {
      expired.push(outpoint)
    }
  })
  
  // Remove expired UTXOs
  if (expired.length > 0) {
    expired.forEach(outpoint => {
      addressSet.delete(outpoint)
      exclusionTimestamps.delete(`${normalizedAddress}:${outpoint}`)
    })
    console.log(`🧹 Cleaned up ${expired.length} expired UTXO exclusions for ${address.substring(0, 10)}...`)
  }
  
  return Array.from(addressSet)
}

/**
 * Clear all excluded UTXOs for an address
 */
export function clearExcludedUtxos(address: string): void {
  const normalizedAddress = address.toLowerCase()
  const addressSet = excludedUtxos.get(normalizedAddress)
  
  if (addressSet) {
    // Clear timestamps
    addressSet.forEach(outpoint => {
      exclusionTimestamps.delete(`${normalizedAddress}:${outpoint}`)
    })
    
    console.log(`🧹 Cleared ${addressSet.size} excluded UTXOs for ${address.substring(0, 10)}...`)
    excludedUtxos.delete(normalizedAddress)
  }
}

/**
 * Clear all exclusions (useful for testing or reset)
 */
export function clearAllExclusions(): void {
  const totalCount = Array.from(excludedUtxos.values()).reduce((sum, set) => sum + set.size, 0)
  console.log(`🧹 Clearing all UTXO exclusions (${totalCount} total)`)
  excludedUtxos.clear()
  exclusionTimestamps.clear()
}

/**
 * Get statistics about excluded UTXOs
 */
export function getExclusionStats(): {
  totalAddresses: number
  totalUtxos: number
  addressBreakdown: Array<{ address: string; count: number }>
} {
  const addressBreakdown = Array.from(excludedUtxos.entries()).map(([address, set]) => ({
    address: `${address.substring(0, 10)}...${address.substring(address.length - 6)}`,
    count: set.size
  }))
  
  return {
    totalAddresses: excludedUtxos.size,
    totalUtxos: Array.from(excludedUtxos.values()).reduce((sum, set) => sum + set.size, 0),
    addressBreakdown
  }
}












