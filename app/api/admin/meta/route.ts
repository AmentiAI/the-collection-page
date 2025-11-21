import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

type GeneratedOrdinal = {
  id: string
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

    // Read the generated ordinals JSON file
    const ordinalsPath = path.join(process.cwd(), 'public', 'generated_ordinals.json')
    const ordinalsData = fs.readFileSync(ordinalsPath, 'utf-8')
    const allOrdinals: GeneratedOrdinal[] = JSON.parse(ordinalsData)

    // Filter out burned ordinals
    // Use inscription_id if available, otherwise use the id field
    const unburned = allOrdinals.filter((ordinal) => {
      const inscriptionId = ordinal.inscription_id || ordinal.id
      return !burnedInscriptionIds.has(inscriptionId)
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

      // Use inscription_id if available, otherwise use the id field
      const inscriptionId = ordinal.inscription_id || ordinal.id

      return {
        id: inscriptionId,
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

