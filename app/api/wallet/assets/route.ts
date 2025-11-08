import { NextRequest, NextResponse } from 'next/server'

import { categoriseWalletAssets, fetchSandshrewBalances } from '@/lib/sandshrew'

function sanitizeForJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner)),
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as { address?: string }))
    const address = (body?.address || '').trim()

    if (!address) {
      return NextResponse.json(
        {
          success: false,
          error: 'Address is required',
        },
        { status: 400 },
      )
    }

    const rawBalances = await fetchSandshrewBalances(address)
    const assets = categoriseWalletAssets(address, rawBalances)

    return NextResponse.json(sanitizeForJson({ success: true, data: assets }), { status: 200 })
  } catch (error) {
    console.error('[wallet/assets] Failed to fetch Sandshrew balances', error)

    const message =
      error instanceof Error ? error.message : 'Unable to retrieve wallet assets from Sandshrew'

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
    const rawBalances = await fetchSandshrewBalances(address)
    const assets = categoriseWalletAssets(address, rawBalances)

    return NextResponse.json(sanitizeForJson({ success: true, data: assets }), { status: 200 })
  } catch (error) {
    console.error('[wallet/assets] Failed to fetch Sandshrew balances (GET)', error)

    const message =
      error instanceof Error ? error.message : 'Unable to retrieve wallet assets from Sandshrew'

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

