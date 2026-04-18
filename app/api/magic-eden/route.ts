import { NextRequest, NextResponse } from 'next/server'
import { getHolderTokensForWallets, type WalletQuery } from '@/lib/holder-verification'

export const dynamic = 'force-dynamic'

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (Number.isFinite(parsed) && parsed >= 0) return parsed
  return fallback
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const ownerAddress = searchParams.get('ownerAddress')?.trim()
    const collectionSymbol = searchParams.get('collectionSymbol')?.trim() || null
    const limitParam = parsePositiveInt(searchParams.get('limit'), 100) || 100
    const offsetParam = parsePositiveInt(searchParams.get('offset'), 0)
    const fetchAll = searchParams.get('fetchAll') === 'true'
    const includeLinked = searchParams.get('includeLinked') === 'true'

    if (!ownerAddress) {
      return NextResponse.json({ error: 'ownerAddress is required' }, { status: 400 })
    }

    const wallets: WalletQuery[] = [{ address: ownerAddress, isPrimary: true }]

    if (includeLinked) {
      try {
        const linkedWalletsResponse = await fetchWithTimeout(
          `${request.nextUrl.origin}/api/wallet/linked?walletAddress=${encodeURIComponent(ownerAddress)}`,
          { cache: 'no-store', timeout: 10000 },
        )
        if (linkedWalletsResponse.ok) {
          const linkedData = await linkedWalletsResponse.json()
          if (linkedData.success && Array.isArray(linkedData.linkedWallets)) {
            linkedData.linkedWallets.forEach((lw: { wallet: string }) => {
              wallets.push({ address: lw.wallet, isPrimary: false })
            })
          }
        }
      } catch (error) {
        console.error('Failed to fetch linked wallets, continuing with primary only:', error)
      }
    }

    const allTokens = await getHolderTokensForWallets(wallets)

    // Preserve legacy pagination semantics: when fetchAll is false, slice the window.
    const pageLimit = Math.max(1, Math.min(limitParam, 500))
    const tokens = fetchAll ? allTokens : allTokens.slice(offsetParam, offsetParam + pageLimit)

    return NextResponse.json({
      success: true,
      ownerAddress,
      tokens,
      total: allTokens.length,
      limit: pageLimit,
      fetchedAll: fetchAll,
      nextOffset: fetchAll ? null : offsetParam + tokens.length,
      collectionSymbol: collectionSymbol ?? undefined,
      linkedWalletsIncluded: includeLinked,
      walletsQueried: wallets.length,
    })
  } catch (error) {
    console.error('Error in /api/magic-eden (Ordiscan-backed):', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
