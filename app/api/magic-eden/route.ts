import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed
  }
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
    const sortBy = searchParams.get('sortBy')?.trim() || 'priceAsc'
    const showAll = searchParams.get('showAll')?.trim() || 'true'
    const includeLinked = searchParams.get('includeLinked') === 'true'

    if (!ownerAddress) {
      return NextResponse.json({ error: 'ownerAddress is required' }, { status: 400 })
    }

    // Fetch linked wallets if requested
    let walletsToQuery: Array<{ address: string; isPrimary: boolean }> = [{ address: ownerAddress, isPrimary: true }]
    
    if (includeLinked) {
      try {
        const linkedWalletsResponse = await fetch(
          `${request.nextUrl.origin}/api/wallet/linked?walletAddress=${encodeURIComponent(ownerAddress)}`,
          { cache: 'no-store' }
        )
        
        if (linkedWalletsResponse.ok) {
          const linkedData = await linkedWalletsResponse.json()
          if (linkedData.success && Array.isArray(linkedData.linkedWallets)) {
            // Add all linked wallets to the query list
            linkedData.linkedWallets.forEach((lw: { wallet: string }) => {
              walletsToQuery.push({ address: lw.wallet, isPrimary: false })
            })
            console.log(`🔗 Including ${linkedData.linkedWallets.length} linked wallets for ordinal fetching`)
          } else {
            console.log(`⚠️ No linked wallets found or invalid response format`)
          }
        } else {
          console.log(`⚠️ Failed to fetch linked wallets: ${linkedWalletsResponse.status}`)
        }
      } catch (error) {
        console.error('Failed to fetch linked wallets, continuing with primary only:', error)
        // Continue with just primary wallet if linked fetch fails
      }
    }

    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    const baseUrl = 'https://api-mainnet.magiceden.dev/v2/ord/btc/tokens'

    const aggregatedTokens: any[] = []
    const pageLimit = Math.max(1, Math.min(limitParam, 500))

    // Fetch ordinals from each wallet (primary + linked)
    for (const walletInfo of walletsToQuery) {
      let currentOffset = offsetParam
      let hasMore = true
      let walletTotal: number | undefined

      console.log(`🔍 Fetching ordinals for wallet: ${walletInfo.address} (${walletInfo.isPrimary ? 'Primary' : 'Linked'})`)

      while (hasMore) {
        const params = new URLSearchParams({
          ownerAddress: walletInfo.address,
          limit: pageLimit.toString(),
          offset: currentOffset.toString(),
          showAll,
          sortBy,
        })
        if (collectionSymbol) {
          params.set('collectionSymbol', collectionSymbol)
        }

        const apiUrl = `${baseUrl}?${params.toString()}`

        const response = await fetch(apiUrl, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            Authorization: `Bearer ${apiKey}`,
          },
          next: { revalidate: 30 },
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Magic Eden API error for ${walletInfo.address}:`, response.status, errorText)
          if (response.status === 429) {
            return NextResponse.json(
              { error: 'Rate limit exceeded', status: 429, message: errorText },
              { status: 429 },
            )
          }
          // Continue to next wallet if this one fails (don't fail entire request)
          console.warn(`Skipping wallet ${walletInfo.address} due to API error`)
          break
        }

        const data = await response.json()
        const pageTokens: any[] = Array.isArray(data?.tokens)
          ? data.tokens
          : Array.isArray(data)
          ? data
          : []

        if (typeof data?.total === 'number' && data.total >= 0) {
          walletTotal = data.total
        }

        // Add wallet source info to each token
        const tokensWithWalletInfo = pageTokens.map(token => ({
          ...token,
          _walletSource: walletInfo.address,
          _isLinkedWallet: !walletInfo.isPrimary,
        }))

        aggregatedTokens.push(...tokensWithWalletInfo)

        const retrieved = pageTokens.length
        if (!fetchAll || retrieved < pageLimit) {
          hasMore = false
        } else {
          currentOffset += pageLimit
        }
      }

      console.log(`✅ Fetched ${aggregatedTokens.filter(t => t._walletSource === walletInfo.address).length} ordinals from ${walletInfo.address}`)
    }

    const responsePayload = {
      success: true,
      ownerAddress,
      tokens: aggregatedTokens,
      total: aggregatedTokens.length,
      limit: pageLimit,
      fetchedAll: fetchAll,
      nextOffset: fetchAll ? null : offsetParam + aggregatedTokens.length,
      collectionSymbol: collectionSymbol ?? undefined,
      linkedWalletsIncluded: includeLinked,
      walletsQueried: walletsToQuery.length,
    }

    console.log(`✅ Magic Eden API response aggregated, total count: ${aggregatedTokens.length} from ${walletsToQuery.length} wallet(s)`)

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('Error proxying Magic Eden API:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

