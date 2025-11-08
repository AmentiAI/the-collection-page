import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import {
  bulkUpsertLuminexTokens,
  countLuminexTokens,
  ensureLuminexTables,
  listLuminexTokens,
  searchLuminexTokens
} from '@/lib/luminex'

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

    const pool = getPool()
    await ensureLuminexTables(pool)

    if (search) {
      const tokens = await searchLuminexTokens(pool, search, limit)
      return NextResponse.json({
        success: true,
        tokens,
        count: tokens.length,
        total: tokens.length
      })
    }

    const [tokens, total] = await Promise.all([
      listLuminexTokens(pool, { limit, offset }),
      countLuminexTokens(pool)
    ])

    return NextResponse.json({
      success: true,
      tokens,
      count: tokens.length,
      total
    })
  } catch (error) {
    console.error('Luminex tokens GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
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
    const tokens = Array.isArray(body?.tokens) ? body.tokens : []

    if (!tokens.length) {
      return NextResponse.json(
        { success: false, error: 'No tokens provided' },
        { status: 400 }
      )
    }

    const pool = getPool()
    await ensureLuminexTables(pool)

    const result = await bulkUpsertLuminexTokens(pool, tokens)

    return NextResponse.json({
      success: true,
      ...result
    })
  } catch (error) {
    console.error('Luminex tokens POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}


