import { NextRequest, NextResponse } from 'next/server'
import { getBlueprintPrintProviders } from '@/lib/printify'

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

    const providers = await getBlueprintPrintProviders(blueprintId)
    return NextResponse.json({ success: true, data: providers })
  } catch (error: any) {
    console.error('Failed to fetch print providers:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch print providers' },
      { status: 500 }
    )
  }
}
