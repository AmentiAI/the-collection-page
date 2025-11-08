import { Pool } from 'pg'

export interface LuminexTokenInput {
  pubkey?: string | null
  token_identifier?: string | null
  token_address?: string | null
  name?: string | null
  ticker?: string | null
  symbol?: string | null
  decimals?: number | string | null
  icon_url?: string | null
  holder_count?: number | string | null
  total_supply?: number | string | null
  max_supply?: number | string | null
  is_freezable?: boolean | number | string | null
  pool_lp_pubkey?: string | null
  pool_address?: string | null
  price_usd?: number | string | null
  agg_volume_24h_usd?: number | string | null
  agg_liquidity_usd?: number | string | null
  agg_price_change_24h_pct?: number | string | null
}

export type LuminexTokenRow = {
  id: string
  pubkey: string
  token_identifier: string | null
  token_address: string | null
  name: string
  ticker: string
  symbol: string | null
  decimals: number | null
  icon_url: string | null
  holder_count: number | null
  total_supply: string | null
  max_supply: string | null
  is_freezable: boolean | null
  pool_lp_pubkey: string | null
  pool_address: string | null
  price_usd: string | null
  agg_volume_24h_usd: string | null
  agg_liquidity_usd: string | null
  agg_price_change_24h_pct: string | null
  updated_at: string
}

function toBoolean(value: LuminexTokenInput['is_freezable']): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false
  }
  return null
}

function toInteger(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : null
}

function toNumeric(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

function toStringValue(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

export async function ensureLuminexTables(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS luminex_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pubkey TEXT UNIQUE NOT NULL,
      token_identifier TEXT,
      token_address TEXT,
      name TEXT NOT NULL,
      ticker TEXT NOT NULL,
      symbol TEXT,
      decimals INTEGER,
      icon_url TEXT,
      holder_count INTEGER,
      total_supply TEXT,
      max_supply TEXT,
      is_freezable BOOLEAN DEFAULT false,
      pool_lp_pubkey TEXT,
      pool_address TEXT,
      price_usd NUMERIC,
      agg_volume_24h_usd NUMERIC,
      agg_liquidity_usd NUMERIC,
      agg_price_change_24h_pct NUMERIC,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_luminex_tokens_ticker ON luminex_tokens((LOWER(ticker)))
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_luminex_tokens_symbol ON luminex_tokens((LOWER(symbol)))
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_luminex_tokens_name ON luminex_tokens((LOWER(name)))
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_luminex_tokens_pool_lp ON luminex_tokens(pool_lp_pubkey)
  `)
}

export async function bulkUpsertLuminexTokens(pool: Pool, tokens: LuminexTokenInput[]) {
  if (!tokens || tokens.length === 0) {
    return { inserted: 0, updated: 0 }
  }

  const client = await pool.connect()
  let inserted = 0
  let updated = 0

  try {
    await client.query('BEGIN')

    const query = `
      INSERT INTO luminex_tokens (
        pubkey,
        token_identifier,
        token_address,
        name,
        ticker,
        symbol,
        decimals,
        icon_url,
        holder_count,
        total_supply,
        max_supply,
        is_freezable,
        pool_lp_pubkey,
        pool_address,
        price_usd,
        agg_volume_24h_usd,
        agg_liquidity_usd,
        agg_price_change_24h_pct,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, NOW()
      )
      ON CONFLICT (pubkey) DO UPDATE SET
        token_identifier = EXCLUDED.token_identifier,
        token_address = EXCLUDED.token_address,
        name = EXCLUDED.name,
        ticker = EXCLUDED.ticker,
        symbol = EXCLUDED.symbol,
        decimals = EXCLUDED.decimals,
        icon_url = EXCLUDED.icon_url,
        holder_count = EXCLUDED.holder_count,
        total_supply = EXCLUDED.total_supply,
        max_supply = EXCLUDED.max_supply,
        is_freezable = EXCLUDED.is_freezable,
        pool_lp_pubkey = EXCLUDED.pool_lp_pubkey,
        pool_address = EXCLUDED.pool_address,
        price_usd = EXCLUDED.price_usd,
        agg_volume_24h_usd = EXCLUDED.agg_volume_24h_usd,
        agg_liquidity_usd = EXCLUDED.agg_liquidity_usd,
        agg_price_change_24h_pct = EXCLUDED.agg_price_change_24h_pct,
        updated_at = NOW()
      RETURNING (xmax = 0) AS inserted
    `

    for (const token of tokens) {
      const pubkey = token.pubkey || token.token_identifier || token.token_address
      const name = token.name || token.ticker || token.symbol
      const ticker = token.ticker || token.symbol || token.name

      if (!pubkey || !name || !ticker) {
        continue
      }

      const values = [
        pubkey,
        token.token_identifier ?? token.token_address ?? null,
        token.token_address ?? token.token_identifier ?? null,
        name,
        ticker,
        token.symbol ?? token.ticker ?? null,
        toInteger(token.decimals),
        token.icon_url ?? null,
        toInteger(token.holder_count),
        toStringValue(token.total_supply),
        toStringValue(token.max_supply),
        toBoolean(token.is_freezable),
        token.pool_lp_pubkey ?? null,
        token.pool_address ?? null,
        toNumeric(token.price_usd),
        toNumeric(token.agg_volume_24h_usd),
        toNumeric(token.agg_liquidity_usd),
        toNumeric(token.agg_price_change_24h_pct)
      ]

      const res = await client.query(query, values)
      const rowInserted = res.rows[0]?.inserted === true
      if (rowInserted) {
        inserted += 1
      } else {
        updated += 1
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  return { inserted, updated }
}

export async function searchLuminexTokens(pool: Pool, search: string, limit = 5): Promise<LuminexTokenRow[]> {
  const term = search.trim().toLowerCase()
  if (!term) return []

  const res = await pool.query<LuminexTokenRow>(
    `
      SELECT *
      FROM luminex_tokens
      WHERE LOWER(ticker) = $1
         OR LOWER(symbol) = $1
         OR LOWER(name) LIKE $2
         OR LOWER(ticker) LIKE $2
         OR LOWER(symbol) LIKE $2
      ORDER BY
        CASE
          WHEN LOWER(ticker) = $1 THEN 1
          WHEN LOWER(symbol) = $1 THEN 2
          WHEN LOWER(ticker) LIKE $2 THEN 3
          WHEN LOWER(symbol) LIKE $2 THEN 4
          WHEN LOWER(name) LIKE $2 THEN 5
          ELSE 6
        END,
        COALESCE(agg_volume_24h_usd, 0) DESC,
        COALESCE(price_usd, 0) DESC
      LIMIT $3
    `,
    [term, `${term}%`, limit]
  )

  return res.rows
}

export async function listLuminexTokens(
  pool: Pool,
  {
    limit = 25,
    offset = 0
  }: {
    limit?: number
    offset?: number
  } = {}
): Promise<LuminexTokenRow[]> {
  const boundedLimit = Math.max(1, Math.min(200, limit))
  const boundedOffset = Math.max(0, offset)

  const res = await pool.query<LuminexTokenRow>(
    `
      SELECT *
      FROM luminex_tokens
      ORDER BY COALESCE(agg_volume_24h_usd, 0) DESC, COALESCE(price_usd, 0) DESC
      LIMIT $1 OFFSET $2
    `,
    [boundedLimit, boundedOffset]
  )

  return res.rows
}

export async function countLuminexTokens(pool: Pool): Promise<number> {
  const res = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM luminex_tokens`)
  const countValue = res.rows[0]?.count
  return countValue ? Number(countValue) : 0
}


