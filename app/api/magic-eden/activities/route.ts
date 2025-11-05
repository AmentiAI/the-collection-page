import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const ownerAddress = searchParams.get('ownerAddress')
    // Note: collectionSymbol is NOT included in the query - Magic Eden API returns empty results when filtering by collectionSymbol
    // Client should filter by collectionSymbol in the response instead
    const kind = searchParams.get('kind') // Optional: filter by activity kind (list, delist, buying_broadcasted, transfer, etc.)
    const limit = searchParams.get('limit') || '50'
    const offset = searchParams.get('offset') || '0'

    if (!ownerAddress) {
      return NextResponse.json(
        { error: 'ownerAddress is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    
    // Build the activities API URL (NO collectionSymbol parameter - filter client-side instead)
    let apiUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/activities?ownerAddress=${encodeURIComponent(ownerAddress)}&limit=${limit}&offset=${offset}`
    
    // Add kind filter if provided
    if (kind) {
      apiUrl += `&kind=${kind}`
    }

    console.log('🔍 Fetching Magic Eden activities:', apiUrl)

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${apiKey}`
      },
      next: { revalidate: 60 } // Cache for 60 seconds
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Magic Eden activities API error:', response.status, errorText)
      
      // Handle rate limiting
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded', status: 429, message: errorText },
          { status: 429 }
        )
      }
      
      return NextResponse.json(
        { error: 'Magic Eden API error', status: response.status, message: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('✅ Magic Eden activities response received, activities count:', data.activities?.length || 0)

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching Magic Eden activities:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
