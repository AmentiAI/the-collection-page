import { NextResponse } from 'next/server'

export async function GET() {
  // Return public settings for inscription tool
  // These settings control platform fees for inscriptions
  
  const settings = {
    inscribeToolFee: 0, // 0 sats for pass holders, can be configured
    platformFeeAddress: process.env.PLATFORM_FEE_ADDRESS || "3KWMjoT5nVpsUfJrxP1dqyM1b7EMXD3fSY",
    
    // Additional public settings can be added here
    network: process.env.BITCOIN_NETWORK || 'mainnet',
    mempoolApiUrl: process.env.MEMPOOL_API_URL || 'https://mempool.space/api'
  }
  
  return NextResponse.json(settings)
}





