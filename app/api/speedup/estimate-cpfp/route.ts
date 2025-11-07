import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { parentTxid, parentFee, parentSize, outputValue, targetCombinedFeeRate, preserveAnchorValue } = body

    if (typeof parentTxid !== 'string' || parentTxid.length !== 64) {
      return NextResponse.json({ success: false, error: 'Invalid parent transaction ID' }, { status: 400 })
    }

    if (!Number.isFinite(parentFee) || parentFee <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid parent fee' }, { status: 400 })
    }

    if (!Number.isFinite(parentSize) || parentSize <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid parent size' }, { status: 400 })
    }

    if (!Number.isFinite(outputValue) || outputValue <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid output value' }, { status: 400 })
    }

    const baseParentFeeRate = parentFee / parentSize
    const preserveAnchor = typeof preserveAnchorValue === 'boolean' ? preserveAnchorValue : outputValue <= 600
    const targetRate = Number.isFinite(targetCombinedFeeRate)
      ? Math.max(targetCombinedFeeRate, 1)
      : Math.max(baseParentFeeRate * 1.5, 1)

    const childSize = 140
    const totalSize = parentSize + childSize
    const totalFeeNeeded = Math.ceil(totalSize * targetRate)
    const minimumChildFee = preserveAnchor ? 330 : 1
    const childFee = Math.max(totalFeeNeeded - parentFee, minimumChildFee)
    const actualTotalFee = parentFee + childFee
    const combinedRate = actualTotalFee / totalSize
    const userReceives = Math.max(outputValue - childFee, 0)

    const estimate = {
      parentFee,
      parentSize,
      parentFeeRate: baseParentFeeRate,
      childSize,
      recommendedChildFee: childFee,
      recommendedTotalFee: actualTotalFee,
      recommendedCombinedFeeRate: combinedRate,
      userReceives
    }

    return NextResponse.json({ success: true, estimate })
  } catch (error) {
    console.error('Speedup estimate-cpfp error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to estimate CPFP parameters'
      },
      { status: 500 }
    )
  }
}


