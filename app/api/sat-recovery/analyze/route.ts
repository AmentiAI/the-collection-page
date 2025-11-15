import { NextRequest, NextResponse } from 'next/server'
import { fetchSandshrewBalances, categoriseWalletAssets } from '@/lib/sandshrew'

export const dynamic = 'force-dynamic'

// Constants for sat recovery
const MIN_INSCRIPTION_UTXO_VALUE = 877 // > 876 sats
const MIN_INSCRIPTION_OUTPUT = 330 // Minimum sats for inscription output
const MIN_PAYMENT_OUTPUT = 546 // Minimum sats for payment output
const MIN_REQUIRED_OUTPUTS = MIN_INSCRIPTION_OUTPUT + MIN_PAYMENT_OUTPUT // 876 sats
const MIN_WORTHWHILE_RECOVERY = 1 // Minimum total recoverable to make it worthwhile

// Transaction size estimates
const TAPROOT_INPUT_VBYTES = 58
const TAPROOT_OUTPUT_VBYTES = 43
const P2WPKH_OUTPUT_VBYTES = 31 // Payment output (P2WPKH) is smaller
const TX_OVERHEAD_VBYTES = 10

interface RecoverableInscription {
  txid: string
  vout: number
  outpoint: string
  value: number
  inscriptions: string[]
  inscriptionOutput: number // 330 sats to taproot
  paymentOutput: number // Remaining (minus fees) to payment wallet
  recoverableSats: number // Net recoverable after fees
  fee: number // Estimated fee for this inscription
}

interface RecoveryAnalysis {
  recoverable: RecoverableInscription[]
  totalRecoverable: number
  totalFee: number
  totalInputs: number
  totalOutputs: number
  estimatedVsize: number
  worthwhile: boolean
  additionalPaymentInput?: {
    txid: string
    vout: number
    value: number
    outpoint: string
  } | null
}

function isTaprootAddress(address: string): boolean {
  // Taproot addresses start with bc1p and are 62 characters long
  return address.startsWith('bc1p') && address.length === 62
}

function estimateTransactionVsize(
  inputCount: number, 
  taprootAddress: string, 
  paymentAddress: string,
  inscriptionInputCount?: number,
  hasChangeOutput?: boolean
): number {
  // For sat recovery transactions:
  // - inputCount total inputs (taproot, 58 vbytes each)
  // - inscriptionInputCount inscription outputs (taproot, 43 vbytes each) - defaults to inputCount
  // - inscriptionInputCount payment outputs (taproot if bc1p, 43 vbytes; P2WPKH if bc1q, 31 vbytes)
  // - 1 change output if hasChangeOutput (same type as payment outputs)
  // - Transaction overhead (10 vbytes)
  
  const actualInscriptionInputs = inscriptionInputCount ?? inputCount
  const inscriptionOutputs = actualInscriptionInputs
  const paymentOutputs = actualInscriptionInputs
  const changeOutputs = hasChangeOutput ? 1 : 0
  
  // Check if payment address is also taproot
  const isPaymentTaproot = isTaprootAddress(paymentAddress)
  const paymentOutputSize = isPaymentTaproot ? TAPROOT_OUTPUT_VBYTES : P2WPKH_OUTPUT_VBYTES
  
  const baseVsize = (
    TX_OVERHEAD_VBYTES +
    inputCount * TAPROOT_INPUT_VBYTES +
    inscriptionOutputs * TAPROOT_OUTPUT_VBYTES +
    paymentOutputs * paymentOutputSize +
    changeOutputs * paymentOutputSize
  )
  
  // Add buffer to account for witness data variations
  // 1% buffer for P2WPKH addresses
  // No buffer for taproot addresses (they're more predictable, and we want to avoid overestimation)
  if (!isPaymentTaproot) {
    return Math.ceil(baseVsize * 1.01)
  }
  
  // For all-taproot transactions, return base size without buffer
  // Taproot transactions have more predictable witness data, so we don't need a buffer
  return baseVsize
}

function calculateRecoverableForInscription(
  value: number,
  feeRate: number,
  taprootAddress: string,
  paymentAddress: string,
): { recoverable: number; fee: number; inscriptionOutput: number; paymentOutput: number } {
  // For a single inscription recovery:
  // - 1 input (taproot inscription UTXO)
  // - 2 outputs (taproot inscription output + payment output)
  const vsize = estimateTransactionVsize(1, taprootAddress, paymentAddress)
  const fee = Math.ceil(vsize * feeRate)
  
  // Calculate outputs after fee
  const remainingAfterFee = value - fee
  const inscriptionOutput = MIN_INSCRIPTION_OUTPUT // Always 330 to taproot
  const paymentOutput = Math.max(MIN_PAYMENT_OUTPUT, remainingAfterFee - inscriptionOutput)
  
  // Recoverable is the excess over minimum required outputs
  const recoverable = value - inscriptionOutput - paymentOutput - fee
  
  return {
    recoverable: Math.max(0, recoverable),
    fee,
    inscriptionOutput,
    paymentOutput: Math.max(MIN_PAYMENT_OUTPUT, paymentOutput),
  }
}

export async function POST(request: NextRequest) {
  try {
    const { address, feeRate = 12, taprootAddress, paymentAddress } = await request.json()

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Address is required' },
        { status: 400 },
      )
    }

    const numericFeeRate = typeof feeRate === 'number' ? feeRate : Number.parseFloat(String(feeRate))
    if (!Number.isFinite(numericFeeRate) || numericFeeRate <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid fee rate' },
        { status: 400 },
      )
    }

    // Fetch wallet balances
    const balances = await fetchSandshrewBalances(address)
    const assets = categoriseWalletAssets(address, balances)

    // Filter inscriptions with value > 876
    // We include ALL inscriptions > 876, then do batch calculation
    // Individual calculations don't matter - batch transaction is more efficient
    const recoverableInscriptions: RecoverableInscription[] = []

    for (const inscription of assets.inscriptions) {
      if (inscription.value > MIN_INSCRIPTION_UTXO_VALUE) {
        recoverableInscriptions.push({
          txid: inscription.txid,
          vout: inscription.vout,
          outpoint: inscription.outpoint,
          value: inscription.value,
          inscriptions: inscription.inscriptions,
          // These will be recalculated in batch
          inscriptionOutput: 0,
          paymentOutput: 0,
          recoverableSats: 0,
          fee: 0,
        })
      }
    }

    if (recoverableInscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        analysis: {
          recoverable: [],
          totalRecoverable: 0,
          totalFee: 0,
          totalInputs: 0,
          totalOutputs: 0,
          estimatedVsize: 0,
          worthwhile: false,
        },
      })
    }

    // Calculate totals for batch transaction
    const totalInputs = recoverableInscriptions.length
    const totalOutputs = recoverableInscriptions.length * 2 // Each inscription gets 2 outputs (inscription + payment)
    
    // Use provided addresses or default to assuming taproot for payment if not provided
    // If addresses aren't provided, we'll default to taproot (bc1p) which is larger
    // Default to a valid taproot address format for checking
    const estimatedTaprootAddr = taprootAddress || address || 'bc1p000000000000000000000000000000000000000000000000000000000000000'
    const estimatedPaymentAddr = paymentAddress || address || 'bc1p000000000000000000000000000000000000000000000000000000000000000'
    
    const batchVsize = estimateTransactionVsize(totalInputs, estimatedTaprootAddr, estimatedPaymentAddr)
    const batchFee = Math.ceil(batchVsize * numericFeeRate)
    
    const isPaymentTaproot = isTaprootAddress(estimatedPaymentAddr)
    const paymentOutputSize = isPaymentTaproot ? TAPROOT_OUTPUT_VBYTES : P2WPKH_OUTPUT_VBYTES
    
    console.log('[sat-recovery/analyze]', {
      totalInputs,
      totalOutputs,
      batchVsize,
      batchFee,
      feeRate: numericFeeRate,
      paymentAddress: estimatedPaymentAddr,
      isPaymentTaproot,
      paymentOutputSize,
    })
    
    // Calculate total input value
    const totalInputValue = recoverableInscriptions.reduce((sum, ins) => sum + ins.value, 0)
    
    // FIFO RULE: Each input maps to its two outputs in order
    // Fees are ONLY deducted from the very last output (unless payment input is added)
    let totalPaymentOutputs = 0
    const minPaymentOutputs = totalInputs * MIN_PAYMENT_OUTPUT
    let totalRecoverable = 0
    
    const correctedRecoverable = recoverableInscriptions.map((ins, index) => {
      const isLast = index === totalInputs - 1
      
      // Inscription output: always 330
      const inscriptionOutput = MIN_INSCRIPTION_OUTPUT
      
      // Payment output: input_value - 330, minus fees if last (and no payment input will be added)
      let paymentOutput = ins.value - MIN_INSCRIPTION_OUTPUT
      if (isLast) {
        paymentOutput = paymentOutput - batchFee
      }
      
      // Ensure payment output meets minimum (546)
      // If it doesn't, we'll adjust it and the fee will be higher
      const actualPaymentOutput = Math.max(MIN_PAYMENT_OUTPUT, paymentOutput)
      
      totalPaymentOutputs += actualPaymentOutput
      
      // Recoverable per inscription: what we free up minus gas
      // For non-last: (input - 330) - 0 = input - 330 (no gas deducted)
      // For last: (input - 330) - fees = input - 330 - fees
      const freedSats = ins.value - MIN_INSCRIPTION_OUTPUT
      const recoverableSats = isLast 
        ? freedSats - batchFee  // Last one pays fees
        : freedSats              // Others don't pay fees
      
      totalRecoverable += Math.max(0, recoverableSats) // Can't be negative
      
      // Fee share for display (only last input pays fees, unless payment input is added)
      const feeShare = isLast ? batchFee : 0
      
      return {
        ...ins,
        inscriptionOutput,
        paymentOutput: actualPaymentOutput,
        recoverableSats: Math.max(0, recoverableSats),
        fee: feeShare,
      }
    })
    
    // Check if the last payment output (before adjustment) was below minimum
    const lastInscription = recoverableInscriptions[totalInputs - 1]
    const lastPaymentOutputBeforeAdjustment = lastInscription.value - MIN_INSCRIPTION_OUTPUT - batchFee
    
    // Verify payment outputs meet minimum
    // Only return early if ALL payment outputs would be below minimum
    // (i.e., even the first ones without fees are too small)
    const firstPaymentOutput = recoverableInscriptions[0].value - MIN_INSCRIPTION_OUTPUT
    if (firstPaymentOutput < MIN_PAYMENT_OUTPUT) {
      // Even without fees, the payment output is too small
      console.log('[sat-recovery/analyze] Payment output too small even without fees:', firstPaymentOutput, '<', MIN_PAYMENT_OUTPUT)
      return NextResponse.json({
        success: true,
        analysis: {
          recoverable: [],
          totalRecoverable: 0,
          totalFee: batchFee,
          totalInputs: 0,
          totalOutputs: 0,
          estimatedVsize: batchVsize,
          worthwhile: false,
        },
      })
    }
    
    // If last payment output is below minimum, try to add a payment UTXO to cover the shortfall
    // OR if total recoverable is below minimum, add a payment UTXO to boost it to at least 546
    let additionalPaymentInput: { txid: string; vout: number; value: number; outpoint: string } | null = null
    let finalInputs = totalInputs
    let finalVsize = batchVsize
    let finalFee = batchFee
    let finalTotalRecoverable = 0
    let finalCorrectedRecoverable = correctedRecoverable
    let newTotalInputValue = totalInputValue
    let changeOutput = 0
    
    // Calculate current total recoverable (before adding payment input)
    const currentTotalRecoverable = correctedRecoverable.reduce((sum, ins) => sum + ins.recoverableSats, 0)
    
    // Add payment input if:
    // 1. Last payment output is below minimum (shortfall)
    // Note: We don't add payment input just for low recoverable - only for shortfall
    // If recoverable is low, that's fine - we just won't proceed with recovery
    const needsPaymentInput = lastPaymentOutputBeforeAdjustment < MIN_PAYMENT_OUTPUT
    
    if (needsPaymentInput && paymentAddress) {
      const shortfall = MIN_PAYMENT_OUTPUT - lastPaymentOutputBeforeAdjustment
      
      console.log('[sat-recovery/analyze] Need payment UTXO for shortfall, attempting to add:', {
        lastPaymentOutputBeforeAdjustment,
        minRequired: MIN_PAYMENT_OUTPUT,
        shortfall,
        currentTotalRecoverable,
        paymentAddress,
        hasPaymentAddress: !!paymentAddress,
      })
      
      try {
        // Fetch payment address balances
        const paymentBalances = await fetchSandshrewBalances(paymentAddress)
        const paymentAssets = categoriseWalletAssets(paymentAddress, paymentBalances)
        
        // Calculate minimum payment input needed:
        // - Shortfall (payment output < 546)
        // - Fees (estimated, will recalculate after adding input)
        // - Minimum change output (546 sats)
        // We don't need to boost recoverable - payment input is only for shortfall
        const paymentShortfall = MIN_PAYMENT_OUTPUT - lastPaymentOutputBeforeAdjustment
        // Estimate fees with one additional input (rough estimate)
        // When payment input is added: totalInputs inscription inputs + 1 payment input
        // Outputs: totalInputs inscription + totalInputs payment + 1 change (if >= 546)
        const estimatedAdditionalVsize = estimateTransactionVsize(totalInputs + 1, estimatedTaprootAddr, estimatedPaymentAddr, totalInputs, true)
        const estimatedAdditionalFee = Math.ceil(estimatedAdditionalVsize * numericFeeRate)
        // Minimum change needed: 546 (minimum output size)
        const minChangeNeeded = MIN_PAYMENT_OUTPUT
        const minPaymentInputNeeded = paymentShortfall + estimatedAdditionalFee + minChangeNeeded
        
        // Find a suitable payment UTXO (spendable, large enough to cover needs)
        const MIN_PAYMENT_INPUT_SATS = Math.max(600, minPaymentInputNeeded)
        const suitablePaymentUtxos = paymentAssets.spendable
          .filter((utxo) => utxo.value >= MIN_PAYMENT_INPUT_SATS)
          .sort((a, b) => b.value - a.value) // Sort by value descending
        
        if (suitablePaymentUtxos.length > 0) {
          // Use the first suitable payment UTXO
          const paymentUtxo = suitablePaymentUtxos[0]
          additionalPaymentInput = {
            txid: paymentUtxo.txid,
            vout: paymentUtxo.vout,
            value: paymentUtxo.value,
            outpoint: paymentUtxo.outpoint,
          }
          
          // Recalculate with the additional input
          finalInputs = totalInputs + 1
          // When payment input is added: totalInputs inscription inputs + 1 payment input
          // Outputs: totalInputs inscription + totalInputs payment + 1 change (if >= 546)
          // We'll estimate assuming change output exists (worst case for fee estimation)
          finalVsize = estimateTransactionVsize(finalInputs, estimatedTaprootAddr, estimatedPaymentAddr, totalInputs, true)
          finalFee = Math.ceil(finalVsize * numericFeeRate)
          
          // Recalculate recoverable with the new fee structure
          // The additional payment input will add its value, and we'll need to add a change output
          const additionalInputValue = paymentUtxo.value
          newTotalInputValue = totalInputValue + additionalInputValue
          
          // When payment input is added, fees come ONLY from the payment input
          // Inscription outputs: 330 to taproot, (input_value - 330) to payment wallet (NO fees deducted)
          // Recoverable = what we free from inscriptions (NO fees deducted from individual inscriptions)
          // For a 1000 sat UTXO: 330 to inscription, 670 freed, recoverable = 670 (no fees deducted)
          // Fees will be deducted from TOTAL recoverable, not per inscription
          finalCorrectedRecoverable = recoverableInscriptions.map((ins, index) => {
            const inscriptionOutput = MIN_INSCRIPTION_OUTPUT
            // Payment output is just input_value - 330 (no fees deducted)
            const paymentOutput = ins.value - MIN_INSCRIPTION_OUTPUT
            
            // Recoverable per inscription = what we free up (NO fees deducted - payment input pays all fees)
            // Example: 1000 sat UTXO -> 670 freed -> 670 recoverable
            const recoverableSats = paymentOutput
            
            // Fee share for display: distribute fees proportionally across inscriptions
            // This is just for display - actual fees are paid by payment input
            const feeShare = Math.floor(finalFee / totalInputs)
            
            return {
              ...ins,
              inscriptionOutput,
              paymentOutput,
              recoverableSats,
              fee: feeShare, // Show fee share for display purposes
            }
          })
          
          // Calculate shortfall: if any payment output is below minimum
          const lastInscriptionPaymentOutput = finalCorrectedRecoverable[totalInputs - 1].paymentOutput
          const shortfall = lastInscriptionPaymentOutput < MIN_PAYMENT_OUTPUT 
            ? MIN_PAYMENT_OUTPUT - lastInscriptionPaymentOutput 
            : 0
          
          // If there's a shortfall, we need to adjust the payment output to minimum
          // The payment input will cover the shortfall, but recoverable stays the same
          // (it's what we free from the inscription, not what we output)
          if (shortfall > 0) {
            const lastIndex = totalInputs - 1
            // Adjust payment output to minimum (payment input will cover shortfall)
            finalCorrectedRecoverable[lastIndex].paymentOutput = MIN_PAYMENT_OUTPUT
            // Recoverable is what we free: (input - 330) - 546
            // Even if we need to top up to 546, the recoverable is still the excess we free
            // But if payment output < 546, there's no excess, so recoverable is 0
            // This is already calculated correctly above
          }
          
          // Recalculate after shortfall adjustment
          const adjustedInscriptionPaymentOutputs = finalCorrectedRecoverable.reduce((sum, ins) => sum + ins.paymentOutput, 0)
          const totalInscriptionOutputs = finalInputs * MIN_INSCRIPTION_OUTPUT
          const adjustedInscriptionOutputsValue = totalInscriptionOutputs + adjustedInscriptionPaymentOutputs
          
          // Change output = payment input value - shortfall - fees
          // The payment input covers: shortfall + fees
          // Change = payment_input - shortfall - fees
          // (shortfall was already calculated above)
          changeOutput = additionalInputValue - shortfall - finalFee
          
          // Recoverable = what we free from inscriptions MINUS fees
          // Change output from payment input is NOT recoverable - it's just change
          // Payment input is only added to cover shortfall, not to boost recoverable
          const inscriptionRecoverable = finalCorrectedRecoverable.reduce((sum, ins) => sum + ins.recoverableSats, 0)
          
          // Total recoverable = what we free from inscriptions MINUS fees
          // Example: 1,340 sats freed - 442 sats fees = 898 sats recoverable
          finalTotalRecoverable = inscriptionRecoverable - finalFee
          
          console.log('[sat-recovery/analyze] Added payment UTXO to cover shortfall:', {
            paymentUtxo: additionalPaymentInput,
            additionalInputValue,
            newTotalInputValue,
            finalFee,
            shortfall,
            changeOutput,
            finalTotalRecoverable,
            lastPaymentOutput: finalCorrectedRecoverable[totalInputs - 1].paymentOutput,
            lastPaymentOutputBeforeAdjustment: lastInscriptionPaymentOutput,
            inscriptionRecoverable,
          })
        } else {
          console.log('[sat-recovery/analyze] No suitable payment UTXOs found to cover shortfall', {
            paymentAddress,
            spendableCount: paymentAssets?.spendable?.length || 0,
            suitableCount: suitablePaymentUtxos.length,
          })
        }
      } catch (error) {
        console.error('[sat-recovery/analyze] Error fetching payment address balances:', error, {
          paymentAddress,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      }
    } else if (lastPaymentOutputBeforeAdjustment < MIN_PAYMENT_OUTPUT && !paymentAddress) {
      console.log('[sat-recovery/analyze] Last payment output below minimum but no payment address provided:', {
        lastPaymentOutputBeforeAdjustment,
        minRequired: MIN_PAYMENT_OUTPUT,
        paymentAddress,
      })
    }
    
    // Recalculate totals after adjustments
    if (additionalPaymentInput === null) {
      finalTotalRecoverable = correctedRecoverable.reduce((sum, ins) => sum + ins.recoverableSats, 0)
      totalPaymentOutputs = correctedRecoverable.reduce((sum, ins) => sum + ins.paymentOutput, 0)
    } else {
      totalPaymentOutputs = finalCorrectedRecoverable.reduce((sum, ins) => sum + ins.paymentOutput, 0)
    }
    
    const lastPaymentOutput = finalCorrectedRecoverable[totalInputs - 1].paymentOutput
    
    console.log('[sat-recovery/analyze] FIFO calculation:', {
      totalInputValue,
      totalInscriptionOutputs: finalInputs * MIN_INSCRIPTION_OUTPUT,
      finalFee,
      totalPaymentOutputs,
      lastPaymentOutputBeforeAdjustment,
      lastPaymentOutput,
      minRequired: MIN_PAYMENT_OUTPUT,
      additionalPaymentInput: additionalPaymentInput ? {
        outpoint: additionalPaymentInput.outpoint,
        value: additionalPaymentInput.value,
      } : null,
      finalTotalRecoverable,
    })
    
    // Calculate total output value
    const totalOutputValue = (totalInputs * MIN_INSCRIPTION_OUTPUT) + totalPaymentOutputs
    const actualFee = totalInputValue - totalOutputValue
    
    console.log('[sat-recovery/analyze] Fee check:', {
      estimatedFee: batchFee,
      actualFee,
      difference: Math.abs(actualFee - batchFee),
    })
    
    console.log('[sat-recovery/analyze] Recoverable (FIFO):', {
      totalPaymentOutputs,
      minPaymentOutputs,
      totalRecoverable: finalTotalRecoverable,
      worthwhile: finalTotalRecoverable >= MIN_WORTHWHILE_RECOVERY,
      additionalPaymentInput: additionalPaymentInput ? {
        outpoint: additionalPaymentInput.outpoint,
        value: additionalPaymentInput.value,
      } : null,
    })
    
    const worthwhile = finalTotalRecoverable >= MIN_WORTHWHILE_RECOVERY

    const analysis: RecoveryAnalysis = {
      recoverable: finalCorrectedRecoverable,
      totalRecoverable: Math.max(0, finalTotalRecoverable),
      totalFee: finalFee,
      totalInputs: finalInputs,
      totalOutputs: finalInputs * 2 + (additionalPaymentInput && changeOutput >= MIN_PAYMENT_OUTPUT ? 1 : 0), // Each inscription has 2 outputs, plus change if payment input added and change >= 546
      estimatedVsize: finalVsize,
      worthwhile,
      additionalPaymentInput: additionalPaymentInput || null,
    }

    return NextResponse.json({
      success: true,
      analysis,
    })
  } catch (error) {
    console.error('[sat-recovery/analyze] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze recoverable sats',
      },
      { status: 500 },
    )
  }
}

