/**
 * Runes Protocol Encoding Utilities
 * 
 * Provides functions to encode rune transfers into OP_RETURN outputs (Runestones)
 * following the Runes protocol specification.
 */

export interface RuneId {
  block: number
  tx: number
}

export interface RuneTransfer {
  runeId: RuneId
  amount: bigint
  outputIndex: number
}

export interface DeltaEncodedEdict {
  blockDelta: number
  txDelta: number
  amount: bigint
  outputIndex: number
}

/**
 * Encode a 128-bit unsigned integer as LEB128 varint
 */
export function encodeLEB128(value: bigint): Uint8Array {
  if (value < BigInt(0)) {
    throw new Error('LEB128 encoding only supports unsigned integers')
  }
  
  const bytes: number[] = []
  let remaining = value
  const mask = BigInt(0x7F)
  const continuationBit = BigInt(0x80)
  const shiftAmount = BigInt(7)
  
  while (remaining >= continuationBit) {
    bytes.push(Number(remaining & mask) | 0x80)
    remaining >>= shiftAmount
  }
  bytes.push(Number(remaining))
  
  return new Uint8Array(bytes)
}

/**
 * Sort edicts by Rune ID (block first, then transaction index)
 */
export function sortEdictsByRuneId(edicts: RuneTransfer[]): RuneTransfer[] {
  return [...edicts].sort((a, b) => {
    if (a.runeId.block !== b.runeId.block) {
      return a.runeId.block - b.runeId.block
    }
    return a.runeId.tx - b.runeId.tx
  })
}

/**
 * Delta-encode edicts for efficient serialization
 * First edict uses absolute values, subsequent ones use deltas
 */
export function deltaEncodeEdicts(edicts: RuneTransfer[]): DeltaEncodedEdict[] {
  const sorted = sortEdictsByRuneId(edicts)
  const encoded: DeltaEncodedEdict[] = []
  
  let prevBlock = 0
  let prevTx = 0
  
  for (const edict of sorted) {
    const blockDelta = edict.runeId.block - prevBlock
    const txDelta = edict.runeId.tx - prevTx
    
    encoded.push({
      blockDelta,
      txDelta,
      amount: edict.amount,
      outputIndex: edict.outputIndex,
    })
    
    prevBlock = edict.runeId.block
    prevTx = edict.runeId.tx
  }
  
  return encoded
}

/**
 * Encode edicts into a binary payload buffer
 */
export function encodeEdictsPayload(edicts: RuneTransfer[]): Buffer {
  const deltaEncoded = deltaEncodeEdicts(edicts)
  const payloadChunks: Uint8Array[] = []
  
  for (const edict of deltaEncoded) {
    // Encode: blockDelta, txDelta, amount, outputIndex
    payloadChunks.push(encodeLEB128(BigInt(edict.blockDelta)))
    payloadChunks.push(encodeLEB128(BigInt(edict.txDelta)))
    payloadChunks.push(encodeLEB128(edict.amount))
    payloadChunks.push(encodeLEB128(BigInt(edict.outputIndex)))
  }
  
  // Concatenate all chunks
  const totalLength = payloadChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const buffer = Buffer.allocUnsafe(totalLength)
  let offset = 0
  
  for (const chunk of payloadChunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }
  
  return buffer
}

/**
 * Build OP_RETURN script for rune transfers
 * 
 * @param transfers - Array of rune transfers to encode
 * @returns Buffer containing the OP_RETURN script
 */
export function buildRunestoneScript(transfers: RuneTransfer[]): Buffer {
  if (transfers.length === 0) {
    throw new Error('At least one transfer is required')
  }
  
  // Encode edicts into payload
  const payload = encodeEdictsPayload(transfers)
  
  // Build script: OP_RETURN OP_13 [data pushes]
  const scriptParts: (number | Buffer)[] = [
    0x6a,  // OP_RETURN
    0x5d,  // OP_13
  ]
  
  // Split payload into chunks (max 78 bytes per push for PUSHDATA78)
  const MAX_PUSHDATA = 78
  for (let i = 0; i < payload.length; i += MAX_PUSHDATA) {
    const chunk = payload.slice(i, i + MAX_PUSHDATA)
    const chunkLength = chunk.length
    
    if (chunkLength <= 75) {
      // OP_PUSHDATA1-75: opcode is the length
      scriptParts.push(chunkLength)
    } else if (chunkLength <= 255) {
      // OP_PUSHDATA1: 0x4c + 1 byte length
      scriptParts.push(0x4c)
      scriptParts.push(chunkLength)
    } else {
      // OP_PUSHDATA2: 0x4d + 2 bytes length (little-endian)
      scriptParts.push(0x4d)
      scriptParts.push(chunkLength & 0xFF)
      scriptParts.push((chunkLength >> 8) & 0xFF)
    }
    
    scriptParts.push(chunk)
  }
  
  // Convert script parts to buffer
  const totalLength = scriptParts.reduce((sum, part) => {
    if (typeof part === 'number') {
      return sum + 1
    }
    return sum + part.length
  }, 0)
  const scriptBuffer = Buffer.allocUnsafe(totalLength)
  
  let offset = 0
  for (const part of scriptParts) {
    if (typeof part === 'number') {
      scriptBuffer[offset++] = part
    } else {
      part.copy(scriptBuffer, offset)
      offset += part.length
    }
  }
  
  return scriptBuffer
}

/**
 * Validate that output indices are within range
 */
export function validateOutputIndices(
  transfers: RuneTransfer[],
  totalOutputCount: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  for (let i = 0; i < transfers.length; i++) {
    const transfer = transfers[i]
    
    if (transfer.outputIndex < 0) {
      errors.push(`Transfer ${i}: output index ${transfer.outputIndex} is negative`)
    }
    
    if (transfer.outputIndex >= totalOutputCount) {
      errors.push(
        `Transfer ${i}: output index ${transfer.outputIndex} exceeds total output count ${totalOutputCount}`
      )
    }
    
    if (transfer.amount < BigInt(0)) {
      errors.push(`Transfer ${i}: amount ${transfer.amount} is negative`)
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Parse rune ID from string format (e.g., "840000:5")
 */
export function parseRuneId(runeIdString: string): RuneId {
  const parts = runeIdString.split(':')
  if (parts.length !== 2) {
    throw new Error(`Invalid rune ID format: ${runeIdString}. Expected "block:tx"`)
  }
  
  const block = parseInt(parts[0], 10)
  const tx = parseInt(parts[1], 10)
  
  if (isNaN(block) || isNaN(tx)) {
    throw new Error(`Invalid rune ID format: ${runeIdString}. Block and tx must be numbers`)
  }
  
  return { block, tx }
}

/**
 * Format rune ID to string (e.g., "840000:5")
 */
export function formatRuneId(runeId: RuneId): string {
  return `${runeId.block}:${runeId.tx}`
}

/**
 * Example usage:
 * 
 * ```typescript
 * const transfers: RuneTransfer[] = [
 *   {
 *     runeId: { block: 840000, tx: 5 },
 *     amount: BigInt("100000000000"),
 *     outputIndex: 1
 *   },
 *   {
 *     runeId: { block: 840200, tx: 10 },
 *     amount: BigInt("50000000000"),
 *     outputIndex: 2
 *   }
 * ]
 * 
 * // Validate
 * const validation = validateOutputIndices(transfers, 3) // 3 outputs total
 * if (!validation.valid) {
 *   throw new Error(validation.errors.join(', '))
 * }
 * 
 * // Build script
 * const script = buildRunestoneScript(transfers)
 * 
 * // Add to PSBT
 * psbt.addOutput({
 *   script,
 *   value: BigInt(0)  // OP_RETURN outputs have 0 value
 * })
 * ```
 */
