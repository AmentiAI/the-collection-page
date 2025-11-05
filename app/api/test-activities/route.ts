import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const ownerAddress = searchParams.get('ownerAddress') || 'bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2'
    const collectionSymbol = searchParams.get('collectionSymbol') || 'the-damned'
    const kind = searchParams.get('kind') || 'buying_broadcasted'
    const limit = searchParams.get('limit') || '100'
    const offset = searchParams.get('offset') || '0'

    const apiKey = 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    
    const apiUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/activities?collectionSymbol=${collectionSymbol}&ownerAddress=${encodeURIComponent(ownerAddress)}&limit=${limit}&offset=${offset}&kind=${kind}`

    console.log('🔍 Testing Magic Eden activities API:')
    console.log('URL:', apiUrl)

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${apiKey}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({
        success: false,
        status: response.status,
        error: errorText,
        url: apiUrl
      }, { status: response.status })
    }

    const data = await response.json()
    
    return NextResponse.json({
      success: true,
      url: apiUrl,
      status: response.status,
      responseStructure: {
        topLevelKeys: Object.keys(data),
        activitiesCount: data.activities?.length || 0,
        firstActivityKeys: data.activities?.[0] ? Object.keys(data.activities[0]) : null,
        firstActivity: data.activities?.[0] || null,
        fullResponse: data
      }
    }, { status: 200 })
  } catch (error) {
    console.error('Test error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
