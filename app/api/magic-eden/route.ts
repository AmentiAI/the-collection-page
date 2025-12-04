import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Timeout wrapper for fetch requests
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options // Default 15s timeout
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

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
        const linkedWalletsResponse = await fetchWithTimeout(
          `${request.nextUrl.origin}/api/wallet/linked?walletAddress=${encodeURIComponent(ownerAddress)}`,
          { cache: 'no-store', timeout: 10000 } // 10s timeout for internal API
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

      try {
        const response = await fetchWithTimeout(apiUrl, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            Authorization: `Bearer ${apiKey}`,
          },
          next: { revalidate: 30 },
          timeout: 20000, // 20s timeout for external Magic Eden API
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
      } catch (fetchError) {
        // Handle timeout or network errors for this specific wallet
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.warn(`⏱️ Timeout fetching ordinals for ${walletInfo.address}, skipping...`)
        } else {
          console.error(`❌ Error fetching ordinals for ${walletInfo.address}:`, fetchError)
        }
        // Continue to next wallet
        break
      }
      }

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

 
    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('Error proxying Magic Eden API:', error)
    
    // Check if it's a timeout error
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        {
          error: 'Request timeout',
          message: 'Magic Eden API request timed out. Please try again.',
        },
        { status: 504 }, // Gateway Timeout
      )
    }
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

