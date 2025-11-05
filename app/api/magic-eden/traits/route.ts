import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const collectionSymbol = searchParams.get('collectionSymbol') || 'the-damned'

    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    
    // Try to fetch collection stats (optional - may not exist for all collections)
    let statsData: any = null
    const statsUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${collectionSymbol}/stats`
    
    try {
      console.log('🔍 Trying to fetch collection stats from Magic Eden:', statsUrl)
      const statsResponse = await fetch(statsUrl, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'TheDamned/1.0'
        },
        next: { revalidate: 300 } // Cache for 5 minutes
      })

      if (statsResponse.ok) {
        statsData = await statsResponse.json()
        console.log('✅ Collection stats fetched successfully')
      } else {
        console.log(`⚠️ Stats endpoint returned ${statsResponse.status}, continuing without stats...`)
      }
    } catch (error) {
      console.log('⚠️ Error fetching stats (continuing anyway):', error)
      // Continue without stats - we'll extract from tokens instead
    }
    
    // Try multiple possible endpoints for trait data
    let traitsData: any = null
    const possibleEndpoints = [
      `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${collectionSymbol}/traits`,
      `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${collectionSymbol}/trait-stats`,
      `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${collectionSymbol}/attributes`
    ]
    
    for (const traitsUrl of possibleEndpoints) {
      try {
        console.log(`Trying trait endpoint: ${traitsUrl}`)
        const traitsResponse = await fetch(traitsUrl, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'TheDamned/1.0'
          },
          next: { revalidate: 300 }
        })
        
        if (traitsResponse.ok) {
          const rawTraitsData = await traitsResponse.json()
          console.log('✅ Successfully fetched traits from:', traitsUrl)
          
          // Process traits data to calculate percentages
          // Magic Eden returns traits in format: { [traitType]: { [value]: { count, floor_price } } }
          if (rawTraitsData && typeof rawTraitsData === 'object' && !Array.isArray(rawTraitsData)) {
            // Calculate total items and percentages
            const totalItems = statsData?.totalSupply || statsData?.listedCount || statsData?.volume?.totalItems || 0
            
            traitsData = {}
            Object.keys(rawTraitsData).forEach(traitType => {
              if (rawTraitsData[traitType] && typeof rawTraitsData[traitType] === 'object') {
                traitsData[traitType] = {}
                Object.keys(rawTraitsData[traitType]).forEach(value => {
                  const traitInfo = rawTraitsData[traitType][value]
                  const count = traitInfo?.count || traitInfo?.items || 0
                  const percentage = totalItems > 0 ? (count / totalItems) * 100 : 0
                  
                  traitsData[traitType][value] = {
                    count,
                    floor_price: traitInfo?.floor_price || traitInfo?.floorPrice || undefined,
                    percentage: parseFloat(percentage.toFixed(2))
                  }
                })
              }
            })
          } else {
            // If data is in a different format, try to process it
            traitsData = rawTraitsData
          }
          break // Success, exit loop
        } else {
          const errorText = await traitsResponse.text().catch(() => 'Unable to read error response')
          console.log(`Endpoint ${traitsUrl} returned ${traitsResponse.status}`, errorText.substring(0, 200))
          
          // If we get 429 (rate limit) or 403 (forbidden), stop trying endpoints
          if (traitsResponse.status === 429 || traitsResponse.status === 403) {
            console.log('🛑 Magic Eden API rate limited or blocked.')
            break
          }
        }
      } catch (error) {
        console.error(`Error fetching traits from ${traitsUrl}:`, error)
      }
    }
    
    // If no traits endpoint worked, try to get trait data from individual tokens
    if (!traitsData) {
      console.log('No traits endpoint worked, trying alternative approach - fetching tokens...')
      try {
        // Fetch multiple pages of tokens to get a comprehensive sample
        let allTokens: any[] = []
        const limit = 100
        let offset = 0
        const maxPages = 10 // Fetch up to 1000 tokens for better accuracy
        
        for (let page = 0; page < maxPages; page++) {
          const tokensUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=${collectionSymbol}&limit=${limit}&offset=${offset}&showAll=true`
          const tokensResponse = await fetch(tokensUrl, {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
              'Authorization': `Bearer ${apiKey}`,
              'User-Agent': 'TheDamned/1.0'
            },
            next: { revalidate: 300 }
          })
          
          if (!tokensResponse.ok) {
            const errorText = await tokensResponse.text().catch(() => 'Unable to read error response')
            console.log(`⚠️ Failed to fetch tokens page ${page + 1}: ${tokensResponse.status}`, errorText)
            
            // If we get 429 (rate limit) or 403 (forbidden), stop trying
            if (tokensResponse.status === 429 || tokensResponse.status === 403) {
              console.log('🛑 Magic Eden API rate limited or blocked. Stopping token fetch.')
              break
            }
            break
          }
          
          const tokensData = await tokensResponse.json()
          const tokens = tokensData.tokens || tokensData.data || (Array.isArray(tokensData) ? tokensData : [])
          
          if (Array.isArray(tokens) && tokens.length > 0) {
            allTokens = allTokens.concat(tokens)
            console.log(`✅ Fetched ${tokens.length} tokens from page ${page + 1} (total: ${allTokens.length})`)
            
            // If we got fewer tokens than requested, we've reached the end
            if (tokens.length < limit) {
              break
            }
            
            offset += limit
          } else {
            break
          }
        }
        
        console.log(`📊 Total tokens fetched: ${allTokens.length}`)

        // Build traits map from token metadata
        if (allTokens.length > 0) {
          const traitsMap: { [key: string]: { [value: string]: number } } = {}
          let processedCount = 0

          // Log first token structure for debugging
          if (allTokens.length > 0) {
            console.log('🔍 Sample token structure:', JSON.stringify(allTokens[0], null, 2).substring(0, 500))
          }

          allTokens.forEach((token: any, index: number) => {
            // Try multiple ways to get attributes from Magic Eden API response
            let attributes = null

            // Check if token has metadata object
            if (token.metadata) {
              attributes = token.metadata.attributes || token.metadata.traits
            }

            // Check direct properties
            if (!attributes) {
              attributes = token.attributes || token.traits || token.properties
            }

            // Check if metadata is a string that needs parsing
            if (!attributes && token.metadata && typeof token.metadata === 'string') {
              try {
                const parsed = JSON.parse(token.metadata)
                attributes = parsed.attributes || parsed.traits || parsed.properties
              } catch (e) {
                // Not JSON, skip
              }
            }

            // Check for inscription metadata - Magic Eden might store it here
            if (!attributes && token.inscription) {
              if (token.inscription.metadata) {
                const meta = token.inscription.metadata
                attributes = meta.attributes || meta.traits || meta.properties
              }
              if (!attributes && typeof token.inscription.metadata === 'string') {
                try {
                  const parsed = JSON.parse(token.inscription.metadata)
                  attributes = parsed.attributes || parsed.traits || parsed.properties
                } catch (e) {
                  // Not JSON, skip
                }
              }
            }

            // Check for content/metadata in various possible locations
            if (!attributes) {
              // Try contentUri or content
              const contentUri = token.contentUri || token.content || token.meta?.contentUri
              if (contentUri && typeof contentUri === 'string' && contentUri.includes('json')) {
                // Might need to fetch separately, skip for now
              }
            }

            // Check collection metadata
            if (!attributes && token.collection) {
              attributes = token.collection.attributes || token.collection.traits
            }

            // For Bitcoin ordinals, metadata might be in token properties or needs to be fetched
            // Check token properties/fields directly
            if (!attributes) {
              // Check if token has any fields that look like trait data
              const possibleFields = ['meta', 'data', 'info', 'details', 'fields']
              for (const field of possibleFields) {
                if (token[field] && typeof token[field] === 'object') {
                  attributes = token[field].attributes || token[field].traits
                  if (attributes) break
                }
              }
            }

            // Log first few tokens that don't have attributes for debugging
            if (index < 3 && !attributes) {
              console.log(`🔍 Token ${index} structure (no attributes found):`, Object.keys(token).join(', '))
            }

            // Ensure attributes is an array
            if (!Array.isArray(attributes)) {
              attributes = []
            }

            if (attributes.length > 0) {
              processedCount++
              attributes.forEach((attr: any) => {
                // Handle different attribute formats
                const traitType = attr.trait_type || attr.traitType || attr.key || attr.name || attr.type || 'unknown'
                let value = attr.value !== undefined ? String(attr.value) : (attr.displayValue || 'unknown')
                value = value.trim()

                if (traitType && value && value !== 'unknown' && traitType !== 'unknown') {
                  if (!traitsMap[traitType]) {
                    traitsMap[traitType] = {}
                  }
                  if (!traitsMap[traitType][value]) {
                    traitsMap[traitType][value] = 0
                  }
                  traitsMap[traitType][value]++
                }
              })
            }
          })

          console.log(`📈 Processed ${processedCount} tokens with attributes out of ${allTokens.length} total`)

          // Convert to expected format
          if (Object.keys(traitsMap).length > 0) {
            // Use total from stats if available, otherwise use processed count as estimate
            const totalItems = statsData?.totalSupply || statsData?.listedCount || processedCount || 1
            traitsData = {}

            Object.keys(traitsMap).forEach(traitType => {
              traitsData[traitType] = {}
              Object.keys(traitsMap[traitType]).forEach(value => {
                const count = traitsMap[traitType][value]
                // Calculate percentage based on processed tokens (more accurate than total supply)
                const percentage = processedCount > 0 ? (count / processedCount) * 100 : 0
                traitsData[traitType][value] = {
                  count,
                  percentage: parseFloat(percentage.toFixed(2))
                }
              })
            })

            console.log(`✅ Extracted traits from ${processedCount} tokens (${Object.keys(traitsMap).length} trait categories)`)
          } else {
            console.log(`⚠️ No trait attributes found in ${processedCount} tokens`)
          }
        }
      } catch (error) {
        console.error('Error in alternative trait extraction:', error)
      }
    }

    console.log('✅ Trait rarity data received', {
      hasTraits: !!traitsData,
      traitCategories: traitsData ? Object.keys(traitsData).length : 0,
      stats: {
        totalSupply: statsData?.totalSupply,
        listedCount: statsData?.listedCount
      }
    })

    // Return success even if no traits found, so the UI can show a helpful message
    return NextResponse.json({
      stats: statsData,
      traits: traitsData || {},
      collectionSymbol,
      hasTraits: !!traitsData && Object.keys(traitsData).length > 0
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (error) {
    console.error('Error fetching trait rarity:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    )
  }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
