import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

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

// Parse traits from prompt text
function parseTraitsFromPrompt(prompt: string): Array<{ trait_type: string; value: string }> {
  const attributes: Array<{ trait_type: string; value: string }> = []
  
  // Find the ASSIGNED TRAITS section
  const traitsMatch = prompt.match(/ASSIGNED TRAITS:\n([\s\S]*?)(?:\n\nTRAIT RENDERING|$)/i)
  if (!traitsMatch) return attributes
  
  const traitsSection = traitsMatch[1]
  
  // Parse each trait line (format: "Type: Name - Description")
  const traitLines = traitsSection.split('\n').filter(line => line.trim())
  
  // Traits to exclude from metadata
  const excludedTraits = new Set([
    'CUSTOM RULES',
    'BORDER',
    'QUALITY',
    'TRAIT RENDERING'
  ])
  
  for (const line of traitLines) {
    // Match pattern: "Type: Name - Description"
    const match = line.match(/^([^:]+):\s*([^-]+)\s*-/)
    if (match) {
      let traitType = match[1].trim()
      const traitValue = match[2].trim()
      
      // Skip excluded traits
      if (excludedTraits.has(traitType)) {
        continue
      }
      
      // Normalize trait type names
      if (traitType.toLowerCase().includes('hand')) {
        traitType = 'Hands'
      } else if (traitType.toLowerCase() === 'body skin') {
        traitType = 'Body Skin'
      }
      
      attributes.push({
        trait_type: traitType,
        value: traitValue
      })
    }
  }
  
  return attributes
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

    // Read inscription_prompts.json
    const promptsPath = path.join(process.cwd(), 'public', 'inscription_prompts.json')
    const promptsData = fs.readFileSync(promptsPath, 'utf-8')
    const allPrompts: InscriptionPrompt[] = JSON.parse(promptsData)

    // Filter out burned inscriptions
    const unburnedPrompts = allPrompts.filter(
      (prompt) => !burnedInscriptionIds.has(prompt.inscription_id)
    )

    // Generate metadata by parsing traits from prompts
    const metadata: MetadataItem[] = unburnedPrompts.map((prompt, index) => {
      const attributes = parseTraitsFromPrompt(prompt.prompt)

      return {
        id: prompt.inscription_id,
        meta: {
          name: `The Damned #${index + 1}`,
          attributes
        }
      }
    })

    // Get minted inscriptions from ascended_images_mint_queue
    // JOIN with mint_inscriptions to get the actual inscription_id
    // Only include inscriptions where mint_status = 'completed' in mint_inscriptions table
    const mintedResult = await pool.query(`
      SELECT 
        mq.generation_prompt,
        mq.source_inscription_id,
        mi.inscription_id
      FROM ascended_images_mint_queue mq
      INNER JOIN mint_inscriptions mi ON mi.mint_queue_id = mq.id
      WHERE mq.mint_status = 'minted'
        AND mi.mint_status = 'completed'
        AND mi.inscription_id IS NOT NULL
        AND mi.inscription_id != ''
      ORDER BY mi.completed_at ASC
    `)

    console.log(`[admin/meta][GET] Found ${mintedResult.rows.length} minted inscriptions to add to metadata`)

    // Add minted inscriptions to metadata
    const mintedMetadata: MetadataItem[] = mintedResult.rows.map((row, index) => {
      const attributes = parseTraitsFromPrompt(row.generation_prompt || '')
      const promptText = (row.generation_prompt || '').toLowerCase()
      
      // Add Ascended trait based on source_inscription_id
      const isAscended = row.source_inscription_id?.startsWith('ascended_') || false
      const ascendedValue = isAscended ? 'Angelic' : 'Demonic'
      const prefix = `${ascendedValue} `
      
      // Prefix all trait values with "Demonic " or "Angelic "
      attributes.forEach((attr) => {
        attr.value = `${prefix}${attr.value}`
      })
      
      // Add the Ascended trait to the attributes
      const ascendedTrait = {
        trait_type: 'Ascended',
        value: ascendedValue
      }
      attributes.push(ascendedTrait)

      // Detect Silver trait (check for "silver plated" in prompt)
      // Only add if True
      const hasSilver = promptText.includes('silver plated')
      if (hasSilver) {
        attributes.push({
          trait_type: 'Silver',
          value: 'True'
        })
      }

      // Detect Glow trait (check for "holy light" in prompt)
      // Only add if True
      const hasGlow = promptText.includes('holy light')
      if (hasGlow) {
        attributes.push({
          trait_type: 'Glow',
          value: 'True'
        })
      }

      return {
        id: row.inscription_id,
        meta: {
          name: `The Damned #${unburnedPrompts.length + index + 1}`,
          attributes
        }
      }
    })

    // Combine original metadata with minted metadata
    const allMetadata = [...metadata, ...mintedMetadata]

    // Post-process: 
    // 1. Remove FORBIDDEN traits
    // 2. Replace "Pikachu Hat" with "P-Hat" in all attribute values
    allMetadata.forEach((item) => {
      // Remove FORBIDDEN traits
      item.meta.attributes = item.meta.attributes.filter(
        (attr) => attr.trait_type !== 'FORBIDDEN'
      )
      
      // Replace "Pikachu Hat" with "P-Hat"
      item.meta.attributes = item.meta.attributes.map((attr) => ({
        ...attr,
        value: attr.value.replace(/Pikachu Hat/g, 'P-Hat')
      }))
    })

    return NextResponse.json({
      success: true,
      totalOriginal: allPrompts.length,
      totalBurned: burnedInscriptionIds.size,
      totalUnburned: unburnedPrompts.length,
      totalMinted: mintedResult.rows.length,
      metadata: allMetadata
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

