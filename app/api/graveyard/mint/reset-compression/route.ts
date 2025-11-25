import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Reset compression flag for mint queue items
 * 
 * Query params:
 * - mintQueueId (optional): Reset specific item. If omitted, resets ALL items.
 * - inscriptionId (optional): Reset by inscription ID
 * 
 * Examples:
 * - Reset all: /api/graveyard/mint/reset-compression
 * - Reset one: /api/graveyard/mint/reset-compression?mintQueueId=123e4567-e89b-12d3-a456-426614174000
 * - Reset by inscription: /api/graveyard/mint/reset-compression?inscriptionId=abc123i0
 */
async function resetCompression(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const mintQueueId = searchParams.get('mintQueueId')
    const inscriptionId = searchParams.get('inscriptionId')
    
    const pool = getPool()
    
    let result
    let message
    
    if (mintQueueId) {
      // Reset specific mint queue item by ID
      result = await pool.query(
        `UPDATE ascended_images_mint_queue
         SET is_compressed = false
         WHERE id = $1
         RETURNING id, source_inscription_id`,
        [mintQueueId]
      )
      message = `Reset compression for mint queue ID: ${mintQueueId}`
    } else if (inscriptionId) {
      // Reset by source inscription ID
      result = await pool.query(
        `UPDATE ascended_images_mint_queue
         SET is_compressed = false
         WHERE source_inscription_id = $1
         RETURNING id, source_inscription_id`,
        [inscriptionId]
      )
      message = `Reset compression for inscription: ${inscriptionId}`
    } else {
      // Reset ALL compressed items
      result = await pool.query(
        `UPDATE ascended_images_mint_queue
         SET is_compressed = false
         WHERE is_compressed = true
         RETURNING id, source_inscription_id`
      )
      message = 'Reset compression for ALL items'
    }
    
    const updatedCount = result.rowCount || 0
    const updatedItems = result.rows
    
    console.log(`✅ ${message}`)
    console.log(`📊 Updated ${updatedCount} record(s)`)
    
    return NextResponse.json({
      success: true,
      message,
      count: updatedCount,
      items: updatedItems
    })
    
  } catch (error) {
    console.error('❌ Reset compression failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to reset compression',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Support both GET and POST
export async function GET(request: NextRequest) {
  return resetCompression(request)
}

export async function POST(request: NextRequest) {
  return resetCompression(request)
}

