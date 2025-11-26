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
  
  for (const line of traitLines) {
    // Match pattern: "Type: Name - Description"
    const match = line.match(/^([^:]+):\s*([^-]+)\s*-/)
    if (match) {
      let traitType = match[1].trim()
      const traitValue = match[2].trim()
      
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
    const mintedResult = await pool.query(`
      SELECT 
        mq.generation_prompt,
        mi.inscription_id
      FROM ascended_images_mint_queue mq
      INNER JOIN mint_inscriptions mi ON mi.mint_queue_id = mq.id
      WHERE mq.mint_status = 'minted'
        AND mi.inscription_id IS NOT NULL
        AND mi.inscription_id != ''
      ORDER BY mi.completed_at ASC
    `)

    console.log(`[admin/meta][GET] Found ${mintedResult.rows.length} minted inscriptions to add to metadata`)

    // Add minted inscriptions to metadata
    const mintedMetadata: MetadataItem[] = mintedResult.rows.map((row, index) => {
      const attributes = parseTraitsFromPrompt(row.generation_prompt || '')

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

