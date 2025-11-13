import { cache } from 'react'
import { promises as fs } from 'fs'
import path from 'path'

import Image from 'next/image'
import Link from 'next/link'

import type { Ordinal, Trait } from '@/types'

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

type PageProps = {
  params: { inscriptionId: string }
}

export default async function GraveyardInscriptionPage({ params }: PageProps) {
  const rawInscriptionId = params.inscriptionId ?? ''
  const decodedInscriptionId = decodeURIComponent(rawInscriptionId)
  const ordinal = decodedInscriptionId ? await findOrdinalByInscriptionId(decodedInscriptionId) : null

  const imageUrl =
    ordinal?.image_url ??
    `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(decodedInscriptionId)}`
  const downloadUrl =
    ordinal?.image_url ??
    `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(decodedInscriptionId)}`

  const mintedAt = formatTimestamp(ordinal?.minted_at)
  const createdAt = formatTimestamp(ordinal?.created_at)
  const rarityScore =
    typeof ordinal?.rarity_score === 'number' && Number.isFinite(ordinal.rarity_score)
      ? ordinal.rarity_score.toFixed(2)
      : null

  return (
    <div className="min-h-screen bg-black text-red-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 md:py-16">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/graveyard"
            className="inline-flex items-center gap-2 rounded-full border border-red-500/60 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-100 transition hover:bg-red-600/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            ← Back to Graveyard
          </Link>
          <div className="hidden text-right text-xs uppercase tracking-[0.35em] text-red-300/70 sm:block">
            <p>Graveyard Inscription</p>
            <p className="font-mono text-[11px] text-red-200/80">{decodedInscriptionId}</p>
          </div>
        </div>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="relative overflow-hidden rounded-3xl border border-red-600/50 bg-black/70 shadow-[0_0_40px_rgba(220,38,38,0.3)]">
            <div className="relative aspect-square">
              <Image
                src={imageUrl}
                alt={decodedInscriptionId}
                fill
                sizes="(min-width: 1024px) 420px, 100vw"
                priority
                className="object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.35em] text-red-200/80">
                  {decodedInscriptionId}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-red-200/60">
                  {ordinal?.rarity_tier && <span>{ordinal.rarity_tier}</span>}
                  {rarityScore && <span>Score {rarityScore}</span>}
                  {mintedAt && <span>Minted {mintedAt}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <header className="space-y-3">
              <h1 className="text-3xl font-semibold uppercase tracking-[0.45em] text-red-200 md:text-4xl">
                {ordinal?.trait_combination_hash ? 'Damned Artifact Details' : 'Sacrificed Inscription'}
              </h1>
              <p className="text-sm uppercase tracking-[0.3em] text-red-200/70">
                {ordinal
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
                {ordinal?.mint_tx_id && (
                  <p>
                    Mint Tx:{' '}
                    <span className="font-mono text-red-100">{ordinal.mint_tx_id.slice(0, 12)}…</span>
                  </p>
                )}
              </div>
            </header>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-red-200">Trait Manifest</h2>
                {ordinal?.metadata_url && (
                  <Link
                    href={ordinal.metadata_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] uppercase tracking-[0.35em] text-red-300/80 underline underline-offset-4 hover:text-red-100"
                  >
                    View metadata
                  </Link>
                )}
              </div>
              {ordinal ? (
                <TraitList traits={ordinal.traits ?? {}} />
              ) : (
                <p className="text-sm uppercase tracking-[0.3em] text-red-200/70">
                  We could not locate trait metadata for this inscription. It may belong to an external collection or
                  predate the current catalog.
                </p>
              )}
            </section>

            {ordinal?.prompt && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-red-200">
                  Original Summoning Prompt
                </h2>
                <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-red-600/40 bg-black/70 p-4 font-mono text-xs leading-relaxed text-red-100 shadow-[0_0_20px_rgba(220,38,38,0.25)]">
                  {ordinal.prompt}
                </pre>
              </section>
            )}

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
                <Link
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-amber-500/60 bg-black/30 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200 transition hover:bg-amber-500/25"
                >
                  Download original image
                </Link>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  )
}


