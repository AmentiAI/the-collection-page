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

    return NextResponse.json({
      success: true,
      totalOriginal: allPrompts.length,
      totalBurned: burnedInscriptionIds.size,
      totalUnburned: unburnedPrompts.length,
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

