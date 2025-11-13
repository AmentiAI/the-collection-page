import { promises as fs } from 'fs'
import path from 'path'

import { NextRequest, NextResponse } from 'next/server'

type GeneratedOrdinal = {
  id: string
  prompt?: string | null
}

const ORDINALS_FILE_PATH = path.join(process.cwd(), 'public', 'generated_ordinals.json')
const CHROMATIC_FOIL_SUFFIX = 'now cover in a light chromatic foil finish'
const NOIR_CHARACTER_SUFFIX =
  'render the central character only in dramatic high-contrast black and white values while keeping the rest of the scene fully colored and vibrant; override any previous border instructions and instead surround the entire composition with an ultra-fancy, smoky, monochrome (black and white) ornamental border that hugs the canvas edge without affecting interior colors.'
const GOLD_FOIL_SUFFIX =
  'override all previous color instructions and transform the entire artwork into a unified gold-plated treatment, like a metallic baseball card: use a single monochromatic spectrum of rich gold tones with embossed shine, high-contrast highlights, and shadowed gold gradients across every element.'
const DIAMOND_ENCRUSTED_SUFFIX =
  'override all previous material instructions and render every element of the artwork as if carved from crystalline diamond: facets, refractions, prismatic highlights, and sparkling glints covering the entire composition—including character, props, background, atmosphere, and border—so the entire canvas becomes a unified diamond-encrusted sculpture.'
const ULTRA_RARE_SUFFIX =
  'override all previous surface and lighting directives and transform the entire scene into an ultra-rare, museum-grade collectible masterpiece: every element should be reconstructed with platinum and white-gold filigree, jewel-encrusted inlays, opalescent enamel panels, multi-layer holographic foil overlays, and precision-engraved detailing, illuminated by dramatic auction-spot lighting that emphasizes scarcity, provenance, and staggering value.'
const SWIRLED_COLOR_SUFFIX =
  'override existing palettes by flooding the character and background with bold, high-saturation prismatic color swirls—thick ribbons of iridescent paint should coil through the figure and environment, aggressively recoloring surfaces while preserving the border and frame as-is.'
const FORWARD_LEAN_SUFFIX =
  'pose the character so their upper body and face lean forward toward the viewer, creating an exaggerated 3D effect as if the character is emerging out of the canvas, while keeping the rest of the scene intact.'
const MONSTER_TRANSFORMATION_SUFFIX =
  'and then turn it into face, head and body into a huge monster but same traits, dont show legs'

export const dynamic = 'force-dynamic'

async function loadOrdinals(): Promise<GeneratedOrdinal[]> {
  const fileContents = await fs.readFile(ORDINALS_FILE_PATH, 'utf8')
  return JSON.parse(fileContents) as GeneratedOrdinal[]
}

type GenerationVariant =
  | 'chromatic'
  | 'noir'
  | 'gold'
  | 'forward'
  | 'diamond'
  | 'ultra_rare'
  | 'swirl'
  | 'monster'
  | 'monster_combo'

const MONSTER_COMBO_SOURCE_VARIANTS: Array<
  Exclude<GenerationVariant, 'monster' | 'monster_combo'>
> = ['chromatic', 'noir', 'gold', 'forward', 'diamond', 'ultra_rare', 'swirl']

function buildAugmentedPrompt(prompt: string, variant: GenerationVariant): string {
  const trimmedPrompt = prompt.trim()
  const normalizedPrompt = trimmedPrompt.toLowerCase()

  if (variant === 'chromatic') {
    if (normalizedPrompt.endsWith(CHROMATIC_FOIL_SUFFIX)) {
      return trimmedPrompt
    }
    return `${trimmedPrompt}\n\n${CHROMATIC_FOIL_SUFFIX}`
  }

  if (variant === 'monster') {
    return ensureMonsterPrompt(trimmedPrompt)
  }

  // Noir character variant
  if (normalizedPrompt.includes(NOIR_CHARACTER_SUFFIX.toLowerCase())) {
    return trimmedPrompt
  }

  return `${trimmedPrompt}\n\n${NOIR_CHARACTER_SUFFIX}`
}

function normalizeGoldPrompt(prompt: string): string {
  const trimmedPrompt = prompt.trim()
  if (trimmedPrompt.toLowerCase().includes(GOLD_FOIL_SUFFIX.toLowerCase())) {
    return trimmedPrompt
  }
  return `${trimmedPrompt}\n\n${GOLD_FOIL_SUFFIX}`
}

function ensureForwardLeanPrompt(prompt: string): string {
  const trimmedPrompt = prompt.trim()
  if (trimmedPrompt.toLowerCase().includes(FORWARD_LEAN_SUFFIX.toLowerCase())) {
    return trimmedPrompt
  }
  return `${trimmedPrompt}\n\n${FORWARD_LEAN_SUFFIX}`
}

function ensureDiamondPrompt(prompt: string): string {
  const trimmedPrompt = prompt.trim()
  if (trimmedPrompt.toLowerCase().includes(DIAMOND_ENCRUSTED_SUFFIX.toLowerCase())) {
    return trimmedPrompt
  }
  return `${trimmedPrompt}\n\n${DIAMOND_ENCRUSTED_SUFFIX}`
}

function ensureUltraRarePrompt(prompt: string): string {
  const trimmedPrompt = prompt.trim()
  if (trimmedPrompt.toLowerCase().includes(ULTRA_RARE_SUFFIX.toLowerCase())) {
    return trimmedPrompt
  }
  return `${trimmedPrompt}\n\n${ULTRA_RARE_SUFFIX}`
}

function ensureSwirledColorPrompt(prompt: string): string {
  const trimmedPrompt = prompt.trim()
  if (trimmedPrompt.toLowerCase().includes(SWIRLED_COLOR_SUFFIX.toLowerCase())) {
    return trimmedPrompt
  }
  return `${trimmedPrompt}\n\n${SWIRLED_COLOR_SUFFIX}`
}

function ensureMonsterPrompt(prompt: string): string {
  const trimmedPrompt = prompt.trim()
  if (trimmedPrompt.toLowerCase().includes(MONSTER_TRANSFORMATION_SUFFIX.toLowerCase())) {
    return trimmedPrompt
  }
  return `${trimmedPrompt}\n\n${MONSTER_TRANSFORMATION_SUFFIX}`
}

function applyVariantPrompt(
  prompt: string,
  variant: Exclude<GenerationVariant, 'monster' | 'monster_combo'>,
): string {
  if (variant === 'gold') {
    return normalizeGoldPrompt(prompt)
  }
  if (variant === 'forward') {
    return ensureForwardLeanPrompt(prompt)
  }
  if (variant === 'diamond') {
    return ensureDiamondPrompt(prompt)
  }
  if (variant === 'ultra_rare') {
    return ensureUltraRarePrompt(prompt)
  }
  if (variant === 'swirl') {
    return ensureSwirledColorPrompt(prompt)
  }

  return buildAugmentedPrompt(prompt, variant)
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing OpenAI API key. Please set OPENAI_API_KEY in your environment.',
        },
        { status: 500 },
      )
    }

    const { ordinalId, variant } = (await request.json()) as {
      ordinalId?: string
      variant?: GenerationVariant
    }

    if (!ordinalId) {
      return NextResponse.json(
        {
          success: false,
          error: 'ordinalId is required.',
        },
        { status: 400 },
      )
    }

    const ordinals = await loadOrdinals()
    const ordinal = ordinals.find((entry) => entry.id === ordinalId)

    if (!ordinal) {
      return NextResponse.json(
        {
          success: false,
          error: `Ordinal with id ${ordinalId} not found.`,
        },
        { status: 404 },
      )
    }

    const prompt = ordinal.prompt ?? ''
    if (!prompt.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: `Ordinal ${ordinalId} does not contain a stored prompt.`,
        },
        { status: 400 },
      )
    }

    let safeVariant: GenerationVariant = 'chromatic'
    if (variant === 'noir') safeVariant = 'noir'
    if (variant === 'gold') safeVariant = 'gold'
    if (variant === 'forward') safeVariant = 'forward'
    if (variant === 'diamond') safeVariant = 'diamond'
    if (variant === 'ultra_rare') safeVariant = 'ultra_rare'
    if (variant === 'swirl') safeVariant = 'swirl'
    if (variant === 'monster') safeVariant = 'monster'
    if (variant === 'monster_combo') safeVariant = 'monster_combo'

    let augmentedPrompt: string
    if (safeVariant === 'gold') {
      augmentedPrompt = normalizeGoldPrompt(prompt)
    } else if (safeVariant === 'forward') {
      augmentedPrompt = ensureForwardLeanPrompt(prompt)
    } else if (safeVariant === 'diamond') {
      augmentedPrompt = ensureDiamondPrompt(prompt)
    } else if (safeVariant === 'ultra_rare') {
      augmentedPrompt = ensureUltraRarePrompt(prompt)
    } else if (safeVariant === 'swirl') {
      augmentedPrompt = ensureSwirledColorPrompt(prompt)
    } else if (safeVariant === 'monster') {
      augmentedPrompt = ensureMonsterPrompt(prompt)
    } else if (safeVariant === 'monster_combo') {
      const randomVariant =
        MONSTER_COMBO_SOURCE_VARIANTS[
          Math.floor(Math.random() * MONSTER_COMBO_SOURCE_VARIANTS.length)
        ]
      const withRandomVariant = applyVariantPrompt(prompt, randomVariant)
      augmentedPrompt = ensureMonsterPrompt(withRandomVariant)
    } else {
      augmentedPrompt = buildAugmentedPrompt(prompt, safeVariant)
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: augmentedPrompt,
        size: '1024x1024',
      }),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null)
      const errorMessage =
        typeof errorPayload?.error?.message === 'string'
          ? errorPayload.error.message
          : `Image generation failed (${response.status})`

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: response.status },
      )
    }

    const data = (await response.json()) as {
      data?: Array<{
        b64_json?: string
        revised_prompt?: string
      }>
    }

    const imagePayload = data.data?.[0]
    if (!imagePayload?.b64_json) {
      return NextResponse.json(
        {
          success: false,
          error: 'OpenAI response did not include image data.',
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      imageBase64: imagePayload.b64_json,
      revisedPrompt: imagePayload.revised_prompt ?? null,
      variant: safeVariant,
      finalPrompt: augmentedPrompt,
    })
  } catch (error) {
    console.error('[admin/ordinals/generate][POST]', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Unexpected error while generating the image.',
      },
      { status: 500 },
    )
  }
}

