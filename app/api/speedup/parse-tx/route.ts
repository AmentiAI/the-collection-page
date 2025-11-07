import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface MempoolTxOutput {
  value: number
  scriptpubkey_address?: string
  spent: boolean
}

interface MempoolTxInput {
  txid: string
  vout: number
  sequence: number
  prevout: {
    value: number
    scriptpubkey_address?: string
  } | null
}

interface MempoolTxDetails {
  txid: string
  fee: number
  vsize: number
  status: {
    confirmed: boolean
  }
  vin: MempoolTxInput[]
  vout: MempoolTxOutput[]
}

function satoshisPerVByte(fee: number, vsize: number) {
  if (!fee || !vsize) return 0
  return fee / vsize
}

export async function POST(request: NextRequest) {
  try {
    const { txid, userAddress, walletAddresses: walletAddressesRaw } = await request.json()

    if (!txid || typeof txid !== 'string' || txid.length !== 64) {
      return NextResponse.json(
        { success: false, error: 'Invalid txid' },
        { status: 400 }
      )
    }

    const walletAddresses = new Set(
      [userAddress, ...(Array.isArray(walletAddressesRaw) ? walletAddressesRaw : [])]
        .filter((addr: string | null | undefined): addr is string => typeof addr === 'string' && addr.length > 0)
    )

    const txRes = await fetch(`https://mempool.space/api/tx/${txid}`)

    if (txRes.status === 404) {
      return NextResponse.json({
        success: true,
        transaction: {
          txid,
          status: 'not_found',
          fee: 0,
          feeRate: 0,
          vsize: 0,
          optInRbf: false,
          inputs: [],
          outputs: [],
          userOutput: undefined
        },
        estimate: null,
        analysis: {
          targetFeeRate: 0,
          requiredRbfFee: 0,
          availableRbfLiquidity: 0,
          walletControlsAllInputs: false,
          walletInputCount: 0,
          walletOutputCount: 0,
          canRbf: false,
          canSimpleCpfp: false,
          canHybridCpfp: false,
          recommendedStrategy: 'none'
        }
      })
    }

    if (!txRes.ok) {
      throw new Error(`Failed to fetch transaction: ${txRes.statusText}`)
    }

    const txData: MempoolTxDetails = await txRes.json()

    const status: 'confirmed' | 'unconfirmed' = txData.status.confirmed ? 'confirmed' : 'unconfirmed'
    const weight = (txData as any).weight
    const parentVsize = typeof txData.vsize === 'number' && txData.vsize > 0 ? txData.vsize : typeof weight === 'number' && weight > 0 ? Math.ceil(weight / 4) : 0
    const feeRate = satoshisPerVByte(txData.fee, parentVsize)

    const outputs = txData.vout.map((output, index) => {
      const address = output.scriptpubkey_address ?? 'unknown'
      const belongsToWallet = walletAddresses.has(address)
      return {
        index,
        address,
        value: output.value,
        spent: output.spent,
        belongsToWallet
      }
    })

    let userOutput: { index: number; address: string; value: number } | undefined
    const unspentWalletOutputs = outputs.filter((output) => output.belongsToWallet && !output.spent)
    if (unspentWalletOutputs.length > 0) {
      const primary = unspentWalletOutputs[0]
        userOutput = {
        index: primary.index,
        address: primary.address,
        value: primary.value
      }
    }

    const inputs = txData.vin.map((input, index) => {
      const address = input.prevout?.scriptpubkey_address ?? null
      const belongsToWallet = address ? walletAddresses.has(address) : false
      return {
        index,
        txid: input.txid,
        vout: input.vout,
        sequence: input.sequence,
        value: input.prevout?.value ?? 0,
        address,
        belongsToWallet
      }
    })

    const walletInputCount = inputs.filter((input) => input.belongsToWallet).length
    const walletControlsAllInputs = inputs.length > 0 && walletInputCount === inputs.length
    const optInRbf = txData.vin.some((vin) => vin.sequence < 0xfffffffe)

    const CHILD_ANCHOR_SIZE = 140

    const estimate = (() => {
      if (!userOutput) return null

      const parentFee = txData.fee
      const parentSize = txData.vsize
      const parentFeeRate = feeRate
      const childSize = CHILD_ANCHOR_SIZE
      const targetFeeRate = Math.max(1, parentFeeRate * 1.5)

      const totalSize = parentSize + childSize
      const totalFeeNeeded = Math.ceil(totalSize * targetFeeRate)
      const childFee = totalFeeNeeded - parentFee
      const combinedFeeRate = totalFeeNeeded / totalSize
      const userReceives = Math.max(userOutput.value - childFee, 0)

      return {
        parentFee,
        parentSize,
        parentFeeRate,
        childSize,
        recommendedChildFee: Math.max(childFee, 330),
        recommendedTotalFee: totalFeeNeeded,
        recommendedCombinedFeeRate: combinedFeeRate,
        userReceives
      }
    })()

    const childSize = CHILD_ANCHOR_SIZE
    const targetFeeRate = Math.max(1, feeRate * 1.5)
    const requiredRbfFee = Math.max(Math.ceil(txData.vsize * targetFeeRate) - txData.fee, 0)
    const RBF_DUST_BUFFER = 546
    const availableRbfLiquidity = unspentWalletOutputs.reduce((sum, output) => {
      const spendable = Math.max(0, output.value - RBF_DUST_BUFFER)
      return sum + spendable
    }, 0)
    const canRbf =
      status === 'unconfirmed' &&
      optInRbf &&
      walletControlsAllInputs &&
      requiredRbfFee > 0 &&
      availableRbfLiquidity >= requiredRbfFee

    const anchorOutputValue = userOutput?.value ?? 0
    const MIN_ANCHOR_VALUE = 546
    const estimatedChildFee = estimate?.recommendedChildFee ?? Math.max(Math.ceil(childSize * targetFeeRate), 330)
    const canSimpleCpfp =
      status === 'unconfirmed' &&
      !!userOutput &&
      anchorOutputValue - MIN_ANCHOR_VALUE >= estimatedChildFee
    const canHybridCpfp = status === 'unconfirmed' && !!userOutput

    let recommendedStrategy: 'none' | 'rbf' | 'cpfp' | 'hybrid' = 'none'
    if (status === 'unconfirmed') {
      if (canRbf) {
        recommendedStrategy = 'rbf'
      } else if (canSimpleCpfp) {
        recommendedStrategy = 'cpfp'
      } else if (canHybridCpfp) {
        recommendedStrategy = 'hybrid'
      }
    }

    const responsePayload = {
      success: true,
      transaction: {
        txid: txData.txid,
        status,
        fee: txData.fee,
        feeRate,
        vsize: parentVsize,
        optInRbf,
        inputs,
        outputs,
        userOutput
      },
      estimate,
      analysis: {
        targetFeeRate,
        requiredRbfFee,
        availableRbfLiquidity,
        walletControlsAllInputs,
        walletInputCount,
        walletOutputCount: unspentWalletOutputs.length,
        canRbf,
        canSimpleCpfp,
        canHybridCpfp,
        recommendedStrategy
      }
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('Speedup parse-tx error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error parsing transaction'
      },
      { status: 500 }
    )
  }
}
