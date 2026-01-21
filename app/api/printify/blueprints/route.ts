import { NextRequest, NextResponse } from 'next/server'
import { getBlueprints } from '@/lib/printify'

export async function GET(request: NextRequest) {
  try {
    const blueprints = await getBlueprints()
    return NextResponse.json({ success: true, data: blueprints })
  } catch (error: any) {
    console.error('Failed to fetch blueprints:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch blueprints' },
      { status: 500 }
    )
  }
}
