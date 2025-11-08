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

    if (!ownerAddress) {
      return NextResponse.json({ error: 'ownerAddress is required' }, { status: 400 })
    }

    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    const baseUrl = 'https://api-mainnet.magiceden.dev/v2/ord/btc/tokens'

    const aggregatedTokens: any[] = []
    let total: number | undefined
    let currentOffset = offsetParam
    let hasMore = true
    const pageLimit = Math.max(1, Math.min(limitParam, 500))

    while (hasMore) {
      const params = new URLSearchParams({
        ownerAddress,
        limit: pageLimit.toString(),
        offset: currentOffset.toString(),
        showAll,
        sortBy,
      })
      if (collectionSymbol) {
        params.set('collectionSymbol', collectionSymbol)
      }

      const apiUrl = `${baseUrl}?${params.toString()}`

      console.log('🔍 Proxying Magic Eden API request:', apiUrl)

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
        console.error('Magic Eden API error:', response.status, errorText)
        if (response.status === 429) {
          return NextResponse.json(
            { error: 'Rate limit exceeded', status: 429, message: errorText },
            { status: 429 },
          )
        }
        return NextResponse.json(
          { error: 'Magic Eden API error', status: response.status, message: errorText },
          { status: response.status },
        )
      }

      const data = await response.json()
      const pageTokens: any[] = Array.isArray(data?.tokens)
        ? data.tokens
        : Array.isArray(data)
        ? data
        : []

      if (typeof data?.total === 'number' && data.total >= 0) {
        total = data.total
      }

      aggregatedTokens.push(...pageTokens)

      const retrieved = pageTokens.length
      if (!fetchAll || retrieved < pageLimit) {
        hasMore = false
      } else {
        currentOffset += pageLimit
      }
    }

    const responsePayload = {
      success: true,
      ownerAddress,
      tokens: aggregatedTokens,
      total: typeof total === 'number' ? total : aggregatedTokens.length,
      limit: pageLimit,
      fetchedAll: fetchAll,
      nextOffset: fetchAll ? null : offsetParam + aggregatedTokens.length,
      collectionSymbol: collectionSymbol ?? undefined,
    }

    console.log('✅ Magic Eden API response aggregated, count:', aggregatedTokens.length)

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

