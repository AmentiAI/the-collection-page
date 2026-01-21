import { NextRequest, NextResponse } from 'next/server'
import { getBlueprintDetails } from '@/lib/printify'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const blueprintId = parseInt(params.id)
    if (isNaN(blueprintId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid blueprint ID' },
        { status: 400 }
      )
    }

    const blueprint = await getBlueprintDetails(blueprintId)
    return NextResponse.json({ success: true, data: blueprint })
  } catch (error: any) {
    console.error('Failed to fetch blueprint details:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch blueprint details' },
      { status: 500 }
    )
  }
}
