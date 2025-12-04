const DEFAULT_SANDSHREW_URL = process.env.SANDSHREW_URL || 'https://mainnet.sandshrew.io/v2'
const SANDSHREW_DEVELOPER_KEY = process.env.SANDSHREW_DEVELOPER_KEY

export interface SandshrewRuneIdentifier {
  block: string
  tx: string
}

export interface SandshrewRuneMetadata {
  id: SandshrewRuneIdentifier
  name?: string
  spacedName?: string
  divisibility?: number
  spacers?: number
  symbol?: string
}

export interface SandshrewRuneBalance {
  rune: SandshrewRuneMetadata
  balance: string
}

export interface SandshrewSpendableUtxo {
  outpoint: string
  value?: number | string
  height?: number | string | null
}

export interface SandshrewAssetUtxo extends SandshrewSpendableUtxo {
  inscriptions?: string[] | string | null
  runes?: SandshrewRuneBalance[] | null
}

export interface SandshrewPendingUtxo extends SandshrewAssetUtxo {
  status?: string
}

export interface SandshrewBalancesResult {
  spendable?: SandshrewSpendableUtxo[]
  assets?: SandshrewAssetUtxo[]
  pending?: SandshrewPendingUtxo[]
  ordHeight?: number
  metashrewHeight?: number
}

export interface SandshrewEsploraTxOutput {
  scriptpubkey: string
  scriptpubkey_asm?: string
  scriptpubkey_type?: string
  scriptpubkey_address?: string
  value: number
}

export interface SandshrewEsploraTx {
  txid: string
  version: number
  locktime: number
  vin: unknown[]
  vout: SandshrewEsploraTxOutput[]
  size?: number
  weight?: number
  fee?: number
  status?: {
    confirmed: boolean
    block_height?: number
    block_hash?: string
    block_time?: number
  }
}

export interface SandshrewEsploraTxResponse {
  jsonrpc: string
  id: string
  result?: SandshrewEsploraTx
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface SandshrewBalancesResponse {
  jsonrpc: string
  id: string
  result?: SandshrewBalancesResult
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface BaseUtxo {
  outpoint: string
  txid: string
  vout: number
  value: number
  height: number | null
}

export interface InscriptionUtxo extends BaseUtxo {
  inscriptions: string[]
}

export type RuneCategory = 'rune' | 'alkane'

export interface ProcessedRuneBalance {
  category: RuneCategory
  rawId: SandshrewRuneIdentifier
  block: number | null
  txIndex: number | null
  name: string | undefined
  spacedName: string | undefined
  symbol: string | undefined
  divisibility: number
  spacers: number
  rawBalance: string
  balance: bigint
  balanceFormatted: string
}

export interface RuneBearingUtxo extends BaseUtxo {
  category: RuneCategory
  runeBalances: ProcessedRuneBalance[]
}

export interface PendingUtxo extends BaseUtxo {
  status?: string
  inscriptions?: string[]
  runeBalances?: ProcessedRuneBalance[]
}

export interface CategorisedWalletAssets {
  address: string
  ordHeight?: number
  metashrewHeight?: number
  spendable: BaseUtxo[]
  inscriptions: InscriptionUtxo[]
  runes: RuneBearingUtxo[]
  alkanes: RuneBearingUtxo[]
  pending: PendingUtxo[]
  raw: SandshrewBalancesResult
}

const MAINNET_RUNES_ACTIVATION_BLOCK = 840_000

function requireSandshrewKey(): string {
  if (!SANDSHREW_DEVELOPER_KEY || !SANDSHREW_DEVELOPER_KEY.trim()) {
    throw new Error('SANDSHREW_DEVELOPER_KEY environment variable is not set')
  }
  return SANDSHREW_DEVELOPER_KEY.trim()
}

function buildSandshrewEndpoint(): string {
  const key = requireSandshrewKey()
  const base = DEFAULT_SANDSHREW_URL.replace(/\/+$/, '')
  return `${base}/${key}`
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function parseOutpoint(outpoint: string): { txid: string; vout: number } {
  const [txid, vout] = outpoint.split(':')
  return {
    txid: txid || '',
    vout: Number.parseInt(vout || '0', 10) || 0,
  }
}

function normaliseBaseUtxo(entry: SandshrewSpendableUtxo): BaseUtxo {
  const value = toNumber(entry.value) ?? 0
  const height = toNumber(entry.height)
  const { txid, vout } = parseOutpoint(entry.outpoint)

  return {
    outpoint: entry.outpoint,
    txid,
    vout,
    value,
    height,
  }
}

function normaliseInscriptions(value: SandshrewAssetUtxo['inscriptions']): string[] {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
  }

  if (typeof value === 'string') {
    return value
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
  }

  return []
}

function parseHexToBigInt(value: string): bigint {
  const trimmed = value.trim()
  if (/^0x/i.test(trimmed)) {
    return BigInt(trimmed)
  }
  return BigInt(`0x${trimmed}`)
}

function safeParseHexInt(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  try {
    return Number.parseInt(value, 16)
  } catch {
    return null
  }
}

function formatWithDivisibility(amount: bigint, divisibility: number): string {
  if (divisibility <= 0) {
    return amount.toString()
  }

  let base = BigInt(1)
  for (let index = 0; index < divisibility; index += 1) {
    base *= BigInt(10)
  }

  const whole = amount / base
  const fraction = amount % base

  if (fraction === BigInt(0)) {
    return whole.toString()
  }

  const fractionString = fraction
    .toString()
    .padStart(divisibility, '0')
    .replace(/0+$/, '')

  return `${whole.toString()}.${fractionString}`
}

function determineRuneCategory(rune: SandshrewRuneMetadata): RuneCategory {
  const blockNumber = safeParseHexInt(rune.id?.block)
  if (blockNumber !== null && blockNumber < MAINNET_RUNES_ACTIVATION_BLOCK) {
    return 'alkane'
  }

  const symbol = rune.symbol?.trim().toUpperCase()
  const name = rune.name?.trim().toUpperCase()

  if (symbol?.includes('ALK') || name?.includes('ALKANE')) {
    return 'alkane'
  }

  return 'rune'
}

function normaliseRuneBalances(
  balances?: SandshrewRuneBalance[] | null,
): ProcessedRuneBalance[] {
  if (!balances || !Array.isArray(balances)) {
    return []
  }

  return balances
    .map((entry) => {
      try {
        const balanceBigInt = parseHexToBigInt(entry.balance)
        const category = determineRuneCategory(entry.rune)
        const divisibility = Number.isFinite(entry.rune.divisibility)
          ? (entry.rune.divisibility as number)
          : 0

        return {
          category,
          rawId: entry.rune.id,
          block: safeParseHexInt(entry.rune.id?.block),
          txIndex: safeParseHexInt(entry.rune.id?.tx),
          name: entry.rune.name,
          spacedName: entry.rune.spacedName,
          symbol: entry.rune.symbol,
          divisibility,
          spacers: entry.rune.spacers ?? 0,
          rawBalance: entry.balance,
          balance: balanceBigInt,
          balanceFormatted: formatWithDivisibility(balanceBigInt, divisibility),
        } satisfies ProcessedRuneBalance
      } catch (error) {
        console.warn('[Sandshrew] Failed to normalise rune balance', error)
        return null
      }
    })
    .filter((entry): entry is ProcessedRuneBalance => Boolean(entry))
}

export function categoriseWalletAssets(
  address: string,
  result: SandshrewBalancesResult,
): CategorisedWalletAssets {
  const spendable = (result.spendable ?? []).map(normaliseBaseUtxo)

  const inscriptions: InscriptionUtxo[] = []
  const runeBuckets: Record<RuneCategory, RuneBearingUtxo[]> = {
    rune: [],
    alkane: [],
  }

  for (const asset of result.assets ?? []) {
    const base = normaliseBaseUtxo(asset)
    const inscriptionIds = normaliseInscriptions(asset.inscriptions)
    if (inscriptionIds.length > 0) {
      inscriptions.push({
        ...base,
        inscriptions: inscriptionIds,
      })
    }

    const runeBalances = normaliseRuneBalances(asset.runes)
    if (runeBalances.length > 0) {
      const balancesByCategory = runeBalances.reduce<Map<RuneCategory, ProcessedRuneBalance[]>>((acc, balance) => {
        const bucket = acc.get(balance.category) ?? []
        bucket.push(balance)
        acc.set(balance.category, bucket)
        return acc
      }, new Map())

      for (const [category, balances] of Array.from(balancesByCategory.entries())) {
        runeBuckets[category as RuneCategory].push({
          ...base,
          category: category as RuneCategory,
          runeBalances: balances,
        })
      }
    }
  }

  const pending: PendingUtxo[] = (result.pending ?? []).map((pendingEntry) => {
    const base = normaliseBaseUtxo(pendingEntry)
    return {
      ...base,
      status: pendingEntry.status,
      inscriptions: normaliseInscriptions(pendingEntry.inscriptions),
      runeBalances: normaliseRuneBalances(pendingEntry.runes),
    }
  })

  return {
    address,
    ordHeight: result.ordHeight,
    metashrewHeight: result.metashrewHeight,
    spendable,
    inscriptions,
    runes: runeBuckets.rune,
    alkanes: runeBuckets.alkane,
    pending,
    raw: result,
  }
}

export async function fetchSandshrewBalances(
  address: string,
  requestOptions?: RequestInit,
): Promise<SandshrewBalancesResult> {
  const endpoint = buildSandshrewEndpoint()
  const payload = {
    jsonrpc: '2.0',
    id: `wallet-${address}`,
    method: 'sandshrew_balances',
    params: [{ address }],
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, max-age=0',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    ...requestOptions,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Sandshrew balances request failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const json = (await response.json()) as SandshrewBalancesResponse

  if (json.error) {
    throw new Error(`Sandshrew responded with error ${json.error.code}: ${json.error.message}`)
  }

  if (!json.result) {
    throw new Error('Sandshrew response missing result field')
  }

  const sanitize = (input: unknown): unknown => {
    if (typeof input === 'bigint') {
      return input.toString()
    }
    if (Array.isArray(input)) {
      return input.map(sanitize)
    }
    if (input && typeof input === 'object') {
      const entries = Object.entries(input as Record<string, unknown>).map(([key, value]) => [
        key,
        sanitize(value),
      ])
      return Object.fromEntries(entries)
    }
    return input
  }

  return sanitize(json.result) as SandshrewBalancesResult
}

export async function fetchSandshrewTx(
  txid: string,
  requestOptions?: RequestInit,
): Promise<SandshrewEsploraTx> {
  if (!txid || txid.length !== 64) {
    throw new Error('A valid txid is required (64 hex characters)')
  }

  const endpoint = buildSandshrewEndpoint()
  const payload = {
    jsonrpc: '2.0',
    id: `tx-${txid}`,
    method: 'esplora_tx',
    params: [txid],
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, max-age=0',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    ...requestOptions,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Sandshrew tx request failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const json = (await response.json()) as SandshrewEsploraTxResponse

  if (json.error) {
    throw new Error(`Sandshrew responded with error ${json.error.code}: ${json.error.message}`)
  }

  if (!json.result) {
    throw new Error('Sandshrew tx response missing result field')
  }

  return json.result
}

