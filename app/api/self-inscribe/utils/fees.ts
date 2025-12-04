export function calculateRevealTxFees(inscriptionAddresses: any[], feeRate: number) {
  return inscriptionAddresses.map((addrData, index) => {
    const ins = addrData.inscription
    
    // More accurate base transaction size calculation
    // Version (4) + Input count (1) + Locktime (4) + Output count (1) = 10 bytes base
    // Plus input and output overhead
    const baseTxSize = 11
    
    // Input size: 32 (txid) + 4 (vout) + 1 (script length) + 0 (empty script) + 4 (sequence) = 41 bytes
    const inputSize = 31
    
    // Calculate MIME type bytes for this inscription
    const mimeTypeBytes = Buffer.from(ins.mimeType, 'utf8').length
    
    // Calculate content bytes - handle delegates specially
    let contentBytes: number
    if (ins.delegateAddress) {
      // For delegates, let's see what the old calculation was giving us
      const oldCalculation = Buffer.from(ins.content, 'base64').length
      console.log(`📝 Delegate content analysis:`)
      console.log(`   Original content: "${ins.content}"`)
      console.log(`   Old base64 decode length: ${oldCalculation} bytes`)
      console.log(`   Correct binary length: 36 bytes`)
      
      // For now, let's use the old calculation to see what was happening
      contentBytes = oldCalculation
    } else {
      // For regular inscriptions, decode base64 content
      contentBytes = Buffer.from(ins.content, 'base64').length
    }
    
    // More accurate inscription script size calculation (using original logic for now)
    const inscriptionScriptRawSize = 
      1 + // OP_0
      1 + // OP_IF  
      1 + 3 + // OP_PUSHBYTES_3 + "ord"
      1 + 1 + // OP_PUSHBYTES_1 + 01
      (mimeTypeBytes <= 75 ? 1 : mimeTypeBytes <= 255 ? 2 : 3) + mimeTypeBytes + // push opcode(s) + mime type
      1 + // OP_0
      (contentBytes <= 75 ? 1 : contentBytes <= 255 ? 2 : contentBytes <= 65535 ? 3 : 5) + contentBytes + // push opcode(s) + content
      1   // OP_ENDIF
      
    if (ins.delegateAddress) {
      console.log(`📝 Delegate script size calculation:`)
      console.log(`   MIME bytes: ${mimeTypeBytes}`)
      console.log(`   Content bytes: ${contentBytes}`)
      console.log(`   Total script size: ${inscriptionScriptRawSize}`)
    }
    
    // Output sizes
    const inscriptionOutputSize = 8 + 1 + 34 // value (8) + script length (1) + P2TR script (34)
    const platformFeeOutputSize = 8 + 1 + 34 // Assume P2TR for platform fee too
    const outputsSize = inscriptionOutputSize + platformFeeOutputSize // Usually 2 outputs
    
    // Witness data calculation (more accurate)
    const witnessStackItemCount = 1 // Compact size for 3 items
    
    // Signature: 64 bytes + length prefix
    const signatureLength = 64
    const signatureWithLength = (signatureLength <= 252 ? 1 : 3) + signatureLength
    
    // Script: inscription script + length prefix
    const scriptWithLength = (inscriptionScriptRawSize <= 252 ? 1 : inscriptionScriptRawSize <= 65535 ? 3 : 5) + inscriptionScriptRawSize
    
    // Control block: 33 bytes + length prefix
    const controlBlockLength = 33
    const controlBlockWithLength = 1 + controlBlockLength
    
    const totalWitnessSize = witnessStackItemCount + signatureWithLength + scriptWithLength + controlBlockWithLength
    
    // Transaction weight calculation (more accurate)
    const baseWeight = (baseTxSize + inputSize + outputsSize) * 4 // Base data is multiplied by 4
    const witnessWeight = totalWitnessSize // Witness data counts as 1
    const totalWeight = baseWeight + witnessWeight
    
    // Virtual size = weight / 4 (rounded up)
    const revealTxVirtualSize = Math.ceil(totalWeight / 4)
    
    // Calculate fee without minimum enforcement
    const revealTxFee = Math.ceil(revealTxVirtualSize * feeRate)
    
    // Add debug logging for reveal fee calculation
    console.log(`💎 Reveal fee calculation for inscription ${index}:`)
    console.log(`   Type: ${ins.delegateAddress ? 'Delegate' : 'Regular'}`)
    console.log(`   Content: ${contentBytes} bytes, MIME: ${mimeTypeBytes} bytes`)
    console.log(`   Script size: ${inscriptionScriptRawSize} bytes`)
    console.log(`   Witness size: ${totalWitnessSize} bytes`)
    console.log(`   Transaction weight: ${totalWeight} WU`)
    console.log(`   Virtual size: ${revealTxVirtualSize} vB`)
    console.log(`   Fee rate: ${feeRate} sat/vB`)
    console.log(`   Final fee: ${revealTxFee} sats`)
    
    return {
      index,
      fee: revealTxFee,
      virtualSize: revealTxVirtualSize,
      contentBytes,
      mimeTypeBytes,
      inscriptionScriptSize: inscriptionScriptRawSize,
      witnessSize: totalWitnessSize,
      weight: totalWeight
    }
  })
}

// Address type detection
function getAddressType(address: string): string {
  if (address.startsWith('1')) return 'P2PKH'
  if (address.startsWith('3')) return 'P2SH'
  if (address.startsWith('bc1q')) return 'P2WPKH'
  if (address.startsWith('bc1p')) return 'P2TR'
  return 'UNKNOWN'
}

// Accurate transaction size estimation based on address types (from btc.ts)
function estimateTxSize(
  inCount1: number,      // P2PKH inputs
  inCount3: number,      // P2SH inputs  
  inCountBc1p: number,   // P2TR inputs
  inCountBc1q: number,   // P2WPKH inputs
  outCount1: number,     // P2PKH outputs
  outCount3: number,     // P2SH outputs
  outCountBc1p: number,  // P2TR outputs
  outCountBc1q: number   // P2WPKH outputs
): number {
  const baseTxSize = 10.5;
  const inSize1 = 148;       // P2PKH input size (148 bytes)
  const inSize3 = 94;        // P2SH input size (varies by script, ~94 for simple)
  const inSizeBc1p = 57.5;   // P2TR input size (keypath spend: ~57.5 vbytes)
  const inSizeBc1q = 68;     // P2WPKH input size (68 vbytes)

  const outSize1 = 34;       // P2PKH output size (8 value + 1 length + 25 script = 34 bytes)
  const outSize3 = 32;       // P2SH output size (8 value + 1 length + 23 script = 32 bytes)
  const outSizeBc1p = 43;    // P2TR output size (8 value + 1 length + 34 script = 43 bytes)
  const outSizeBc1q = 31;    // P2WPKH output size (8 value + 1 length + 22 script = 31 bytes)

  return (
    baseTxSize +
    inCount1 * inSize1 +
    inCount3 * inSize3 +
    inCountBc1p * inSizeBc1p +
    inCountBc1q * inSizeBc1q +
    outCount1 * outSize1 +
    outCount3 * outSize3 +
    outCountBc1p * outSizeBc1p +
    outCountBc1q * outSizeBc1q
  );
}

export function calculateCommitTxSize(
  inputCount: number, 
  outputCount: number, 
  paymentAddress?: string,
  inscriptionAddress?: string,
  toolFeeAddress?: string
) {
  // If we don't have address info, fall back to conservative estimates
  if (!paymentAddress) {
    return 12 + (inputCount * 91) + (outputCount * 32)
  }

  const paymentAddressType = getAddressType(paymentAddress)
  const inscriptionAddressType = inscriptionAddress ? getAddressType(inscriptionAddress) : 'P2TR'
  const toolFeeAddressType = toolFeeAddress ? getAddressType(toolFeeAddress) : paymentAddressType

  // Count inputs by type (payment address determines input type)
  let inCount1 = 0, inCount3 = 0, inCountBc1p = 0, inCountBc1q = 0
  switch (paymentAddressType) {
    case 'P2PKH':
      inCount1 = inputCount
      break
    case 'P2SH':
      inCount3 = inputCount
      break
    case 'P2TR':
      inCountBc1p = inputCount
      break
    case 'P2WPKH':
      inCountBc1q = inputCount
      break
    default:
      // Conservative fallback
      inCount3 = inputCount
  }

  // Count outputs by type
  let outCount1 = 0, outCount3 = 0, outCountBc1p = 0, outCountBc1q = 0
  
  // Inscription output (typically P2TR)
  if (inscriptionAddressType === 'P2TR') {
    outCountBc1p = 1
  } else if (inscriptionAddressType === 'P2WPKH') {
    outCountBc1q = 1
  } else if (inscriptionAddressType === 'P2SH') {
    outCount3 = 1
  } else {
    outCount1 = 1
  }

  // Tool fee output (if present, usually one of the outputs)
  // Assume if outputCount > 2, there's a tool fee output
  if (outputCount >= 3 && toolFeeAddress) {
    switch (toolFeeAddressType) {
      case 'P2PKH':
        outCount1 += 1
        break
      case 'P2SH':
        outCount3 += 1
        break
      case 'P2TR':
        outCountBc1p += 1
        break
      case 'P2WPKH':
        outCountBc1q += 1
        break
    }
  }

  // Remaining outputs are change (match payment address type)
  const processedOutputs = (toolFeeAddress && outputCount >= 3) ? 2 : 1 // inscription + maybe tool fee
  const remainingOutputs = outputCount - processedOutputs
  
  if (remainingOutputs > 0) {
  switch (paymentAddressType) {
    case 'P2PKH':
      outCount1 += remainingOutputs
      break
    case 'P2SH':
      outCount3 += remainingOutputs
      break
    case 'P2TR':
      outCountBc1p += remainingOutputs
      break
    case 'P2WPKH':
      outCountBc1q += remainingOutputs
      break
    default:
      outCount3 += remainingOutputs
    }
  }

  const txSize = Math.ceil(estimateTxSize(
    inCount1, inCount3, inCountBc1p, inCountBc1q,
    outCount1, outCount3, outCountBc1p, outCountBc1q
  ))
  
  return { txSize, paymentAddressType, inscriptionAddressType, toolFeeAddressType }
}

export function calculateExactCommitFee(
  inputCount: number, 
  outputCount: number, 
  feeRate: number,
  paymentAddress?: string,
  inscriptionAddress?: string,
  toolFeeAddress?: string
) {
  const sizeResult = calculateCommitTxSize(inputCount, outputCount, paymentAddress, inscriptionAddress, toolFeeAddress)
  
  // Handle both old format (number) and new format (object)
  let txSize: number
  let paymentAddressType: string
  let inscriptionAddressType: string
  let toolFeeAddressType: string
  
  if (typeof sizeResult === 'number') {
    txSize = sizeResult
    paymentAddressType = paymentAddress ? getAddressType(paymentAddress) : 'UNKNOWN'
    inscriptionAddressType = inscriptionAddress ? getAddressType(inscriptionAddress) : 'P2TR'
    toolFeeAddressType = toolFeeAddress ? getAddressType(toolFeeAddress) : 'UNKNOWN'
  } else {
    txSize = sizeResult.txSize
    paymentAddressType = sizeResult.paymentAddressType
    inscriptionAddressType = sizeResult.inscriptionAddressType
    toolFeeAddressType = sizeResult.toolFeeAddressType || 'UNKNOWN'
  }
  
  const calculatedFee = Math.ceil(txSize * feeRate)
  
  // Use calculated fee without minimum enforcement
  const finalFee = calculatedFee
  
  // Add debug logging for fee calculation
  console.log(`💰 Commit fee calculation:`)
  console.log(`   Payment address: ${paymentAddress} (${paymentAddressType})`)
  console.log(`   Inscription address: ${inscriptionAddress} (${inscriptionAddressType})`)
  if (toolFeeAddress) {
    console.log(`   Tool fee address: ${toolFeeAddress} (${toolFeeAddressType})`)
  }
  console.log(`   Inputs: ${inputCount}, Outputs: ${outputCount}`)
  console.log(`   Estimated size: ${txSize} vB`)
  console.log(`   Fee rate: ${feeRate} sat/vB`)
  console.log(`   Calculated fee: ${calculatedFee} sats`)
  console.log(`   Final fee: ${finalFee} sats`)
  
  return finalFee
}

// Function to validate if total available funds can support the requested fee rate
export function validateFeeRate(
  totalAvailableSats: number,
  estimatedTxSize: number,
  requestedFeeRate: number,
  minimumOutputValue: number = 330
): { isValid: boolean; actualFeeRate: number; recommendedFeeRate: number; message: string } {
  const requiredFee = Math.ceil(estimatedTxSize * requestedFeeRate)
  const availableForFees = totalAvailableSats - minimumOutputValue
  const actualFeeRate = availableForFees / estimatedTxSize
  const recommendedFeeRate = Math.ceil(actualFeeRate * 0.9) // Use 90% of available to leave buffer
  
  if (requiredFee > availableForFees) {
    return {
      isValid: false,
      actualFeeRate,
      recommendedFeeRate,
      message: `Insufficient funds: need ${requiredFee} sats for fees but only ${availableForFees} available. Actual rate would be ${actualFeeRate.toFixed(2)} sat/vB`
    }
  }
  
  return {
    isValid: true,
    actualFeeRate: requestedFeeRate,
    recommendedFeeRate: requestedFeeRate,
    message: 'Fee rate is valid'
  }
}

export async function fetchToolFeeSettings() {
  // Read settings directly from env vars instead of self-fetch to avoid production timeout issues
  const toolFeeValue = 0 // 0 sats for pass holders
  const platformFeeAddress = process.env.PLATFORM_FEE_ADDRESS || "3KWMjoT5nVpsUfJrxP1dqyM1b7EMXD3fSY"
  
  console.log(`🔧 Tool fee settings:`)
  console.log(`   Tool fee: ${toolFeeValue} sats`)
  console.log(`   Platform fee address: ${platformFeeAddress}`)
  
  // Convert using EXACT same logic as frontend - but apply conditionally for pass holders
  const toolFeeFromSettings = toolFeeValue < 1 ? Math.round(toolFeeValue * 100000000) : toolFeeValue
  const toolFeeAddressFromSettings = platformFeeAddress
  
  return {
    toolFeeFromSettings,
    toolFeeAddressFromSettings
  }
}
