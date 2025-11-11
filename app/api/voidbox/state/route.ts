import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

let tableInitialized = false

async function ensureTable() {
  if (tableInitialized) return
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voidbox_progress (
      wallet_address TEXT PRIMARY KEY,
      face_progress JSONB NOT NULL DEFAULT '[]'::jsonb,
      earned_sigils TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  tableInitialized = true
}

function normalizeFaceProgress(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item) =>
    item !== null &&
    typeof item === 'object' &&
    typeof (item as any).face_id === 'number'
  )
}

function normalizeEarnedSigils(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item : null))
    .filter((item): item is string => Boolean(item))
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const walletAddressRaw = searchParams.get('walletAddress')

    if (!walletAddressRaw) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }

    const walletAddress = walletAddressRaw.toLowerCase()

    await ensureTable()
    const pool = getPool()

    const result = await pool.query(
      `SELECT face_progress, earned_sigils, updated_at FROM voidbox_progress WHERE wallet_address = $1`,
      [walletAddress]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({
        walletAddress,
        faceProgress: [],
        earnedSigils: [],
        updatedAt: null,
      })
    }

    const row = result.rows[0]

    return NextResponse.json({
      walletAddress,
      faceProgress: normalizeFaceProgress(row.face_progress),
      earnedSigils: normalizeEarnedSigils(row.earned_sigils),
      updatedAt: row.updated_at ?? null,
    })
  } catch (error) {
    console.error('Voidbox state fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const walletAddressRaw: unknown = body.walletAddress
    const faceProgressRaw: unknown = body.faceProgress
    const earnedSigilsRaw: unknown = body.earnedSigils ?? body.userChoices?.earned_sigils

    if (typeof walletAddressRaw !== 'string' || walletAddressRaw.trim() === '') {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }

    const walletAddress = walletAddressRaw.toLowerCase()
    const faceProgress = normalizeFaceProgress(faceProgressRaw)
    const earnedSigils = normalizeEarnedSigils(earnedSigilsRaw)

    await ensureTable()
    const pool = getPool()

    const result = await pool.query(
      `INSERT INTO voidbox_progress (wallet_address, face_progress, earned_sigils, updated_at)
       VALUES ($1, $2::jsonb, $3::text[], NOW())
       ON CONFLICT (wallet_address)
       DO UPDATE SET face_progress = EXCLUDED.face_progress,
                     earned_sigils = EXCLUDED.earned_sigils,
                     updated_at = NOW()
       RETURNING face_progress, earned_sigils, updated_at`,
      [walletAddress, JSON.stringify(faceProgress), earnedSigils]
    )

    const row = result.rows[0]

    return NextResponse.json({
      walletAddress,
      faceProgress: normalizeFaceProgress(row.face_progress),
      earnedSigils: normalizeEarnedSigils(row.earned_sigils),
      updatedAt: row.updated_at ?? null,
    })
  } catch (error) {
    console.error('Voidbox state update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
