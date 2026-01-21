import { NextRequest, NextResponse } from 'next/server'
import { getPrintProviderDetails } from '@/lib/printify'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const blueprintId = searchParams.get('blueprintId')
    const printProviderId = searchParams.get('printProviderId')

    if (!blueprintId || !printProviderId) {
      return NextResponse.json(
        { success: false, error: 'blueprintId and printProviderId are required' },
        { status: 400 }
      )
    }

    const details = await getPrintProviderDetails(
      parseInt(blueprintId),
      parseInt(printProviderId)
    )
    return NextResponse.json({ success: true, data: details })
  } catch (error: any) {
    console.error('Failed to fetch print provider details:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch print provider details' },
      { status: 500 }
    )
  }
}
