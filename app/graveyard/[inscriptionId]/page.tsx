import { cache } from 'react'
import { promises as fs } from 'fs'
import path from 'path'

import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { Ordinal, Trait } from '@/types'
import { getPool } from '@/lib/db'
import { Button } from '@/components/ui/button'

const HeaderClient = dynamic(() => import('@/components/Header'), { ssr: false })

const ORDINALS_FILE_PATH = path.join(process.cwd(), 'public', 'generated_ordinals.json')

const loadOrdinals = cache(async (): Promise<Ordinal[]> => {
  try {
    const fileContents = await fs.readFile(ORDINALS_FILE_PATH, 'utf8')
    return JSON.parse(fileContents) as Ordinal[]
  } catch (error) {
    console.error('[graveyard detail] Failed to load generated ordinals file:', error)
    return []
  }
})

function normalize(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function stripInscriptionSuffix(value: string) {
  if (!value) return value
  return value.endsWith('i0') ? value.slice(0, -2) : value
}

async function findOrdinalByInscriptionId(inscriptionId: string) {
  const ordinals = await loadOrdinals()
  const normalized = normalize(inscriptionId)
  const withoutSuffix = stripInscriptionSuffix(normalized)
  const hexCandidate = withoutSuffix.replace(/[^a-f0-9]/g, '')

  return ordinals.find((ordinal) => {
    const ordinalInscriptionId = normalize(ordinal.inscription_id)
    const ordinalId = normalize(ordinal.id)
    const ordinalTraitHash = normalize(ordinal.trait_combination_hash ?? '')
    if (ordinalInscriptionId === normalized || ordinalId === normalized) {
      return true
    }
    if (ordinalTraitHash && hexCandidate && ordinalTraitHash === hexCandidate) {
      return true
    }
    const metadataUrl = normalize(ordinal.metadata_url)
    const imageUrl = normalize(ordinal.image_url)
    return (
      (metadataUrl && metadataUrl.includes(normalized)) ||
      (imageUrl && imageUrl.includes(normalized)) ||
      (metadataUrl && hexCandidate && metadataUrl.includes(hexCandidate)) ||
      (imageUrl && hexCandidate && imageUrl.includes(hexCandidate))
    )
  })
}

async function loadGraveyardRecord(inscriptionId: string): Promise<GraveyardRecord | null> {
  try {
    const pool = getPool()
    // For ascended images, prioritize exact match since they have unique IDs with timestamps
    const isAscended = inscriptionId.toLowerCase().startsWith('ascended_')
    const base = stripInscriptionSuffix(inscriptionId)
    
    // Build candidates - for ascended images, exact match is critical
    const candidateSet = new Set<string>()
    
    // Always include exact match first (most important for ascended images)
    candidateSet.add(inscriptionId.toLowerCase())
    
    if (!isAscended) {
      // For non-ascended, include variants
      candidateSet.add(base.toLowerCase())
      if (base !== inscriptionId) {
        candidateSet.add(`${base}i0`.toLowerCase())
      }
    } else {
      // For ascended images, also try variants in case of URL encoding issues
      candidateSet.add(base.toLowerCase())
      if (base !== inscriptionId) {
        candidateSet.add(`${base}i0`.toLowerCase())
      }
    }
    
    const candidates = Array.from(candidateSet)

    if (candidates.length === 0) {
      return null
    }

    const result = await pool.query(
      `
        SELECT
          b.inscription_id,
          b.ordinal_wallet,
          b.created_at,
          b.confirmed_at,
          b.updated_at,
          b.status,
          b.ascension_powder AS ordinal_ascension_powder,
          b.image_blob_url,
          p.username,
          p.avatar_url,
          p.ascension_powder
        FROM abyss_burns b
        LEFT JOIN profiles p ON LOWER(p.wallet_address) = LOWER(b.ordinal_wallet)
        WHERE LOWER(b.inscription_id) = ANY($1)
          AND b.hidden = FALSE
        ORDER BY b.updated_at DESC NULLS LAST, b.created_at DESC NULLS LAST
        LIMIT 1
      `,
      [candidates],
    )

    if (result.rows.length === 0) {
      console.error('[graveyard detail] No record found for inscription:', inscriptionId, 'candidates:', candidates)
      return null
    }

    const row = result.rows[0]
    const record = {
      inscription_id: row?.inscription_id ?? '',
      ordinal_wallet: row?.ordinal_wallet ?? null,
      created_at: row?.created_at ?? null,
      confirmed_at: row?.confirmed_at ?? null,
      updated_at: row?.updated_at ?? null,
      status: row?.status ?? null,
      image_blob_url: row?.image_blob_url ?? null,
      username: row?.username ?? null,
      avatar_url: row?.avatar_url ?? null,
      profile_ascension_powder:
        typeof row?.ascension_powder === 'number'
          ? Number(row.ascension_powder)
          : Number.parseInt(row?.ascension_powder ?? '0', 10) || 0,
      ordinal_ascension_powder:
        typeof row?.ordinal_ascension_powder === 'number'
          ? Number(row.ordinal_ascension_powder)
          : Number.parseInt(row?.ordinal_ascension_powder ?? '0', 10) || 0,
    }
    
    // Debug log for ascended images
    if (record.inscription_id.toLowerCase().startsWith('ascended_')) {
      console.log('[graveyard detail] Found ascended record:', {
        inscription_id: record.inscription_id,
        has_image_blob_url: !!record.image_blob_url,
        image_blob_url: record.image_blob_url ? `${record.image_blob_url.substring(0, 50)}...` : null,
      })
    }
    
    return record
  } catch (error) {
    console.error('[graveyard detail] Failed to load abyss burn record:', error)
    return null
  }
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toLocaleString()
}

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  const intervals = [
    { label: 'day', seconds: 86_400 },
    { label: 'hour', seconds: 3_600 },
    { label: 'minute', seconds: 60 },
  ] as const

  for (const { label, seconds } of intervals) {
    if (diffSeconds >= seconds) {
      const count = Math.floor(diffSeconds / seconds)
      return `${count} ${label}${count === 1 ? '' : 's'} ago`
    }
  }

  return `${diffSeconds}s ago`
}

function TraitList({ traits }: { traits: Record<string, Trait> }) {
  const entries = Object.entries(traits)
  if (entries.length === 0) {
    return (
      <p className="text-sm uppercase tracking-[0.3em] text-red-200/70">
        No trait metadata recorded for this inscription yet.
      </p>
    )
  }

  return (
    <dl className="grid gap-4 md:grid-cols-2">
      {entries.map(([category, trait]) => (
        <div
          key={category}
          className="rounded-2xl border border-red-600/40 bg-black/60 p-4 shadow-[0_0_20px_rgba(220,38,38,0.25)]"
        >
          <dt className="text-xs font-semibold uppercase tracking-[0.35em] text-red-300">
            {category.replace(/_/g, ' ')}
          </dt>
          <dd className="mt-2 space-y-2">
            <p className="text-sm text-red-100">{trait.name}</p>
            {trait.description && <p className="text-xs text-red-200/75">{trait.description}</p>}
            {trait.trait_prompt && (
              <p className="text-[11px] uppercase tracking-[0.35em] text-red-300/60">
                Prompt: {trait.trait_prompt}
              </p>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

type GraveyardRecord = {
  inscription_id: string
  ordinal_wallet: string | null
  created_at: string | null
  confirmed_at: string | null
  updated_at: string | null
  status: string | null
  image_blob_url: string | null
  username: string | null
  avatar_url: string | null
  profile_ascension_powder: number | null
  ordinal_ascension_powder: number | null
}

type PageProps = {
  params: { inscriptionId: string }
}

export default async function GraveyardInscriptionPage({ params }: PageProps) {
  const rawInscriptionId = params.inscriptionId ?? ''
  const decodedInscriptionId = decodeURIComponent(rawInscriptionId)
  const isAscendedImage = decodedInscriptionId.toLowerCase().startsWith('ascended_')
  
  // For ascended images, don't try to find in ordinals.json (they don't exist there)
  const ordinal = isAscendedImage ? null : (decodedInscriptionId ? await findOrdinalByInscriptionId(decodedInscriptionId) : null)
  const burnRecord = decodedInscriptionId ? await loadGraveyardRecord(decodedInscriptionId) : null

  // For ascended images, ONLY use blob URL (they're not real inscriptions)
  // For regular inscriptions, prioritize blob URL, then ordinal image_url, then ord-mirror
  const imageUrl = isAscendedImage
    ? (burnRecord?.image_blob_url ?? null)
    : (burnRecord?.image_blob_url ?? ordinal?.image_url ?? `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(decodedInscriptionId)}`)
  
  const downloadUrl = isAscendedImage
    ? (burnRecord?.image_blob_url ?? null)
    : (burnRecord?.image_blob_url ?? ordinal?.image_url ?? `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(decodedInscriptionId)}`)

  // Debug logging for ascended images
  if (isAscendedImage) {
    console.log('[graveyard detail] Ascended image URL:', {
      hasBurnRecord: !!burnRecord,
      imageBlobUrl: burnRecord?.image_blob_url ? `${burnRecord.image_blob_url.substring(0, 50)}...` : null,
      imageUrl: imageUrl ? `${imageUrl.substring(0, 50)}...` : null,
      downloadUrl: downloadUrl ? `${downloadUrl.substring(0, 50)}...` : null,
    })
  }

  const mintedAt = formatTimestamp(ordinal?.minted_at)
  const createdAt = formatTimestamp(ordinal?.created_at)
  const burnCreatedAt = formatTimestamp(burnRecord?.created_at ?? null)
  const burnConfirmedAt = formatTimestamp(burnRecord?.confirmed_at ?? null)
  const sacrificerWallet = burnRecord?.ordinal_wallet ?? null
  const sacrificerDisplayName =
    burnRecord?.username ??
    (sacrificerWallet ? `${sacrificerWallet.slice(0, 4)}…${sacrificerWallet.slice(-6)}` : null)
  const timeInGraveyardReference = burnRecord?.confirmed_at ?? burnRecord?.created_at ?? burnRecord?.updated_at ?? null
  const timeInGraveyard = formatRelativeTime(timeInGraveyardReference)
  const profilePowder = Math.max(0, Math.round(burnRecord?.profile_ascension_powder ?? 0))
  const ordinalPowder = Math.max(0, Math.round(burnRecord?.ordinal_ascension_powder ?? 0))
  const hasPowder = profilePowder > 0
  const ascensionPercent = Math.min(100, Math.round((ordinalPowder / 500) * 100))
  const hasAscended = ordinalPowder >= 500
  const rarityScore =
    typeof ordinal?.rarity_score === 'number' && Number.isFinite(ordinal.rarity_score)
      ? ordinal.rarity_score.toFixed(2)
      : null

  return (
    <div className="min-h-screen bg-black text-red-100">
      <HeaderClient showMusicControls={false} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 md:py-16">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/graveyard"
            className="inline-flex items-center gap-2 rounded-full border border-red-500/60 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-100 transition hover:bg-red-600/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            ← Back to Graveyard
          </Link>
          <div className="hidden items-center gap-3 text-xs uppercase tracking-[0.35em] text-red-300/70 sm:flex">
            {burnRecord?.avatar_url && (
              <Image
                src={burnRecord.avatar_url}
                alt={sacrificerDisplayName ?? 'Sacrificer avatar'}
                width={44}
                height={44}
                className="h-11 w-11 rounded-full border border-red-500/60 object-cover"
              />
            )}
            <div className="text-right">
              <p>Graveyard Inscription</p>
              
              {sacrificerDisplayName && (
                <p className="text-[10px] uppercase tracking-[0.3em] text-red-200/60">
                  Offered by {sacrificerDisplayName}
                  {timeInGraveyard ? ` • ${timeInGraveyard}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="relative overflow-hidden rounded-3xl border border-red-600/50 bg-black/70 shadow-[0_0_40px_rgba(220,38,38,0.3)]">
            <div className="relative aspect-square">
              {imageUrl ? (
                // For blob URLs, use regular img tag to avoid Next.js Image optimization issues
                imageUrl.includes('blob.vercel-storage.com') || imageUrl.includes('blob:') ? (
                  <img
                    src={imageUrl}
                    alt={decodedInscriptionId}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <Image
                    src={imageUrl}
                    alt={decodedInscriptionId}
                    fill
                    sizes="(min-width: 1024px) 420px, 100vw"
                    priority
                    className="object-cover"
                  />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-black/50">
                  <p className="text-sm uppercase tracking-[0.3em] text-red-200/60">Image not available</p>
                </div>
              )}
              {imageUrl && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.35em] text-red-200/80">
                    {isAscendedImage ? 'Ascended Abomination' : decodedInscriptionId}
                  </div>
                  {!isAscendedImage && (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-red-200/60">
                      {ordinal?.rarity_tier && <span>{ordinal.rarity_tier}</span>}
                      {rarityScore && <span>Score {rarityScore}</span>}
                      {mintedAt && <span>Minted {mintedAt}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8">
            <header className="space-y-3">
              <h1 className="text-2xl font-semibold uppercase tracking-[0.45em] text-red-200 md:text-3xl">
                {isAscendedImage
                  ? 'Ascended Abomination'
                  : ordinal?.trait_combination_hash
                    ? 'Damned Artifact Details'
                    : 'Sacrificed Inscription'}
              </h1>
              <p className="text-sm uppercase tracking-[0.3em] text-red-200/70">
                {isAscendedImage
                  ? 'A creature born from the ascension ritual, transformed through the abyss.'
                  : ordinal
                    ? 'Full trait breakdown and summoning metadata for this damned creation.'
                    : 'Original inscription preview with any available metadata.'}
              </p>
              <div className="rounded-2xl border border-red-600/40 bg-black/60 px-4 py-3 text-xs uppercase tracking-[0.3em] text-red-200/70">
                <p>
                  Inscription:{' '}
                  <span className="font-mono text-red-100">{decodedInscriptionId || 'Unknown'}</span>
                </p>
                {ordinal?.collection_id && (
                  <p>
                    Collection:{' '}
                    <span className="font-mono text-red-100">{ordinal.collection_id.slice(0, 12)}…</span>
                  </p>
                )}
                {createdAt && <p>Created: {createdAt}</p>}
                {burnRecord && (
                  <p className="flex flex-wrap items-center gap-2">
                    <span>Sacrificed by</span>
                    <span className="font-mono text-red-100">{sacrificerDisplayName ?? 'Unknown acolyte'}</span>
                    {sacrificerWallet && (
                      <span className="text-[10px] font-mono text-red-200/60">
                        {sacrificerWallet.slice(0, 6)}…{sacrificerWallet.slice(-6)}
                      </span>
                    )}
                    {timeInGraveyard && (
                      <span className="text-[10px] uppercase tracking-[0.3em] text-red-200/60">
                        In pit {timeInGraveyard}
                      </span>
                    )}
                  </p>
                )}
                {burnCreatedAt && <p>Burn initiated: {burnCreatedAt}</p>}
                {burnConfirmedAt && <p>Confirmed: {burnConfirmedAt}</p>}
                {ordinal?.mint_tx_id && (
                  <p>
                    Mint Tx:{' '}
                    <span className="font-mono text-red-100">{ordinal.mint_tx_id.slice(0, 12)}…</span>
                  </p>
                )}
              </div>
            </header>

  
            <section className="space-y-3">
              <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-red-200">Ascension Powder</h2>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-600/40 bg-black/60 px-4 py-3">
                <div className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-red-200/70">
                  <span>Avail: {profilePowder.toLocaleString()}</span>
                  <span className="flex items-center gap-2 text-[11px] text-amber-200/80">
                    <span className="rounded-full border border-amber-500/50 bg-amber-900/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.4em] text-amber-100">
                      {ascensionPercent}%
                    </span>
                    Ascen. {Math.min(500, ordinalPowder).toLocaleString()} / 500
                  </span>
                </div>
                <Button
                  type="button"
                  disabled={!hasPowder || hasAscended}
                  className="rounded-full border border-red-500/60 bg-red-600/30 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.35em] text-red-100 transition hover:bg-red-600/45 disabled:cursor-not-allowed disabled:border-red-500/30 disabled:bg-black/40 disabled:text-red-200/40"
                >
                  {hasAscended ? 'Ascended' : 'Use Powder'}
                </Button>
              </div>
              {!hasPowder && !hasAscended && (
                <p className="text-[10px] uppercase tracking-[0.3em] text-red-200/60">
                  You lack the ascension powder required to channel this offering.
                </p>
              )}
              {hasAscended && (
                <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200/70">
                  This inscription radiates with full ascension.
                </p>
              )}
            </section>

            {!isAscendedImage && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-red-200">External Links</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`https://ordinals.com/inscription/${encodeURIComponent(decodedInscriptionId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/50 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-100 transition hover:bg-red-600/20"
                  >
                    View on ordinals.com
                  </Link>
                  {downloadUrl && (
                    <Link
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-amber-500/60 bg-black/30 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200 transition hover:bg-amber-500/25"
                    >
                      Download original image
                    </Link>
                  )}
                </div>
              </section>
            )}
            {isAscendedImage && downloadUrl && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-red-200">Image</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-amber-500/60 bg-black/30 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200 transition hover:bg-amber-500/25"
                  >
                    Download ascended image
                  </Link>
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}


