import { NextRequest, NextResponse } from 'next/server'

const ORDINALS_BASE_URL = process.env.ORDINALS_CONTENT_BASE_URL || 'https://ordinals.com/content'

export async function GET(
  _request: NextRequest,
  context: { params: { inscriptionId?: string } },
) {
  const inscriptionId = context.params.inscriptionId?.trim()

  if (!inscriptionId) {
    return NextResponse.json(
      {
        success: false,
        error: 'Inscription id is required',
      },
      { status: 400 },
    )
  }

  const endpoint = `${ORDINALS_BASE_URL.replace(/\/+$/, '')}/${encodeURIComponent(inscriptionId)}`

  try {
    const response = await fetch(endpoint, {
      method: 'HEAD',
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Ordinals content lookup failed with status ${response.status}`,
        },
        { status: 502 },
      )
    }

    const contentType = response.headers.get('content-type')
    const contentLength = response.headers.get('content-length')
    const acceptRanges = response.headers.get('accept-ranges')

    return NextResponse.json(
      {
        success: true,
        data: {
          inscriptionId,
          endpoint,
          contentType,
          contentLength: contentLength ? Number.parseInt(contentLength, 10) : null,
          acceptsRanges: acceptRanges === 'bytes',
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (error) {
    console.error('[ordinals/content] Failed to fetch content header', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Unable to reach ordinals.com for content metadata',
      },
      { status: 504 },
    )
  }
}



