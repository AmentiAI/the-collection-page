import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

type GeneratedOrdinal = {
  id: string
  image_url: string
  inscription_id?: string | null
  traits?: {
    eyes?: { name: string }
    headwear?: { name: string }
    mouth?: { name: string }
    outfits?: { name: string }
    background?: { name: string }
    props?: { name: string }
  }
}

type InscriptionPrompt = {
  inscription_id: string
  image_url: string
  prompt: string
}

type MetadataItem = {
  id: string
  meta: {
    name: string
    attributes: Array<{
      trait_type: string
      value: string
    }>
  }
}

export async function GET() {
  try {
    const pool = getPool()

    // Get all burned inscription IDs from abyss_burns table
    const burnsResult = await pool.query(`
      SELECT inscription_id 
      FROM abyss_burns
    `)
    
    const burnedInscriptionIds = new Set(
      burnsResult.rows.map((row) => row.inscription_id)
    )

    // Read BOTH JSON files
    const ordinalsPath = path.join(process.cwd(), 'public', 'generated_ordinals.json')
    const promptsPath = path.join(process.cwd(), 'public', 'inscription_prompts.json')
    
    const ordinalsData = fs.readFileSync(ordinalsPath, 'utf-8')
    const promptsData = fs.readFileSync(promptsPath, 'utf-8')
    
    const allOrdinals: GeneratedOrdinal[] = JSON.parse(ordinalsData)
    const allPrompts: InscriptionPrompt[] = JSON.parse(promptsData)

    // Create a map of image_url -> inscription_id from inscription_prompts.json
    const imageUrlToInscriptionId = new Map<string, string>()
    for (const prompt of allPrompts) {
      imageUrlToInscriptionId.set(prompt.image_url, prompt.inscription_id)
    }

    // Match ordinals with their inscription IDs and filter out burned ones
    const unburned = allOrdinals
      .map((ordinal) => {
        // Get the inscription_id by matching image_url
        const inscriptionId = imageUrlToInscriptionId.get(ordinal.image_url)
        return inscriptionId ? { ...ordinal, inscription_id: inscriptionId } : null
      })
      .filter((ordinal): ordinal is GeneratedOrdinal & { inscription_id: string } => {
        // Must have successfully matched an inscription_id
        if (!ordinal || !ordinal.inscription_id) return false
        // Must not be in the burned list
        return !burnedInscriptionIds.has(ordinal.inscription_id)
      })

    // Map trait keys to display names
    const traitTypeMap: Record<string, string> = {
      eyes: 'Eyes',
      headwear: 'Head',
      mouth: 'Mouth',
      outfits: 'Body Skin',
      background: 'Background',
      props: 'Hands'
    }

    // Generate metadata in the requested format
    const metadata: MetadataItem[] = unburned.map((ordinal, index) => {
      const attributes: Array<{ trait_type: string; value: string }> = []
      
      if (ordinal.traits) {
        // Process traits in the order: Eyes, Head, Mouth, Body Skin, Background, Hands
        const traitOrder = ['eyes', 'headwear', 'mouth', 'outfits', 'background', 'props']
        
        for (const traitKey of traitOrder) {
          const trait = ordinal.traits[traitKey as keyof typeof ordinal.traits]
          if (trait && trait.name) {
            attributes.push({
              trait_type: traitTypeMap[traitKey] || traitKey,
              value: trait.name
            })
          }
        }
      }

      return {
        id: ordinal.inscription_id,
        meta: {
          name: `The Damned #${index + 1}`,
          attributes
        }
      }
    })

    return NextResponse.json({
      success: true,
      totalOriginal: allOrdinals.length,
      totalBurned: burnedInscriptionIds.size,
      totalUnburned: unburned.length,
      metadata
    })
  } catch (error) {
    console.error('[admin/meta][GET]', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate metadata' 
      },
      { status: 500 }
    )
  }
}

