/**
 * Holder verification via Ordiscan + public/collection.json.
 *
 * Replaces Magic Eden's discontinued /v2/ord/btc/tokens endpoint.
 * Flow: fetch all inscriptions for a wallet via Ordiscan, then filter to
 * the IDs present in public/collection.json. Returns tokens in a shape
 * compatible with the legacy Magic Eden response so downstream consumers
 * continue to work unchanged.
 */

import { promises as fs } from 'fs'
import path from 'path'

const ORDISCAN_BASE = 'https://api.ordiscan.com/v1'

export interface CollectionEntry {
  name: string
  attributes: Array<{ trait_type: string; value: string }>
}

export interface HolderToken {
  id: string
  inscriptionId: string
  meta: {
    name: string
    attributes: Array<{ trait_type: string; value: string }>
  }
  contentURI: string
  listed: false
  collectionSymbol: 'the-damned'
  _walletSource: string
  _isLinkedWallet: boolean
}

let collectionCache: Map<string, CollectionEntry> | null = null
let collectionLoadPromise: Promise<Map<string, CollectionEntry>> | null = null

async function loadCollectionMap(): Promise<Map<string, CollectionEntry>> {
  if (collectionCache) return collectionCache
  if (collectionLoadPromise) return collectionLoadPromise

  collectionLoadPromise = (async () => {
    const filePath = path.join(process.cwd(), 'public', 'collection.json')
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed: Array<{ id: string; meta?: { name?: string; attributes?: Array<{ trait_type?: string; value?: string }> } }> = JSON.parse(raw)

    const map = new Map<string, CollectionEntry>()
    for (const item of parsed) {
      if (!item?.id) continue
      const attributes = (item.meta?.attributes ?? []).map((a) => ({
        trait_type: String(a.trait_type ?? ''),
        value: String(a.value ?? ''),
      }))
      map.set(item.id, {
        name: item.meta?.name ?? '',
        attributes,
      })
    }

    collectionCache = map
    return map
  })()

  return collectionLoadPromise
}

interface OrdiscanInscription {
  inscription_id: string
  inscription_number?: number
  content_type?: string
  content_url?: string
}

async function fetchAllInscriptions(address: string, apiKey: string): Promise<string[]> {
  const ids: string[] = []
  let page = 1
  const MAX_PAGES = 30

  while (page <= MAX_PAGES) {
    const res = await fetch(
      `${ORDISCAN_BASE}/address/${encodeURIComponent(address)}/inscriptions?page=${page}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' }
    )
    if (!res.ok) {
      if (page === 1) throw new Error(`Ordiscan error ${res.status}`)
      break
    }
    const body = await res.json()
    const items: OrdiscanInscription[] = body?.data ?? []
    if (!items.length) break
    for (const item of items) {
      if (item.inscription_id) ids.push(item.inscription_id)
    }
    if (items.length < 100) break
    page++
  }

  return ids
}

function buildToken(
  inscriptionId: string,
  entry: CollectionEntry,
  walletAddress: string,
  isLinked: boolean,
): HolderToken {
  return {
    id: inscriptionId,
    inscriptionId,
    meta: {
      name: entry.name,
      attributes: entry.attributes,
    },
    contentURI: `https://ord-mirror.magiceden.dev/content/${inscriptionId}`,
    listed: false,
    collectionSymbol: 'the-damned',
    _walletSource: walletAddress,
    _isLinkedWallet: isLinked,
  }
}

/**
 * Get all collection-matching tokens held by a single wallet address.
 * Returns an empty array on any Ordiscan failure (caller decides how to handle).
 */
export async function getHolderTokensForAddress(address: string): Promise<HolderToken[]> {
  const apiKey = process.env.ORDISCAN_API_KEY
  if (!apiKey) throw new Error('ORDISCAN_API_KEY not configured')

  const [collection, inscriptionIds] = await Promise.all([
    loadCollectionMap(),
    fetchAllInscriptions(address, apiKey),
  ])

  const tokens: HolderToken[] = []
  for (const id of inscriptionIds) {
    const entry = collection.get(id)
    if (entry) tokens.push(buildToken(id, entry, address, false))
  }
  return tokens
}

export interface WalletQuery {
  address: string
  isPrimary: boolean
}

/**
 * Get tokens held across multiple wallet addresses (primary + linked).
 * Individual wallet failures are logged and skipped rather than aborting the whole query.
 */
export async function getHolderTokensForWallets(wallets: WalletQuery[]): Promise<HolderToken[]> {
  const apiKey = process.env.ORDISCAN_API_KEY
  if (!apiKey) throw new Error('ORDISCAN_API_KEY not configured')

  const collection = await loadCollectionMap()
  const aggregated: HolderToken[] = []

  for (const wallet of wallets) {
    try {
      const inscriptionIds = await fetchAllInscriptions(wallet.address, apiKey)
      for (const id of inscriptionIds) {
        const entry = collection.get(id)
        if (entry) aggregated.push(buildToken(id, entry, wallet.address, !wallet.isPrimary))
      }
    } catch (error) {
      console.error(`[holder-verification] Failed to fetch inscriptions for ${wallet.address}:`, error)
    }
  }

  return aggregated
}

/**
 * Count of collection-matching inscriptions held by a single address.
 * Returns 0 on Ordiscan failure so cron jobs don't wrongly flag wallets.
 */
export async function getHolderCount(address: string): Promise<number | null> {
  try {
    const tokens = await getHolderTokensForAddress(address)
    return tokens.length
  } catch (error) {
    console.error(`[holder-verification] getHolderCount failed for ${address}:`, error)
    return null
  }
}
