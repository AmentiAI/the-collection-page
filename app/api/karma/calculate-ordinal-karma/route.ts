import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { calculateOrdinalKarmaForWallet } from '@/lib/karma-utils'

export const dynamic = 'force-dynamic'

// Calculate karma based on ordinal ownership (+5 points per ordinal)
export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json()
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    const result = await calculateOrdinalKarmaForWallet(walletAddress, pool)
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Calculate ordinal karma error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

