import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const ownerAddress = searchParams.get('ownerAddress')
    const collectionSymbol = searchParams.get('collectionSymbol') || 'runeseekers'

    if (!ownerAddress) {
      return NextResponse.json(
        { error: 'ownerAddress is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    const apiUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=${collectionSymbol}&ownerAddress=${encodeURIComponent(ownerAddress)}&showAll=true&sortBy=priceAsc`

    console.log('🔍 Proxying Magic Eden API request:', apiUrl)

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${apiKey}`
      },
      next: { revalidate: 30 } // Cache for 30 seconds
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Magic Eden API error:', response.status, errorText)
      
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
    console.log('✅ Magic Eden API response received, total:', data.total)

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error proxying Magic Eden API:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

