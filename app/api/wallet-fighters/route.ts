import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Surrogate-Control': 'no-store',
}

const ORDISCAN_BASE = 'https://api.ordiscan.com/v1'

interface OrdiscanIns {
  inscription_id: string
  inscription_number: number
  content_type: string
  content_url: string
  collection_slug: string | null
}

async function fetchAllInscriptions(address: string, apiKey: string): Promise<OrdiscanIns[]> {
  const all: OrdiscanIns[] = []
  let page = 1

  while (true) {
    const res = await fetch(
      `${ORDISCAN_BASE}/address/${encodeURIComponent(address)}/inscriptions?page=${page}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) {
      if (page === 1) throw new Error(`Ordiscan error ${res.status}`)
      break
    }
    const body = await res.json()
    const items: OrdiscanIns[] = body.data ?? []
    if (!items.length) break
    all.push(...items)
    if (items.length < 100) break
    page++
    if (page > 30) break
  }
  return all
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) {
    return NextResponse.json({ error: 'address required' }, { status: 400, headers: NO_CACHE_HEADERS })
  }

  const apiKey = process.env.ORDISCAN_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ORDISCAN_API_KEY not configured' }, { status: 500, headers: NO_CACHE_HEADERS })
  }

  try {
    const inscriptions = await fetchAllInscriptions(address, apiKey)

    if (!inscriptions.length) {
      return NextResponse.json({ data: [] }, { headers: NO_CACHE_HEADERS })
    }

    const ids = inscriptions.map((i) => i.inscription_id)

    // Enrich from scraped collection tables
    const pool = getPool()
    const { rows: dbRows } = await pool.query(
      `SELECT
         i.inscription_id,
         i.collection_symbol,
         c.name            AS collection_name,
         c.image_uri       AS collection_image,
         fp.floor_price_sats,
         c.supply          AS collection_supply,
         td.meta_name,
         td.display_name,
         td.output,
         td.output_value,
         td.sat_rarity,
         td.attributes,
         td.content_type   AS db_content_type
       FROM me_inscriptions i
       LEFT JOIN me_collections c    ON c.slug = i.collection_symbol
       LEFT JOIN me_token_details td ON td.inscription_id = i.inscription_id
       LEFT JOIN (
         SELECT collection_symbol, MIN(listed_price) AS floor_price_sats
         FROM me_inscriptions
         WHERE listed = true AND listed_price IS NOT NULL AND listed_price > 0
         GROUP BY collection_symbol
       ) fp ON fp.collection_symbol = i.collection_symbol
       WHERE i.inscription_id = ANY($1)`,
      [ids]
    )

    const dbMap = new Map<string, Record<string, unknown>>(
      dbRows.map((r: Record<string, unknown>) => [r.inscription_id as string, r])
    )

    const data = inscriptions.map((ins) => {
      const db = dbMap.get(ins.inscription_id)
      const floorSats = db?.floor_price_sats != null ? Number(db.floor_price_sats) : null

      return {
        inscription_id: ins.inscription_id,
        inscription_number: ins.inscription_number,
        content_type: ins.content_type ?? db?.db_content_type ?? null,
        content_url: ins.content_url,
        collection_slug: ins.collection_slug ?? (db?.collection_symbol as string | null) ?? null,
        collection_name: (db?.collection_name as string | null) ?? null,
        collection_image: (db?.collection_image as string | null) ?? null,
        floor_price_sats: floorSats,
        meta_name: (db?.meta_name as string | null) ?? (db?.display_name as string | null) ?? null,
        sat_rarity: (db?.sat_rarity as string | null) ?? null,
        output: (db?.output as string | null) ?? null,
        output_value: db?.output_value != null ? Number(db.output_value) : null,
      }
    })

    return NextResponse.json({ data }, { headers: NO_CACHE_HEADERS })
  } catch (e) {
    console.error('[wallet-fighters]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load wallet' },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}
