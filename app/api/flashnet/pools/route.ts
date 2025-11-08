import { NextRequest, NextResponse } from 'next/server'
import {
  ensureFlashnetTables,
  listFlashnetPools,
  searchFlashnetPools,
  countFlashnetPools,
  upsertFlashnetPools,
  attachStoredMetadataToPools,
  getFlashnetClient,
  enrichPoolsWithMetadata,
} from '@/lib/flashnet'

export const dynamic = 'force-dynamic'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim() ?? ''
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')

    let limit = Number(limitParam ?? (search ? 5 : 25))
    let offset = Number(offsetParam ?? 0)

    if (!Number.isFinite(limit) || limit <= 0) {
      limit = search ? 5 : 25
    }
    if (!Number.isFinite(offset) || offset < 0) {
      offset = 0
    }

    limit = Math.min(Math.max(1, limit), 200)
    offset = Math.max(0, offset)

    await ensureFlashnetTables()

    if (search) {
      const rawPools = await searchFlashnetPools(search, limit)
      const pools = await attachStoredMetadataToPools(rawPools)
      return NextResponse.json({
        success: true,
        pools,
        count: pools.length,
        total: pools.length,
      })
    }

    const [rawPools, total] = await Promise.all([
      listFlashnetPools({ limit, offset }),
      countFlashnetPools(),
    ])

    const pools = await attachStoredMetadataToPools(rawPools)

    return NextResponse.json({
      success: true,
      pools,
      count: pools.length,
      total,
    })
  } catch (error) {
    console.error('Flashnet pools GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    if (ADMIN_TOKEN) {
      const headerToken = request.headers.get('x-admin-token')
      if (headerToken !== ADMIN_TOKEN) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json().catch(() => ({}))
    const pools = Array.isArray(body?.pools) ? body.pools : []

    if (!pools.length) {
      return NextResponse.json(
        { success: false, error: 'No pools provided' },
        { status: 400 },
      )
    }

    await ensureFlashnetTables()
    const result = await upsertFlashnetPools(pools)

    try {
      const client = await getFlashnetClient()
      await enrichPoolsWithMetadata(client, result.records)
    } catch (error) {
      console.warn('[Flashnet] Metadata enrichment skipped:', (error as Error).message ?? error)
    }

    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      updated: result.updated,
    })
  } catch (error) {
    console.error('Flashnet pools POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}


