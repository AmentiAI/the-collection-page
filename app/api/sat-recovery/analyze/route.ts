import { NextRequest, NextResponse } from 'next/server'
import { fetchSandshrewBalances, categoriseWalletAssets } from '@/lib/sandshrew'

export const dynamic = 'force-dynamic'

// Constants for sat recovery
const MIN_INSCRIPTION_UTXO_VALUE = 877 // > 876 sats
const MIN_INSCRIPTION_OUTPUT = 330 // Minimum sats for inscription output
const MIN_PAYMENT_OUTPUT = 546 // Minimum sats for payment output
const MIN_REQUIRED_OUTPUTS = MIN_INSCRIPTION_OUTPUT + MIN_PAYMENT_OUTPUT // 876 sats
const MIN_WORTHWHILE_RECOVERY = 1000 // Minimum total recoverable to make it worthwhile

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
}

function isTaprootAddress(address: string): boolean {
  // Taproot addresses start with bc1p and are 62 characters long
  return address.startsWith('bc1p') && address.length === 62
}

function estimateTransactionVsize(inputCount: number, taprootAddress: string, paymentAddress: string): number {
  // For sat recovery transactions:
  // - inputCount taproot inputs (58 vbytes each)
  // - inputCount inscription outputs (taproot, 43 vbytes each)
  // - inputCount payment outputs (taproot if bc1p, 43 vbytes; P2WPKH if bc1q, 31 vbytes)
  // - Transaction overhead (10 vbytes)
  
  const inscriptionOutputs = inputCount
  const paymentOutputs = inputCount
  
  // Check if payment address is also taproot
  const isPaymentTaproot = isTaprootAddress(paymentAddress)
  const paymentOutputSize = isPaymentTaproot ? TAPROOT_OUTPUT_VBYTES : P2WPKH_OUTPUT_VBYTES
  
  return (
    TX_OVERHEAD_VBYTES +
    inputCount * TAPROOT_INPUT_VBYTES +
    inscriptionOutputs * TAPROOT_OUTPUT_VBYTES +
    paymentOutputs * paymentOutputSize
  )
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
    // Fees are ONLY deducted from the very last output
    let totalPaymentOutputs = 0
    const minPaymentOutputs = totalInputs * MIN_PAYMENT_OUTPUT
    let totalRecoverable = 0
    
    const correctedRecoverable = recoverableInscriptions.map((ins, index) => {
      const isLast = index === totalInputs - 1
      
      // Inscription output: always 330
      const inscriptionOutput = MIN_INSCRIPTION_OUTPUT
      
      // Payment output: input_value - 330, minus fees if last
      let paymentOutput = ins.value - MIN_INSCRIPTION_OUTPUT
      if (isLast) {
        paymentOutput = paymentOutput - batchFee
      }
      
      totalPaymentOutputs += paymentOutput
      
      // Recoverable per inscription: payment output - minimum required (546)
      const recoverableSats = Math.max(0, paymentOutput - MIN_PAYMENT_OUTPUT)
      totalRecoverable += recoverableSats
      
      // Fee share for display (only last input pays fees)
      const feeShare = isLast ? batchFee : 0
      
      return {
        ...ins,
        inscriptionOutput,
        paymentOutput,
        recoverableSats,
        fee: feeShare,
      }
    })
    
    // Check if the last payment output meets minimum
    const lastInscription = recoverableInscriptions[totalInputs - 1]
    const lastPaymentOutput = lastInscription.value - MIN_INSCRIPTION_OUTPUT - batchFee
    
    console.log('[sat-recovery/analyze] FIFO calculation:', {
      totalInputValue,
      totalInscriptionOutputs: totalInputs * MIN_INSCRIPTION_OUTPUT,
      batchFee,
      totalPaymentOutputs,
      lastPaymentOutput,
      minRequired: MIN_PAYMENT_OUTPUT,
    })
    
    // Verify payment outputs meet minimum
    if (lastPaymentOutput < MIN_PAYMENT_OUTPUT) {
      // Not enough to recover after fees
      console.log('[sat-recovery/analyze] Last payment output too small:', lastPaymentOutput, '<', MIN_PAYMENT_OUTPUT)
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
      totalRecoverable,
      worthwhile: totalRecoverable >= MIN_WORTHWHILE_RECOVERY,
    })
    
    const worthwhile = totalRecoverable >= MIN_WORTHWHILE_RECOVERY

    const analysis: RecoveryAnalysis = {
      recoverable: correctedRecoverable,
      totalRecoverable: Math.max(0, totalRecoverable),
      totalFee: batchFee,
      totalInputs,
      totalOutputs,
      estimatedVsize: batchVsize,
      worthwhile,
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

