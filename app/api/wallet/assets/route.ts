import { NextRequest, NextResponse } from 'next/server'
import type { MempoolClientData } from '@/lib/hybrid-utxo'
import { fetchWalletAssetsWithOrdiscan } from '@/lib/ordiscan-assets'
import { categoriseWalletAssets, fetchSandshrewBalances } from '@/lib/sandshrew'

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

    // Use Ordiscan-based fetching if API key is available
    const ordiscanApiKey = process.env.ORDISCAN_API_KEY
    if (ordiscanApiKey) {
      console.log(`🔍 [wallet/assets] Using Ordiscan for asset detection: ${address.substring(0, 20)}...`)
      try {
        const assets = await fetchWalletAssetsWithOrdiscan(address, clientMempoolData)
        return NextResponse.json(sanitizeForJson({ success: true, data: assets }), { status: 200 })
      } catch (ordiscanError) {
        console.error('[wallet/assets] Ordiscan fetch failed, falling back to Subfrost:', ordiscanError)
        // Fall through to Subfrost fallback
      }
    }

    // Fallback to Subfrost approach
    console.log(`🔍 [wallet/assets] Using Subfrost (fallback): ${address.substring(0, 20)}...`)
    const rawBalances = await fetchSandshrewBalances(address)
    const assets = categoriseWalletAssets(address, rawBalances)

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
    // Use Ordiscan-based fetching if API key is available
    const ordiscanApiKey = process.env.ORDISCAN_API_KEY
    if (ordiscanApiKey) {
      console.log(`🔍 [wallet/assets] Using Ordiscan for asset detection (GET): ${address.substring(0, 20)}...`)
      try {
        const assets = await fetchWalletAssetsWithOrdiscan(address)
        return NextResponse.json(sanitizeForJson({ success: true, data: assets }), { status: 200 })
      } catch (ordiscanError) {
        console.error('[wallet/assets] Ordiscan fetch failed, falling back to Subfrost:', ordiscanError)
        // Fall through to Subfrost fallback
      }
    }

    // Fallback to Subfrost approach
    console.log(`🔍 [wallet/assets] Using Subfrost (fallback, GET): ${address.substring(0, 20)}...`)
    const rawBalances = await fetchSandshrewBalances(address)
    const assets = categoriseWalletAssets(address, rawBalances)

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

