import { FlashnetClient } from '@flashnet/sdk'
import {
  SparkWallet,
  decodeBech32mTokenIdentifier,
  encodeBech32mTokenIdentifier,
  type Bech32mTokenIdentifier,
  type NetworkType,
} from '@buildonspark/spark-sdk'
import { Pool } from 'pg'
import { getPool } from './db'
const FLASHNET_METADATA_BATCH_SIZE = Number.isFinite(Number(process.env.FLASHNET_METADATA_BATCH_SIZE))
  ? Math.max(10, Math.min(200, Number(process.env.FLASHNET_METADATA_BATCH_SIZE)))
  : 100

const FLASHNET_MNEMONIC = process.env.FLASHNET_MNEMONIC || process.env.SPARK_MNEMONIC
const FLASHNET_NETWORK = ((process.env.FLASHNET_NETWORK || 'MAINNET').toUpperCase() as NetworkType)

let flashnetClientPromise: Promise<FlashnetClient> | null = null

export async function getFlashnetClient(): Promise<FlashnetClient> {
  if (!flashnetClientPromise) {
    if (!FLASHNET_MNEMONIC) {
      throw new Error('FLASHNET_MNEMONIC (or SPARK_MNEMONIC) is not set')
    }

    flashnetClientPromise = (async () => {
      const { wallet } = await SparkWallet.initialize({
        mnemonicOrSeed: FLASHNET_MNEMONIC,
        options: { network: FLASHNET_NETWORK },
      })

      const client = new FlashnetClient(wallet)
      await client.initialize()
      return client
    })()
  }

  return flashnetClientPromise
}

export interface FlashnetPoolRecord {
  lp_public_key: string
  network: string | null
  host_name: string | null
  host_namespace: string | null
  curve_type: string | null
  asset_a_address: string | null
  asset_b_address: string | null
  asset_a_name: string | null
  asset_b_name: string | null
  asset_a_symbol: string | null
  asset_b_symbol: string | null
  asset_a_decimals: number | null
  asset_b_decimals: number | null
  asset_a_reserve: number | null
  asset_b_reserve: number | null
  tvl_asset_b: number | null
  volume_24h_asset_b: number | null
  price_change_percent_24h: number | null
  current_price_a_in_b: number | null
  lp_fee_bps: number | null
  host_fee_bps: number | null
  created_at: string | null
  updated_at: string | null
}

export async function ensureFlashnetTables(pool?: Pool) {
  const db = pool ?? getPool()

  await db.query(`
    CREATE TABLE IF NOT EXISTS flashnet_pools (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lp_public_key TEXT UNIQUE NOT NULL,
      network TEXT,
      host_name TEXT,
      host_namespace TEXT,
      curve_type TEXT,
      asset_a_address TEXT NOT NULL,
      asset_b_address TEXT NOT NULL,
      asset_a_name TEXT,
      asset_b_name TEXT,
      asset_a_symbol TEXT,
      asset_b_symbol TEXT,
      asset_a_decimals INTEGER,
      asset_b_decimals INTEGER,
      asset_a_reserve NUMERIC,
      asset_b_reserve NUMERIC,
      tvl_asset_b NUMERIC,
      volume_24h_asset_b NUMERIC,
      price_change_percent_24h NUMERIC,
      current_price_a_in_b NUMERIC,
      lp_fee_bps INTEGER,
      host_fee_bps INTEGER,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ,
      last_synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  const alterStatements = [
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS host_namespace TEXT`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS asset_a_name TEXT`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS asset_b_name TEXT`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS asset_a_symbol TEXT`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS asset_b_symbol TEXT`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS asset_a_decimals INTEGER`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS asset_b_decimals INTEGER`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS asset_a_reserve NUMERIC`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS asset_b_reserve NUMERIC`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS tvl_asset_b NUMERIC`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS volume_24h_asset_b NUMERIC`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS price_change_percent_24h NUMERIC`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS current_price_a_in_b NUMERIC`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS lp_fee_bps INTEGER`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS host_fee_bps INTEGER`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`,
    `ALTER TABLE flashnet_pools ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT NOW()`,
  ]

  for (const statement of alterStatements) {
    await db.query(statement)
  }

  await db.query(`CREATE INDEX IF NOT EXISTS idx_flashnet_pools_lp ON flashnet_pools(lp_public_key)`)
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_flashnet_pools_asset_a ON flashnet_pools((LOWER(asset_a_address)))`,
  )
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_flashnet_pools_asset_b ON flashnet_pools((LOWER(asset_b_address)))`,
  )
  await db.query(`CREATE INDEX IF NOT EXISTS idx_flashnet_pools_host ON flashnet_pools((LOWER(host_name)))`)

  await db.query(`
    CREATE TABLE IF NOT EXISTS flashnet_token_metadata (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_identifier TEXT UNIQUE NOT NULL,
      token_address TEXT,
      name TEXT,
      ticker TEXT,
      decimals INTEGER,
      max_supply NUMERIC,
      icon_url TEXT,
      last_synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_flashnet_token_metadata_identifier
      ON flashnet_token_metadata(token_identifier)
  `)
}

function getString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return String(value)
}

function hexStringToBytes(value: string): Uint8Array | null {
  const normalized = value.startsWith('0x') ? value.slice(2) : value
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length !== 64) {
    return null
  }
  return Uint8Array.from(Buffer.from(normalized, 'hex'))
}

function toTokenIdentifierBytes(identifier: string, network: NetworkType): Uint8Array | null {
  try {
    const decoded = decodeBech32mTokenIdentifier(identifier as Bech32mTokenIdentifier, network)
    return decoded.tokenIdentifier?.length === 32 ? decoded.tokenIdentifier : null
  } catch (error) {
    const hexBytes = hexStringToBytes(identifier)
    if (hexBytes && hexBytes.length === 32) {
      return hexBytes
    }
    console.warn('[Flashnet] Skipping non-token identifier', identifier)
    return null
  }
}

function getNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizePool(pool: any): FlashnetPoolRecord | null {
  if (!pool) return null

  const lpPublicKey = getString(pool.lpPublicKey || pool.lp_public_key)
  const assetAAddress =
    getString(pool.assetAAddress) ||
    getString(pool.assetA?.address) ||
    getString(pool.asset_a_address) ||
    getString(pool.asset_a?.address)
  const assetBAddress =
    getString(pool.assetBAddress) ||
    getString(pool.assetB?.address) ||
    getString(pool.asset_b_address) ||
    getString(pool.asset_b?.address)

  if (!lpPublicKey || !assetAAddress || !assetBAddress) {
    return null
  }

  return {
    lp_public_key: lpPublicKey,
    network: getString(pool.network) || FLASHNET_NETWORK,
    host_name: getString(pool.hostName || pool.host_name),
    host_namespace: getString(pool.hostNamespace || pool.host_namespace),
    curve_type: getString(pool.curveType || pool.curve_type),
    asset_a_address: assetAAddress,
    asset_b_address: assetBAddress,
    asset_a_name:
      getString(pool.assetAName) ||
      getString(pool.assetA?.name) ||
      getString(pool.asset_a_name) ||
      getString(pool.asset_a?.name),
    asset_b_name:
      getString(pool.assetBName) ||
      getString(pool.assetB?.name) ||
      getString(pool.asset_b_name) ||
      getString(pool.asset_b?.name),
    asset_a_symbol:
      getString(pool.assetASymbol) ||
      getString(pool.assetA?.symbol) ||
      getString(pool.asset_a_symbol) ||
      getString(pool.asset_a?.symbol),
    asset_b_symbol:
      getString(pool.assetBSymbol) ||
      getString(pool.assetB?.symbol) ||
      getString(pool.asset_b_symbol) ||
      getString(pool.asset_b?.symbol),
    asset_a_decimals:
      getNumber(pool.assetADecimals ?? pool.assetA?.decimals ?? pool.asset_a_decimals ?? pool.asset_a?.decimals) ??
      null,
    asset_b_decimals:
      getNumber(pool.assetBDecimals ?? pool.assetB?.decimals ?? pool.asset_b_decimals ?? pool.asset_b?.decimals) ??
      null,
    asset_a_reserve: getNumber(pool.assetAReserve ?? pool.asset_a_reserve ?? pool.assetA?.reserve),
    asset_b_reserve: getNumber(pool.assetBReserve ?? pool.asset_b_reserve ?? pool.assetB?.reserve),
    tvl_asset_b: getNumber(pool.tvlAssetB ?? pool.tvl_asset_b),
    volume_24h_asset_b: getNumber(pool.volume24hAssetB ?? pool.volume_24h_asset_b),
    price_change_percent_24h: getNumber(pool.priceChangePercent24h ?? pool.price_change_percent_24h),
    current_price_a_in_b: getNumber(pool.currentPriceAInB ?? pool.current_price_a_in_b),
    lp_fee_bps: getNumber(pool.lpFeeBps ?? pool.lp_fee_bps),
    host_fee_bps: getNumber(pool.hostFeeBps ?? pool.host_fee_bps),
    created_at: getString(pool.createdAt ?? pool.created_at),
    updated_at: getString(pool.updatedAt ?? pool.updated_at),
  }
}

export async function upsertFlashnetPools(
  pools: any[],
): Promise<{ inserted: number; updated: number; records: FlashnetPoolRecord[] }> {
  const toTimestamp = (value: string | null) => {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (!pools || pools.length === 0) {
    return { inserted: 0, updated: 0, records: [] }
  }

  const records = pools
    .map(normalizePool)
    .filter((record): record is FlashnetPoolRecord => record !== null)

  if (!records.length) {
    return { inserted: 0, updated: 0, records: [] }
  }

  const db = getPool()
  const client = await db.connect()
  let inserted = 0
  let updated = 0

  try {
    await client.query('BEGIN')

    const query = `
      INSERT INTO flashnet_pools (
        lp_public_key,
        network,
        host_name,
        host_namespace,
        curve_type,
        asset_a_address,
        asset_b_address,
        asset_a_name,
        asset_b_name,
        asset_a_symbol,
        asset_b_symbol,
        asset_a_decimals,
        asset_b_decimals,
        asset_a_reserve,
        asset_b_reserve,
        tvl_asset_b,
        volume_24h_asset_b,
        price_change_percent_24h,
        current_price_a_in_b,
        lp_fee_bps,
        host_fee_bps,
        created_at,
        updated_at,
        last_synced_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, NOW()
      )
      ON CONFLICT (lp_public_key) DO UPDATE SET
        network = EXCLUDED.network,
        host_name = EXCLUDED.host_name,
        host_namespace = EXCLUDED.host_namespace,
        curve_type = EXCLUDED.curve_type,
        asset_a_address = EXCLUDED.asset_a_address,
        asset_b_address = EXCLUDED.asset_b_address,
        asset_a_name = EXCLUDED.asset_a_name,
        asset_b_name = EXCLUDED.asset_b_name,
        asset_a_symbol = EXCLUDED.asset_a_symbol,
        asset_b_symbol = EXCLUDED.asset_b_symbol,
        asset_a_decimals = EXCLUDED.asset_a_decimals,
        asset_b_decimals = EXCLUDED.asset_b_decimals,
        asset_a_reserve = EXCLUDED.asset_a_reserve,
        asset_b_reserve = EXCLUDED.asset_b_reserve,
        tvl_asset_b = EXCLUDED.tvl_asset_b,
        volume_24h_asset_b = EXCLUDED.volume_24h_asset_b,
        price_change_percent_24h = EXCLUDED.price_change_percent_24h,
        current_price_a_in_b = EXCLUDED.current_price_a_in_b,
        lp_fee_bps = EXCLUDED.lp_fee_bps,
        host_fee_bps = EXCLUDED.host_fee_bps,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        last_synced_at = NOW()
      RETURNING (xmax = 0) AS inserted
    `

    for (const record of records) {
      const result = await client.query(query, [
        record.lp_public_key,
        record.network,
        record.host_name,
        record.host_namespace,
        record.curve_type,
        record.asset_a_address,
        record.asset_b_address,
        record.asset_a_name,
        record.asset_b_name,
        record.asset_a_symbol,
        record.asset_b_symbol,
        record.asset_a_decimals,
        record.asset_b_decimals,
        record.asset_a_reserve,
        record.asset_b_reserve,
        record.tvl_asset_b,
        record.volume_24h_asset_b,
        record.price_change_percent_24h,
        record.current_price_a_in_b,
        record.lp_fee_bps,
        record.host_fee_bps,
        toTimestamp(record.created_at),
        toTimestamp(record.updated_at),
      ])

      if (result.rows[0]?.inserted) {
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

  return { inserted, updated, records }
}

export async function listFlashnetPools({
  limit = 25,
  offset = 0,
}: {
  limit?: number
  offset?: number
} = {}): Promise<FlashnetPoolRecord[]> {
  const db = getPool()
  const res = await db.query<FlashnetPoolRecord>(
    `
      SELECT *
      FROM flashnet_pools
      ORDER BY COALESCE(tvl_asset_b, 0) DESC, COALESCE(volume_24h_asset_b, 0) DESC
      LIMIT $1 OFFSET $2
    `,
    [Math.max(1, Math.min(200, limit)), Math.max(0, offset)],
  )
  return res.rows
}

async function fetchPoolsByIdentifiers(identifiers: string[], limit: number): Promise<FlashnetPoolRecord[]> {
  if (!identifiers.length) return []
  const db = getPool()
  const res = await db.query<FlashnetPoolRecord>(
    `
      SELECT *
      FROM flashnet_pools
      WHERE LOWER(asset_a_address) = ANY($1)
         OR LOWER(asset_b_address) = ANY($1)
      ORDER BY COALESCE(tvl_asset_b, 0) DESC
      LIMIT $2
    `,
    [identifiers.map(value => value.toLowerCase()), Math.max(1, Math.min(50, limit))],
  )
  return res.rows
}

async function searchMetadataForIdentifiers(search: string, limit: number): Promise<string[]> {
  const db = getPool()
  const metaRes = await db.query<{ token_identifier: string; token_address: string | null }>(
    `
      SELECT token_identifier, token_address
      FROM flashnet_token_metadata
      WHERE LOWER(COALESCE(ticker, '')) = $1
         OR LOWER(COALESCE(name, '')) LIKE $2
         OR LOWER(token_identifier) = $1
      LIMIT $3
    `,
    [search, `${search}%`, Math.max(1, Math.min(50, limit * 2))],
  )

  const identifiers = new Set<string>()
  for (const record of metaRes.rows) {
    for (const key of buildMetadataLookupKeys(record)) {
      identifiers.add(key)
    }
  }
  return Array.from(identifiers)
}

export async function searchFlashnetPools(search: string, limit = 5): Promise<FlashnetPoolRecord[]> {
  const term = search.trim().toLowerCase()
  if (!term) return []

  const db = getPool()
  const res = await db.query<FlashnetPoolRecord>(
    `
      SELECT fp.*
      FROM flashnet_pools fp
      LEFT JOIN flashnet_token_metadata meta_a
        ON meta_a.token_identifier = fp.asset_a_address
        OR meta_a.token_address = fp.asset_a_address
      LEFT JOIN flashnet_token_metadata meta_b
        ON meta_b.token_identifier = fp.asset_b_address
        OR meta_b.token_address = fp.asset_b_address
      WHERE LOWER(fp.lp_public_key) = $1
         OR LOWER(fp.asset_a_address) = $1
         OR LOWER(fp.asset_b_address) = $1
         OR LOWER(COALESCE(fp.asset_a_symbol, '')) = $1
         OR LOWER(COALESCE(fp.asset_b_symbol, '')) = $1
         OR LOWER(COALESCE(meta_a.ticker, '')) = $1
         OR LOWER(COALESCE(meta_b.ticker, '')) = $1
         OR (meta_a.token_identifier IS NOT NULL AND LOWER(meta_a.token_identifier) = $1)
         OR (meta_b.token_identifier IS NOT NULL AND LOWER(meta_b.token_identifier) = $1)
         OR LOWER(COALESCE(fp.asset_a_name, '')) LIKE $2
         OR LOWER(COALESCE(fp.asset_b_name, '')) LIKE $2
         OR LOWER(COALESCE(meta_a.name, '')) LIKE $2
         OR LOWER(COALESCE(meta_b.name, '')) LIKE $2
      ORDER BY
        CASE
          WHEN LOWER(fp.lp_public_key) = $1 THEN 1
          WHEN LOWER(fp.asset_a_address) = $1 THEN 2
          WHEN LOWER(fp.asset_b_address) = $1 THEN 3
          WHEN LOWER(COALESCE(fp.asset_a_symbol, '')) = $1 THEN 4
          WHEN LOWER(COALESCE(fp.asset_b_symbol, '')) = $1 THEN 5
          WHEN LOWER(COALESCE(meta_a.ticker, '')) = $1 THEN 6
          WHEN LOWER(COALESCE(meta_b.ticker, '')) = $1 THEN 7
          ELSE 8
        END,
        COALESCE(fp.tvl_asset_b, 0) DESC
      LIMIT $3
    `,
    [term, `${term}%`, Math.max(1, Math.min(50, limit))],
  )

  const matches = res.rows
  if (matches.length) {
    return matches
  }

  const metadataIdentifiers = await searchMetadataForIdentifiers(term, limit)
  if (!metadataIdentifiers.length) {
    return []
  }

  return fetchPoolsByIdentifiers(metadataIdentifiers, limit)
}

export async function countFlashnetPools(): Promise<number> {
  const db = getPool()
  const res = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM flashnet_pools`)
  return Number(res.rows[0]?.count ?? 0)
}

export interface FlashnetTokenMetadataRecord {
  token_identifier: string
  token_address: string | null
  name: string | null
  ticker: string | null
  decimals: number | null
  max_supply: string | null
  icon_url: string | null
}

export async function upsertFlashnetTokenMetadata(
  records: FlashnetTokenMetadataRecord[],
): Promise<{ inserted: number; updated: number }> {
  if (!records.length) {
    return { inserted: 0, updated: 0 }
  }

  const db = getPool()
  const client = await db.connect()
  let inserted = 0
  let updated = 0

  try {
    await client.query('BEGIN')

    const query = `
      INSERT INTO flashnet_token_metadata (
        token_identifier,
        token_address,
        name,
        ticker,
        decimals,
        max_supply,
        icon_url,
        last_synced_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW()
      )
      ON CONFLICT (token_identifier) DO UPDATE SET
        token_address = EXCLUDED.token_address,
        name = EXCLUDED.name,
        ticker = EXCLUDED.ticker,
        decimals = EXCLUDED.decimals,
        max_supply = EXCLUDED.max_supply,
        icon_url = EXCLUDED.icon_url,
        last_synced_at = NOW()
      RETURNING (xmax = 0) AS inserted
    `

    for (const record of records) {
      const result = await client.query(query, [
        record.token_identifier,
        record.token_address,
        record.name,
        record.ticker,
        record.decimals,
        record.max_supply,
        record.icon_url,
      ])
      if (result.rows[0]?.inserted) {
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

export async function listFlashnetTokenMetadata(tokenIdentifiers: string[]) {
  if (!tokenIdentifiers.length) return []
  const db = getPool()
  const res = await db.query<FlashnetTokenMetadataRecord>(
    `
      SELECT token_identifier, token_address, name, ticker, decimals, max_supply, icon_url
      FROM flashnet_token_metadata
      WHERE token_identifier = ANY($1)
    `,
    [tokenIdentifiers],
  )
  return res.rows
}

function normalizeTokenMetadata(
  item: any,
  network: NetworkType = FLASHNET_NETWORK,
): FlashnetTokenMetadataRecord | null {
  if (!item?.tokenIdentifier) return null
  const rawIdentifier = item.tokenIdentifier
  const tokenIdentifier = encodeBech32mTokenIdentifier({
    tokenIdentifier: new Uint8Array(rawIdentifier),
    network,
  })

  let decimals: number | null = null
  if (item.decimals !== null && item.decimals !== undefined) {
    const asNumber = typeof item.decimals === 'number' ? item.decimals : Number(item.decimals)
    decimals = Number.isFinite(asNumber) ? asNumber : null
  }

  let maxSupply: string | null = null
  if (item.maxSupply !== null && item.maxSupply !== undefined) {
    const supplyString =
      typeof item.maxSupply === 'bigint'
        ? item.maxSupply.toString()
        : typeof item.maxSupply === 'string'
        ? item.maxSupply
        : typeof item.maxSupply === 'number'
        ? item.maxSupply.toString()
        : item.maxSupply?.toString?.()
    if (typeof supplyString === 'string' && supplyString.trim() !== '' && /^-?\d+(\.\d+)?$/.test(supplyString)) {
      maxSupply = supplyString
    }
  }

  return {
    token_identifier: tokenIdentifier,
    token_address: item.tokenAddress ?? null,
    name: item.tokenName ?? null,
    ticker: item.tokenTicker ?? null,
    decimals,
    max_supply: maxSupply,
    icon_url: item.iconUrl ?? null,
  }
}

export async function fetchFlashnetTokenMetadata(
  client: FlashnetClient,
  identifiers: string[],
): Promise<FlashnetTokenMetadataRecord[]> {
  if (!identifiers.length) return []

  const decodedIds = identifiers
    .map(identifier => toTokenIdentifierBytes(identifier, FLASHNET_NETWORK))
    .filter((bytes): bytes is Uint8Array => !!bytes)

  if (!decodedIds.length) {
    return []
  }

  const wallet: any = client.wallet as any
  const connectionManager = wallet?.connectionManager
  const config = wallet?.config

  if (!connectionManager || !config || typeof connectionManager.createSparkTokenClient !== 'function') {
    throw new Error('Spark token client unavailable on Flashnet wallet')
  }

  const coordinatorAddress =
    typeof config.getCoordinatorAddress === 'function' ? config.getCoordinatorAddress() : undefined
  if (!coordinatorAddress) {
    throw new Error('Unable to determine coordinator address for Spark token client')
  }

  const sparkTokenClient = await connectionManager.createSparkTokenClient(coordinatorAddress)
  try {
    const response = await sparkTokenClient.query_token_metadata({
      tokenIdentifiers: decodedIds,
    })

    const records =
      response?.tokenMetadata
        ?.map((item: any) => normalizeTokenMetadata(item, config.getNetworkType?.() ?? FLASHNET_NETWORK))
        .filter((record: FlashnetTokenMetadataRecord | null): record is FlashnetTokenMetadataRecord => !!record) ?? []

    return records
  } catch (error) {
    console.warn('[Flashnet] token metadata fetch failed:', error instanceof Error ? error.message : error)
    return []
  } finally {
    if (sparkTokenClient?.close) {
      sparkTokenClient.close()
    }
  }
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function enrichPoolsWithMetadata(
  client: FlashnetClient,
  pools: FlashnetPoolRecord[],
): Promise<void> {
  const tokenIdentifiers = new Set<string>()
  for (const pool of pools) {
    if (pool.asset_a_address) tokenIdentifiers.add(pool.asset_a_address)
    if (pool.asset_b_address) tokenIdentifiers.add(pool.asset_b_address)
  }

  if (!tokenIdentifiers.size) return

  const existing = await listFlashnetTokenMetadata(Array.from(tokenIdentifiers))
  const existingMap = new Map(existing.map(record => [record.token_identifier, record]))

  const missing = Array.from(tokenIdentifiers).filter(id => !existingMap.has(id))
  if (missing.length) {
    for (const chunk of chunkArray(missing, FLASHNET_METADATA_BATCH_SIZE)) {
      try {
        const metadata = await fetchFlashnetTokenMetadata(client, chunk)
        if (metadata.length) {
          await upsertFlashnetTokenMetadata(metadata)
        }
      } catch (error) {
        console.error('[Flashnet] token metadata fetch failed:', error)
      }
    }
  }
}

export async function getTokenMetadataMapForPools(
  pools: FlashnetPoolRecord[],
): Promise<Map<string, FlashnetTokenMetadataRecord>> {
  const identifiers = new Set<string>()
  for (const pool of pools) {
    if (pool.asset_a_address) identifiers.add(pool.asset_a_address)
    if (pool.asset_b_address) identifiers.add(pool.asset_b_address)
  }
  if (!identifiers.size) return new Map()
  const records = await listFlashnetTokenMetadata(Array.from(identifiers))
  const map = new Map<string, FlashnetTokenMetadataRecord>()
  for (const record of records) {
    for (const key of buildMetadataLookupKeys(record)) {
      map.set(key, record)
    }
  }
  return map
}

export interface FlashnetPoolWithMetadata extends FlashnetPoolRecord {
  asset_a_metadata: FlashnetTokenMetadataRecord | null
  asset_b_metadata: FlashnetTokenMetadataRecord | null
}

export async function attachStoredMetadataToPools(
  pools: FlashnetPoolRecord[],
): Promise<FlashnetPoolWithMetadata[]> {
  const metadataMap = await getTokenMetadataMapForPools(pools)
  return pools.map(pool => ({
    ...pool,
    asset_a_metadata: pool.asset_a_address
      ? metadataMap.get(pool.asset_a_address.toLowerCase()) ?? null
      : null,
    asset_b_metadata: pool.asset_b_address
      ? metadataMap.get(pool.asset_b_address.toLowerCase()) ?? null
      : null,
  }))
}

function buildMetadataLookupKeys(record: { token_identifier: string; token_address: string | null }): string[] {
  const keys = new Set<string>()
  if (record.token_identifier) {
    keys.add(record.token_identifier.toLowerCase())
    const bytes = toTokenIdentifierBytes(record.token_identifier, FLASHNET_NETWORK)
    if (bytes) {
      keys.add(Buffer.from(bytes).toString('hex').toLowerCase())
    }
  }
  if (record.token_address) {
    keys.add(record.token_address.toLowerCase())
  }
  return Array.from(keys)
}




