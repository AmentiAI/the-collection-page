import { NextRequest, NextResponse } from 'next/server'
import type { MempoolClientData } from '@/lib/hybrid-utxo'
import { fetchWalletAssetsWithOrdiscan } from '@/lib/ordiscan-assets'

function sanitizeForJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner)),
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as { address?: string; clientMempoolData?: MempoolClientData }))
    const address = (body?.address || '').trim()
    const clientMempoolData = body?.clientMempoolData

    if (!address) {
      return NextResponse.json(
        {
          success: false,
          error: 'Address is required',
        },
        { status: 400 },
      )
    }

    // Check for Ordiscan API key (required)
    const ordiscanApiKey = process.env.ORDISCAN_API_KEY
    if (!ordiscanApiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'ORDISCAN_API_KEY environment variable is not set',
        },
        { status: 500 },
      )
    }

    // Use Ordiscan + mempool.space hybrid solution (no Subfrost fallback)
    console.log(`🔍 [wallet/assets] Using Ordiscan + mempool.space hybrid for address: ${address.substring(0, 20)}... (has clientMempoolData: ${!!clientMempoolData})`)
    const assets = await fetchWalletAssetsWithOrdiscan(address, clientMempoolData)
    console.log(`✅ [wallet/assets] Successfully fetched assets for ${address.substring(0, 20)}...`)
    return NextResponse.json(sanitizeForJson({ success: true, data: assets }), { status: 200 })
  } catch (error) {
    console.error('[wallet/assets] Failed to fetch wallet assets', error)

    const message =
      error instanceof Error ? error.message : 'Unable to retrieve wallet assets'

    const status = /not set|missing/i.test(message) ? 500 : 502

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status },
    )
  }
}
 
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')?.trim()

  if (!address) {
    return NextResponse.json(
      {
        success: false,
        error: 'Address query parameter is required',
      },
      { status: 400 },
    )
  }

  try {
    // Check for Ordiscan API key (required)
    const ordiscanApiKey = process.env.ORDISCAN_API_KEY
    if (!ordiscanApiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'ORDISCAN_API_KEY environment variable is not set',
        },
        { status: 500 },
      )
    }

    // Use Ordiscan + mempool.space hybrid solution (no Subfrost fallback)
    console.log(`🔍 [wallet/assets] Using Ordiscan + mempool.space hybrid (GET): ${address.substring(0, 20)}...`)
    const assets = await fetchWalletAssetsWithOrdiscan(address)
    return NextResponse.json(sanitizeForJson({ success: true, data: assets }), { status: 200 })
  } catch (error) {
    console.error('[wallet/assets] Failed to fetch wallet assets (GET)', error)

    const message =
      error instanceof Error ? error.message : 'Unable to retrieve wallet assets'

    const status = /not set|missing/i.test(message) ? 500 : 502

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status },
    )
  }
}

