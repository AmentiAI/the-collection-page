'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, Wand2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type OrdinalRecord = {
  id: string
  image_url?: string | null
  thumbnail_url?: string | null
  prompt?: string | null
  created_at?: string | null
  trait_combination_hash?: string | null
}

type GenerationVariant = 'chromatic' | 'noir'

type GenerationResult = {
  ordinalId: string
  imageDataUrl: string
  revisedPrompt: string | null
  finalPrompt: string
  variant: GenerationVariant
}

const PAGE_SIZE_OPTIONS = [8, 12, 24, 48] as const

export default function OrdinalsAdminPage() {
  const [allOrdinals, setAllOrdinals] = useState<OrdinalRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pageSize, setPageSize] = useState<typeof PAGE_SIZE_OPTIONS[number]>(12)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)

  const [generationLoadingId, setGenerationLoadingId] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [lastGeneration, setLastGeneration] = useState<GenerationResult | null>(null)

  const loadOrdinals = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/generated_ordinals.json', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Failed to load ordinals (${response.status})`)
      }
      const data = (await response.json()) as OrdinalRecord[]
      setAllOrdinals(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load generated ordinals.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOrdinals()
  }, [loadOrdinals])

  useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, deferredSearchTerm])

  const filteredOrdinals = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase()
    if (!term) return allOrdinals

    return allOrdinals.filter((ordinal) => {
      const haystack = [
        ordinal.id,
        ordinal.trait_combination_hash,
        ordinal.prompt,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(term)
    })
  }, [allOrdinals, deferredSearchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredOrdinals.length / pageSize))

  const paginatedOrdinals = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredOrdinals.slice(startIndex, startIndex + pageSize)
  }, [filteredOrdinals, currentPage, pageSize])

  const handleGenerateImage = async (ordinal: OrdinalRecord, variant: GenerationVariant) => {
    if (!ordinal.id || !ordinal.prompt) {
      setGenerationError('Selected ordinal is missing required data.')
      return
    }

    try {
      setGenerationError(null)
      setGenerationLoadingId(ordinal.id)

      const response = await fetch('/api/admin/ordinals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordinalId: ordinal.id, variant }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message =
          typeof payload?.error === 'string' ? payload.error : `Failed to generate image (${response.status})`
        throw new Error(message)
      }

      const payload = (await response.json()) as {
        success: boolean
        imageBase64?: string
        revisedPrompt?: string | null
        finalPrompt?: string
        variant?: GenerationVariant
        error?: string
      }

      if (!payload.success || !payload.imageBase64) {
        throw new Error(payload.error ?? 'Image generation did not return data.')
      }

      const finalPrompt = payload.finalPrompt ?? ordinal.prompt
      const imageDataUrl = `data:image/png;base64,${payload.imageBase64}`

      setLastGeneration({
        ordinalId: ordinal.id,
        imageDataUrl,
        revisedPrompt: payload.revisedPrompt ?? null,
        finalPrompt,
        variant: payload.variant ?? variant,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image generation failed.'
      setGenerationError(message)
    } finally {
      setGenerationLoadingId(null)
    }
  }

  const handleRefresh = useCallback(async () => {
    setGenerationError(null)
    setLastGeneration(null)
    setCurrentPage(1)
    setSearchTerm('')
    await loadOrdinals()
  }, [loadOrdinals])

  return (
    <div className="min-h-screen bg-black px-6 py-10 text-red-100">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8">
        <header className="flex flex-col gap-6 rounded-xl border border-red-700/40 bg-black/70 p-6 shadow-[0_0_30px_rgba(220,38,38,0.35)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold uppercase tracking-[0.35em] text-red-400">
                Ordinals Chromatic Forge
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-red-200/70">
                Browse the generated ordinals, review their prompts, and regenerate artwork with a chromatic foil finish
                using OpenAI&apos;s gpt-image-1.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => {
                  void handleRefresh()
                }}
                variant="outline"
                className="flex items-center gap-2 border-red-500/70 text-xs uppercase tracking-[0.3em] text-red-100 hover:bg-red-800/20"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Reload
              </Button>
              <div className="flex items-center gap-2 rounded-lg border border-red-800/60 bg-black/60 px-3 py-2">
                <Search className="h-4 w-4 text-red-300/70" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by id, traits, or prompt..."
                  className="h-8 border-none bg-transparent text-sm text-red-100 placeholder:text-red-400/40 focus-visible:ring-0"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-red-800/40 bg-black/40 p-4 text-xs uppercase tracking-[0.3em] text-red-200/80 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <span>Total loaded: {filteredOrdinals.length.toLocaleString()}</span>
              <span>Page: {currentPage}</span>
              <span>Page size:</span>
              <div className="flex items-center gap-2">
                {PAGE_SIZE_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPageSize(value)}
                    className={`rounded border px-2 py-1 font-mono text-[11px] transition ${
                      pageSize === value
                        ? 'border-red-500 bg-red-700/70 text-red-50'
                        : 'border-red-800/80 text-red-300 hover:border-red-600 hover:text-red-100'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 text-xs uppercase tracking-[0.3em] text-red-200 hover:bg-red-800/10 disabled:text-red-500/40"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <span className="font-mono text-[11px] text-red-300">
                {currentPage} / {totalPages.toLocaleString()}
              </span>
              <Button
                variant="ghost"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 text-xs uppercase tracking-[0.3em] text-red-200 hover:bg-red-800/10 disabled:text-red-500/40"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded border border-red-700/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </header>

        <section className="flex flex-col gap-6">
          {loading ? (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-red-800/40 bg-black/60 p-10 text-sm text-red-200">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading ordinals…
            </div>
          ) : paginatedOrdinals.length === 0 ? (
            <div className="rounded-lg border border-red-700/40 bg-black/60 p-10 text-center text-xs uppercase tracking-[0.35em] text-red-300/70">
              No ordinals found.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {paginatedOrdinals.map((ordinal) => {
                const isGenerating = generationLoadingId === ordinal.id
                const isLastGenerated = lastGeneration?.ordinalId === ordinal.id
                const imageSource = ordinal.thumbnail_url || ordinal.image_url

                return (
                  <article
                    key={ordinal.id}
                    className={`flex h-full flex-col gap-4 rounded-xl border border-red-800/50 bg-black/60 p-4 shadow-[0_0_18px_rgba(220,38,38,0.18)] transition ${
                      isLastGenerated ? 'border-red-400 shadow-[0_0_25px_rgba(250,250,250,0.25)]' : 'hover:border-red-500'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-red-300">ID</span>
                        <span className="font-mono text-xs text-red-100">{ordinal.id}</span>
                      </div>
                      <div className="text-right text-[11px] uppercase tracking-[0.3em] text-red-300/70">
                        {ordinal.created_at ? new Date(ordinal.created_at).toLocaleString() : '—'}
                      </div>
                    </div>

                    {imageSource ? (
                      <div className="relative aspect-square overflow-hidden rounded-lg border border-red-900/60 bg-black/80">
                        <img
                          src={imageSource}
                          alt={ordinal.id}
                          className="h-full w-full object-cover object-center"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-square items-center justify-center rounded-lg border border-red-900/60 bg-black/80 text-xs uppercase tracking-[0.3em] text-red-500/70">
                        No preview
                      </div>
                    )}

                    <details className="group rounded-lg border border-red-900/40 bg-black/70 p-3 text-sm text-red-200/85">
                      <summary className="cursor-pointer list-none font-semibold uppercase tracking-[0.3em] text-red-200 transition hover:text-red-100">
                        View Prompt
                      </summary>
                      <pre className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-black/50 p-3 font-mono text-[12px] leading-snug text-red-100">
                        {ordinal.prompt ?? 'No prompt stored.'}
                      </pre>
                    </details>

                    <div className="flex flex-col gap-2">
                      <Button
                        disabled={isGenerating}
                        onClick={() => handleGenerateImage(ordinal, 'chromatic')}
                        className="flex items-center justify-center gap-2 border border-red-500 bg-red-700/80 text-xs uppercase tracking-[0.3em] text-red-50 hover:bg-red-600"
                      >
                        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                        {isGenerating && generationLoadingId === ordinal.id
                          ? 'Summoning…'
                          : 'Chromatic Regenerate'}
                      </Button>
                      <Button
                        disabled={isGenerating}
                        onClick={() => handleGenerateImage(ordinal, 'noir')}
                        variant="outline"
                        className="flex items-center justify-center gap-2 border border-red-400/70 text-xs uppercase tracking-[0.3em] text-red-100 hover:bg-red-800/10"
                      >
                        {isGenerating && generationLoadingId === ordinal.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        {isGenerating && generationLoadingId === ordinal.id ? 'Summoning…' : 'Noir Character Pass'}
                      </Button>
                      <Button
                        disabled={isGenerating}
                        onClick={() => handleGenerateImage(ordinal, 'gold')}
                        variant="secondary"
                        className="flex items-center justify-center gap-2 border border-amber-400/70 bg-amber-500/20 text-xs uppercase tracking-[0.3em] text-amber-200 transition hover:bg-amber-500/30 hover:text-amber-100"
                      >
                        {isGenerating && generationLoadingId === ordinal.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        {isGenerating && generationLoadingId === ordinal.id ? 'Summoning…' : 'Gold Foil Enrich'}
                      </Button>
                      <Button
                        disabled={isGenerating}
                        onClick={() => handleGenerateImage(ordinal, 'forward')}
                        variant="ghost"
                        className="flex items-center justify-center gap-2 border border-cyan-500/60 text-xs uppercase tracking-[0.3em] text-cyan-200 hover:bg-cyan-500/10 hover:text-cyan-100"
                      >
                        {isGenerating && generationLoadingId === ordinal.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        {isGenerating && generationLoadingId === ordinal.id ? 'Summoning…' : 'Forward Face Pop'}
                      </Button>
                      <Button
                        disabled={isGenerating}
                        onClick={() => handleGenerateImage(ordinal, 'diamond')}
                        variant="outline"
                        className="flex items-center justify-center gap-2 border border-slate-200/70 text-xs uppercase tracking-[0.3em] text-slate-100 hover:bg-slate-200/10 hover:text-white"
                      >
                        {isGenerating && generationLoadingId === ordinal.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        {isGenerating && generationLoadingId === ordinal.id ? 'Summoning…' : 'Diamond Encrust'}
                      </Button>
                      <Button
                        disabled={isGenerating}
                        onClick={() => handleGenerateImage(ordinal, 'ultra_rare')}
                        variant="outline"
                        className="flex items-center justify-center gap-2 border border-purple-300/70 text-xs uppercase tracking-[0.3em] text-purple-200 hover:bg-purple-400/10 hover:text-purple-100"
                      >
                        {isGenerating && generationLoadingId === ordinal.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        {isGenerating && generationLoadingId === ordinal.id ? 'Summoning…' : 'Ultra-Rare Prestige'}
                      </Button>
                      <Button
                        disabled={isGenerating}
                        onClick={() => handleGenerateImage(ordinal, 'swirl')}
                        variant="outline"
                        className="flex items-center justify-center gap-2 border border-emerald-300/70 text-xs uppercase tracking-[0.3em] text-emerald-200 hover:bg-emerald-400/10 hover:text-emerald-100"
                      >
                        {isGenerating && generationLoadingId === ordinal.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        {isGenerating && generationLoadingId === ordinal.id ? 'Summoning…' : 'Prismatic Swirls'}
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {(generationError || lastGeneration) && (
          <section className="rounded-xl border border-red-800/50 bg-black/70 p-6 shadow-[0_0_22px_rgba(220,38,38,0.22)]">
            <header className="flex items-center justify-between">
              <h2 className="text-lg font-semibold uppercase tracking-[0.35em] text-red-200">Generation Output</h2>
              {generationLoadingId && <Loader2 className="h-4 w-4 animate-spin text-red-200" />}
            </header>

            {generationError ? (
              <p className="mt-4 rounded border border-red-700/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {generationError}
              </p>
            ) : lastGeneration ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
                <div className="flex flex-col gap-4">
                  <div className="overflow-hidden rounded-lg border border-red-900/60 bg-black/80">
                    <img
                      src={lastGeneration.imageDataUrl}
                      alt={`Generated chromatic foil ordinal ${lastGeneration.ordinalId}`}
                      className="h-auto w-full"
                    />
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-red-300">
                    Ordinal ID: {lastGeneration.ordinalId}
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-xs uppercase tracking-[0.35em] text-red-300/80">Prompt Sent to OpenAI</h3>
                    <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-red-900/50 bg-black/80 p-4 font-mono text-[12px] leading-snug text-red-100">
                      {lastGeneration.finalPrompt}
                    </pre>
                  </div>
                  {lastGeneration.revisedPrompt && (
                    <div>
                      <h3 className="text-xs uppercase tracking-[0.35em] text-red-300/80">Revised Prompt</h3>
                      <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-red-900/50 bg-black/80 p-4 font-mono text-[12px] leading-snug text-red-100">
                        {lastGeneration.revisedPrompt}
                      </pre>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-red-300/70">
                    <span>Format: 1024x1024</span>
                    <span>Model: gpt-image-1</span>
                    <span>
                      Finish:{' '}
                      {lastGeneration.variant === 'noir'
                        ? 'High-contrast Noir Character'
                        : lastGeneration.variant === 'gold'
                        ? 'Opulent Gold Foil Accents'
                        : lastGeneration.variant === 'forward'
                        ? 'Forward Lean 3D Emphasis'
                        : lastGeneration.variant === 'diamond'
                        ? 'Full Diamond Crystalline'
                        : lastGeneration.variant === 'ultra_rare'
                        ? 'Ultra-Rare Prestige Finish'
                        : lastGeneration.variant === 'swirl'
                        ? 'Intricate Prismatic Swirls'
                        : 'Light Chromatic Foil'}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </div>
  )
}

