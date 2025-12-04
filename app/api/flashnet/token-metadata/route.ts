import { NextRequest, NextResponse } from 'next/server'
import {
  getFlashnetClient,
  fetchFlashnetTokenMetadata,
  upsertFlashnetTokenMetadata,
  listFlashnetTokenMetadata,
  chunkArray,
} from '@/lib/flashnet'

export const dynamic = 'force-dynamic'

// Batch endpoint - accepts multiple tokens
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const tokens = Array.isArray(body.tokens) ? body.tokens : []

    if (!tokens.length) {
      return NextResponse.json(
        { success: false, error: 'tokens array is required' },
        { status: 400 }
      )
    }

    // Limit batch size to prevent overload
    const limitedTokens = tokens.slice(0, 50)
    
    // First check database for all tokens
    const existing = await listFlashnetTokenMetadata(limitedTokens)
    const existingMap = new Map(existing.map(m => [m.token_identifier.toLowerCase(), m]))
    const existingByAddress = new Map(existing.filter(m => m.token_address).map(m => [m.token_address!.toLowerCase(), m]))
    
    // Find tokens that need fetching (missing or missing max_supply)
    const tokensToFetch: string[] = []
    const results: Record<string, any> = {}
    
    for (const token of limitedTokens) {
      const lowerToken = token.toLowerCase()
      const existingMeta = existingMap.get(lowerToken) || existingByAddress.get(lowerToken)
      
      if (existingMeta?.max_supply) {
        results[token] = existingMeta
      } else {
        tokensToFetch.push(token)
        // Return existing metadata even without max_supply
        if (existingMeta) {
          results[token] = existingMeta
        }
      }
    }

    // Fetch missing tokens in batches
    if (tokensToFetch.length > 0) {
      try {
        const client = await getFlashnetClient()
        // Fetch in chunks to avoid overwhelming the connection
        const chunks = chunkArray(tokensToFetch, 10)
        
        for (const chunk of chunks) {
          try {
            const fetched = await fetchFlashnetTokenMetadata(client, chunk)
            
            // Store in database
            if (fetched.length > 0) {
              await upsertFlashnetTokenMetadata(fetched)
              
              // Update results
              for (const meta of fetched) {
                const key = chunk.find(t => 
                  t.toLowerCase() === meta.token_identifier.toLowerCase() ||
                  (meta.token_address && t.toLowerCase() === meta.token_address.toLowerCase())
                )
                if (key) {
                  results[key] = meta
                }
              }
            }
            
            // Small delay between chunks to prevent connection issues
            if (chunks.length > 1) {
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          } catch (error) {
            console.warn('[Flashnet] Batch fetch failed for chunk:', error instanceof Error ? error.message : error)
          }
        }
      } catch (error) {
        console.warn('[Flashnet] Failed to fetch metadata batch:', error instanceof Error ? error.message : error)
      }
    }

    return NextResponse.json({
      success: true,
      metadata: results,
    })
  } catch (error) {
    console.error('Flashnet token metadata POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// Single token endpoint (for backwards compatibility)
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const tokenIdentifier = url.searchParams.get('token')?.trim()

    if (!tokenIdentifier) {
      return NextResponse.json(
        { success: false, error: 'token parameter is required' },
        { status: 400 }
      )
    }

    // First check if we have it in the database
    const existing = await listFlashnetTokenMetadata([tokenIdentifier])
    if (existing.length > 0 && existing[0].max_supply) {
      return NextResponse.json({
        success: true,
        metadata: existing[0],
      })
    }

    // If not found or missing max_supply, fetch from Spark
    try {
      const client = await getFlashnetClient()
      const fetched = await fetchFlashnetTokenMetadata(client, [tokenIdentifier])
      
      if (fetched.length > 0) {
        // Store it in the database
        await upsertFlashnetTokenMetadata(fetched)
        
        return NextResponse.json({
          success: true,
          metadata: fetched[0],
        })
      }
    } catch (error) {
      console.warn('[Flashnet] Failed to fetch metadata for token:', tokenIdentifier, error)
    }

    // Return existing metadata even if max_supply is missing
    if (existing.length > 0) {
      return NextResponse.json({
        success: true,
        metadata: existing[0],
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Token metadata not found',
    }, { status: 404 })
  } catch (error) {
    console.error('Flashnet token metadata GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

