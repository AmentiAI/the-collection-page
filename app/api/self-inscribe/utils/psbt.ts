import * as bitcoin from 'bitcoinjs-lib'
import { getBitcoinNetwork, addInputSigningInfo } from './bitcoin'
import { RareSatUtxo } from './utxo'
import { calculateExactCommitFee } from './fees'

export interface CommitTransactionData {
  inscriptionIndex: number
  psbt: bitcoin.Psbt
  commitOutputIndex: number
  actualCommitFee: number
  totalInputValue: number
  totalOutputValue: number
  usedRareSat: boolean
}

export function createCommitPsbt(
  inscriptionAddress: string,
  outputValue: number,
  utxos: any[],
  paymentAddress: string,
  paymentPubkey: string,
  taprootPubkey: string | undefined,
  userAddress: string,
  rareSatUtxo: RareSatUtxo | undefined,
  feeRate: number,
  toolFeeInSats: number,
  toolFeeAddress: string,
  inscriptionIndex: number,
  burnEntireUtxo?: boolean
): CommitTransactionData {
  const psbt = new bitcoin.Psbt({ network: getBitcoinNetwork() })
  const addressScript = bitcoin.address.toOutputScript(paymentAddress, getBitcoinNetwork())
  
  let accSats = 0
  let counter = 0
  let rareSatValue = 0
  let usedRareSat = false

  // Add rare sat UTXO as first input if provided (only for first inscription)
  if (rareSatUtxo && inscriptionIndex === 0) {
    console.log(`🎯 Adding rare sat UTXO as Input #0 (first inscription only)`)
    
    const [rareTxid, rareVout] = rareSatUtxo.id.split(':')
    const rareSatAddressScript = bitcoin.address.toOutputScript(userAddress, getBitcoinNetwork())
    
    psbt.addInput({
      hash: rareTxid,
      index: parseInt(rareVout),
      witnessUtxo: { value: BigInt(rareSatUtxo.value), script: rareSatAddressScript },
    })

    addInputSigningInfo(psbt, counter, userAddress, paymentPubkey, taprootPubkey, rareSatUtxo.value)
    
    counter++
    accSats += 1 // Only use 1 sat from rare sat UTXO for inscription 
    rareSatValue = rareSatUtxo.value
    usedRareSat = true
  }

  // Calculate what this single commit transaction needs
  // CRITICAL: Must include tool fee in target calculation to select enough UTXOs
  const singleCommitTarget = outputValue + toolFeeInSats + Math.ceil(280 * feeRate) // output + tool fee + estimated fee
  
  // Add payment inputs for remaining fees
  for (const utxo of utxos) {
    psbt.addInput({
      hash: utxo.outpoint.split(':')[0],
      index: parseInt(utxo.outpoint.split(':')[1]),
      witnessUtxo: { value: BigInt(utxo.value), script: addressScript },
    })

    addInputSigningInfo(psbt, counter, paymentAddress, paymentPubkey, taprootPubkey, utxo.value)

    counter++
    accSats += utxo.value

    // Break when we have enough for this single commit transaction
    if (accSats >= singleCommitTarget) {
      console.log(`   ✅ Sufficient funds for commit ${inscriptionIndex + 1}: ${accSats} >= ${singleCommitTarget}`)
      break
    }
  }
  
  const totalInputSats = accSats + (rareSatValue || 0)
  let rareSatPreservation = 0
  let commitOutputIndex = 0

  // RARE SAT PRESERVATION: Add preservation output if rare UTXO has multiple rare sats (only for first inscription)
  if (rareSatUtxo && inscriptionIndex === 0) {
    const totalRareSats = rareSatUtxo.sats?.reduce((total, sat) => {
      const rangeSize = sat.sat[1] - sat.sat[0] + 1
      console.log(`🔍 Rare sat range: [${sat.sat[0]}, ${sat.sat[1]}] = ${rangeSize} sats, types: ${sat.types?.join(', ') || 'none'}`)
      return total + rangeSize
    }, 0) || 0
    
    console.log(`🎯 RARE SAT ANALYSIS:`)
    console.log(`   UTXO value: ${rareSatUtxo.value} sats`)
    console.log(`   Total rare sats: ${totalRareSats}`)
    console.log(`   Sat ranges count: ${rareSatUtxo.sats?.length || 0}`)
    console.log(`   Raw sats data:`, JSON.stringify(rareSatUtxo.sats, null, 2))
    
    if (totalRareSats > 1) {
      // Multiple rare sats - check if user wants to burn entire UTXO
      if (burnEntireUtxo) {
        console.log(`🔥 BURNING ENTIRE UTXO: All ${totalRareSats} rare sats will be used for inscription`)
        // No preservation output needed - all rare sats go to inscription
      } else {
        // Preserve extra rare sats
        if (rareSatUtxo.value <= 330) {
          throw new Error('Cannot use rare sat UTXO: UTXO has multiple rare sats but is only 330 sats (already split)')
        }
        
        const paddingforRares = rareSatUtxo.value - totalRareSats
        if (paddingforRares > 0) {
          rareSatPreservation = rareSatUtxo.value - paddingforRares - 1
        } else {
          rareSatPreservation = rareSatUtxo.value - 1 // Return all but 1 rare sat
        }
        
        // Validate preservation output meets minimum dust threshold
        if (rareSatPreservation < 330) {
          throw new Error(`Cannot preserve rare sats: preservation output would be ${rareSatPreservation} sats (minimum 330 required)`)
        }
         
        psbt.addOutput({
          value: BigInt(rareSatPreservation),
          address: userAddress, // Return to same address as input 0
        })
        
        // When rare sat preservation is added, inscriber output moves to index 1
        commitOutputIndex = 1
        console.log(`🎯 Multiple rare sats: preserving ${rareSatPreservation} sats, using 1 sat for inscription`)
      }
    } else {
      // Single rare sat - no preservation needed, use entire UTXO
      console.log(`✅ Single rare sat UTXO: using entire ${rareSatUtxo.value} sats for inscription (no preservation needed)`)
    }
  }

  // Add the inscription output for this commit transaction
  psbt.addOutput({
    value: BigInt(outputValue),
    address: inscriptionAddress,
  })

  // Calculate exact fee and outputs
  const willHaveToolFeeOutput = toolFeeInSats > 0 && toolFeeAddress && inscriptionIndex === 0
  const currentOutputCount = (rareSatPreservation > 0 ? 1 : 0) + 1 // preservation + inscription output
  const willHaveChangeOutput = (totalInputSats - outputValue - rareSatPreservation - (willHaveToolFeeOutput ? toolFeeInSats : 0)) > 330
  const expectedOutputCount = currentOutputCount + (willHaveToolFeeOutput ? 1 : 0) + (willHaveChangeOutput ? 1 : 0)
  
  const exactCommitFee = calculateExactCommitFee(
    psbt.inputCount, 
    expectedOutputCount, 
    feeRate,
    paymentAddress,
    inscriptionAddress
  )
  
  // Calculate change output that leaves EXACTLY the right fee
  const requiredOutputs = rareSatPreservation + outputValue + (willHaveToolFeeOutput ? toolFeeInSats : 0)
  const availableForChange = totalInputSats - requiredOutputs - exactCommitFee

  // Add tool fee output (before change output) - only for first transaction
  if (willHaveToolFeeOutput) {
    psbt.addOutput({
      value: BigInt(toolFeeInSats),
      address: toolFeeAddress,
    })
  }
  
  // Add change output with exact calculation
  if (availableForChange > 330) {
    psbt.addOutput({
      value: BigInt(availableForChange),
      address: paymentAddress,
    })
  }

  // Calculate actual fee
  const totalOutputValue = psbt.txOutputs.reduce((sum, output) => sum + Number(output.value), 0)
  const actualCommitFee = totalInputSats - totalOutputValue

  return {
    inscriptionIndex,
    psbt,
    commitOutputIndex,
    actualCommitFee,
    totalInputValue: totalInputSats,
    totalOutputValue,
    usedRareSat
  }
}

// New function for creating a single PSBT with multiple inscription outputs
export function createMultiCommitPsbt(
  inscriptionAddresses: Array<{address: string, outputValue: number}>,
  utxos: any[],
  paymentAddress: string,
  paymentPubkey: string,
  taprootPubkey: string | undefined,
  userAddress: string,
  rareSatUtxo: RareSatUtxo | undefined,
  feeRate: number,
  toolFeeInSats: number,
  toolFeeAddress: string
): {
  psbt: bitcoin.Psbt,
  commitOutputIndices: number[],
  actualCommitFee: number,
  totalInputValue: number,
  totalOutputValue: number,
  usedRareSat: boolean,
  usedUtxos: string[]
} {
  const psbt = new bitcoin.Psbt({ network: getBitcoinNetwork() })
  const addressScript = bitcoin.address.toOutputScript(paymentAddress, getBitcoinNetwork())
  
  let accSats = 0
  let counter = 0
  let rareSatValue = 0
  let usedRareSat = false

  // Add rare sat UTXO as first input if provided
  if (rareSatUtxo) {
    console.log(`🎯 Adding rare sat UTXO as Input #0 for multi-inscription commit`)
    
    const [rareTxid, rareVout] = rareSatUtxo.id.split(':')
    const rareSatAddressScript = bitcoin.address.toOutputScript(userAddress, getBitcoinNetwork())
    
    psbt.addInput({
      hash: rareTxid,
      index: parseInt(rareVout),
      witnessUtxo: { value: BigInt(rareSatUtxo.value), script: rareSatAddressScript },
    })

    addInputSigningInfo(psbt, counter, userAddress, paymentPubkey, taprootPubkey, rareSatUtxo.value)
    
    counter++
    accSats += 1 // Only use 1 sat from rare sat UTXO for first inscription 
    rareSatValue = rareSatUtxo.value
    usedRareSat = true
  }

  // Calculate total needed for all inscriptions
  const totalInscriptionValue = inscriptionAddresses.reduce((sum, addr) => sum + addr.outputValue, 0)
  const estimatedTxSize = 50 + (utxos.length * 150) + (inscriptionAddresses.length * 34) + (toolFeeInSats > 0 ? 34 : 0) + 34 // base + inputs + inscription outputs + tool fee + change
  const estimatedFee = Math.ceil(estimatedTxSize * feeRate)
  const totalNeeded = totalInscriptionValue + estimatedFee + toolFeeInSats

  console.log(`💰 Multi-commit calculation:`)
  console.log(`   Total inscription value: ${totalInscriptionValue} sats`)
  console.log(`   Estimated fee: ${estimatedFee} sats`)
  console.log(`   Tool fee: ${toolFeeInSats} sats`)
  console.log(`   Total needed: ${totalNeeded} sats`)

  // Add payment inputs for remaining fees
  for (const utxo of utxos) {
    if (accSats >= totalNeeded) break

    psbt.addInput({
      hash: utxo.outpoint.split(':')[0],
      index: parseInt(utxo.outpoint.split(':')[1]),
      witnessUtxo: { value: BigInt(utxo.value), script: addressScript },
    })

    addInputSigningInfo(psbt, counter, paymentAddress, paymentPubkey, taprootPubkey, utxo.value)
    
    counter++
    accSats += utxo.value
  }

  console.log(`📊 Multi-commit inputs: ${counter} inputs, ${accSats} sats total`)

  // Add inscription outputs and track their indices
  const commitOutputIndices: number[] = []
  let currentOutputIndex = 0

  // Add rare sat preservation output first if needed
  if (usedRareSat && rareSatValue > 1) {
    const rareSatPreservation = rareSatValue - 1
    psbt.addOutput({
      value: BigInt(rareSatPreservation),
      address: userAddress
    })
    console.log(`🎯 Output ${currentOutputIndex}: Rare sat preservation (${rareSatPreservation} sats)`)
    currentOutputIndex++
  }

  // Add inscription outputs
  inscriptionAddresses.forEach((addr, index) => {
    psbt.addOutput({
      value: BigInt(addr.outputValue),
      address: addr.address
    })
    commitOutputIndices.push(currentOutputIndex)
    console.log(`📝 Output ${currentOutputIndex}: Inscription ${index + 1} (${addr.outputValue} sats) -> ${addr.address.substring(0, 20)}...`)
    currentOutputIndex++
  })

  // Add tool fee output if needed
  if (toolFeeInSats > 0 && toolFeeAddress) {
    psbt.addOutput({
      value: BigInt(toolFeeInSats),
      address: toolFeeAddress
    })
    console.log(`🔧 Output ${currentOutputIndex}: Tool fee (${toolFeeInSats} sats)`)
    currentOutputIndex++
  }

  // Calculate exact fee and add change
  const exactCommitFee = calculateExactCommitFee(
    psbt.inputCount, 
    currentOutputIndex + 1, // +1 for change output
    feeRate,
    paymentAddress
  )

  const totalOutputValue = (usedRareSat ? rareSatValue - 1 : 0) + totalInscriptionValue + toolFeeInSats
  const changeAmount = accSats - totalOutputValue - exactCommitFee

  if (changeAmount > 330) {
    psbt.addOutput({
      value: BigInt(changeAmount),
      address: paymentAddress
    })
    console.log(`💰 Output ${currentOutputIndex}: Change (${changeAmount} sats)`)
  } else if (changeAmount < 0) {
    throw new Error(`Insufficient funds: need ${Math.abs(changeAmount)} more sats`)
  }

  const finalTotalOutputValue = totalOutputValue + (changeAmount > 330 ? changeAmount : 0)

  console.log(`✅ Multi-commit PSBT created:`)
  console.log(`   Inputs: ${psbt.inputCount} (${accSats} sats)`)
  console.log(`   Outputs: ${psbt.txOutputs.length} (${finalTotalOutputValue} sats)`)
  console.log(`   Fee: ${exactCommitFee} sats`)
  console.log(`   Inscription outputs at indices: [${commitOutputIndices.join(', ')}]`)

  // Track which UTXOs were used (excluding rare sat UTXO)
  const usedUtxos: string[] = []
  let utxoIndex = 0
  let tempAccSats = usedRareSat ? 1 : 0 // Start with rare sat value if used
  
  for (const utxo of utxos) {
    if (tempAccSats >= totalNeeded) break
    usedUtxos.push(utxo.outpoint)
    tempAccSats += utxo.value
    utxoIndex++
  }

  return {
    psbt,
    commitOutputIndices,
    actualCommitFee: exactCommitFee,
    totalInputValue: accSats,
    totalOutputValue: finalTotalOutputValue,
    usedRareSat,
    usedUtxos
  }
}
