import { NextRequest, NextResponse } from 'next/server'

const ORDISCAN_API_URL = 'https://api.ordiscan.com/v1'

/**
 * Look up a rune ID by name using Ordiscan API
 * GET /api/wallet/lookup-rune?name=EGGEVOLUTION
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const runeName = searchParams.get('name')
    
    if (!runeName) {
      return NextResponse.json(
        { success: false, error: 'Rune name is required' },
        { status: 400 }
      )
    }
    
    const ordiscanApiKey = process.env.ORDISCAN_API_KEY
    if (!ordiscanApiKey) {
      return NextResponse.json(
        { success: false, error: 'ORDISCAN_API_KEY not configured' },
        { status: 500 }
      )
    }
    
    console.log(`🔍 [lookup-rune] Looking up rune "${runeName}" via Ordiscan...`)
    
    const response = await fetch(`${ORDISCAN_API_URL}/rune/${encodeURIComponent(runeName)}`, {
      headers: {
        'Authorization': `Bearer ${ordiscanApiKey}`,
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.warn(`⚠️ [lookup-rune] Ordiscan API error (${response.status}): ${errorText.substring(0, 200)}`)
      return NextResponse.json(
        { success: false, error: `Ordiscan API error: ${response.status}` },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    
    // Ordiscan returns: { data: { id: "block:tx", name: "...", ... } }
    const runeData = data.data || data
    const runeId = runeData.id
    
    if (!runeId || typeof runeId !== 'string') {
      console.warn(`⚠️ [lookup-rune] Invalid response format from Ordiscan:`, data)
      return NextResponse.json(
        { success: false, error: 'Invalid response format from Ordiscan' },
        { status: 500 }
      )
    }
    
    // Validate format (should be "block:tx")
    if (!/^\d+:\d+$/.test(runeId)) {
      console.warn(`⚠️ [lookup-rune] Invalid rune ID format: ${runeId}`)
      return NextResponse.json(
        { success: false, error: `Invalid rune ID format: ${runeId}` },
        { status: 500 }
      )
    }
    
    console.log(`✅ [lookup-rune] Found rune ID: ${runeId} for "${runeName}"`)
    
    return NextResponse.json({
      success: true,
      runeId,
      name: runeData.name,
      formattedName: runeData.formatted_name,
      symbol: runeData.symbol,
    })
  } catch (error) {
    console.error('[lookup-rune] Failed to look up rune:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to look up rune',
      },
      { status: 500 }
    )
  }
}
