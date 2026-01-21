const PRINTIFY_API_URL = 'https://api.printify.com/v1'
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID
const PRINTIFY_API_KEY = process.env.PRINTIFY_API_KEY

function getHeaders() {
  return {
    'Authorization': `Bearer ${PRINTIFY_API_KEY}`,
    'Content-Type': 'application/json',
  }
}

// Get all blueprints (catalog)
export async function getBlueprints(): Promise<Array<{
  id: number
  title: string
  description: string
  brand: string
  model: string
  images: string[]
}>> {
  const response = await fetch(`${PRINTIFY_API_URL}/catalog/blueprints.json`, {
    headers: getHeaders(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get blueprints: ${response.statusText} - ${errorText}`)
  }

  const data = await response.json()
  // Printify returns blueprints in a data array
  return Array.isArray(data) ? data : (data.data || [])
}

// Get blueprint details
export async function getBlueprintDetails(blueprintId: number): Promise<{
  id: number
  title: string
  description: string
  brand: string
  model: string
  images: string[]
}> {
  const response = await fetch(`${PRINTIFY_API_URL}/catalog/blueprints/${blueprintId}.json`, {
    headers: getHeaders(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get blueprint details: ${response.statusText} - ${errorText}`)
  }

  const data = await response.json()
  console.log('Printify blueprint details response:', JSON.stringify(data, null, 2))
  
  // Handle both direct response and nested data
  return data.data || data
}

// Get print providers for a blueprint
export async function getBlueprintPrintProviders(blueprintId: number): Promise<Array<{
  id: number
  title: string
  location: string
}>> {
  // Try to get print providers from blueprint details first
  try {
    const blueprintDetails = await getBlueprintDetails(blueprintId)
    // Some blueprints might have print_providers in the response
    if ((blueprintDetails as any).print_providers) {
      return (blueprintDetails as any).print_providers
    }
  } catch (error) {
    console.warn('Could not get print providers from blueprint details:', error)
  }

  // Fallback: Try fetching from a separate endpoint if it exists
  // Note: Printify API might require fetching variants to get print providers
  // For now, return a default provider
  return [
    { id: 1, title: 'Default Print Provider', location: 'US' }
  ]
}

// Get print provider details including placeholder images
export async function getPrintProviderDetails(
  blueprintId: number,
  printProviderId: number
): Promise<{
  id: number
  title: string
  location: string
  variants: Array<{
    id: number
    cost: number
    options: { size?: string; color?: string }
  }>
  placeholder_images: Array<{
    position: string
    images: string[]
  }>
}> {
  const response = await fetch(
    `${PRINTIFY_API_URL}/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}.json`,
    {
      headers: getHeaders(),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get print provider details: ${response.statusText} - ${errorText}`)
  }

  const data = await response.json()
  console.log('Printify print provider response:', JSON.stringify(data, null, 2))
  
  // Handle both direct response and nested data
  const providerData = data.data || data
  
  // Check for placeholder_images in various possible locations
  let placeholderImages = providerData.placeholder_images || providerData.placeholders || []
  
  // If placeholder_images is empty, try to get from blueprint images or variants
  if (!placeholderImages || placeholderImages.length === 0) {
    // Try to get placeholder info from variants
    if (providerData.variants && providerData.variants.length > 0) {
      // Some APIs return placeholder info in variants
      const firstVariant = providerData.variants[0]
      if (firstVariant.placeholder_images) {
        placeholderImages = firstVariant.placeholder_images
      }
    }
  }
  
  return {
    ...providerData,
    placeholder_images: placeholderImages,
  }
}

// Upload image to Printify
export async function uploadImageToPrintify(
  imageUrl: string,
  fileName: string
): Promise<string> {
  const response = await fetch(`${PRINTIFY_API_URL}/uploads/images.json`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      file_name: fileName,
      url: imageUrl,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Printify image upload failed: ${error}`)
  }

  const data = await response.json()
  return data.id
}

// Get blueprint variants
export async function getBlueprintVariants(
  blueprintId: number,
  printProviderId: number
): Promise<Array<{ id: number; cost: number; options: { size?: string; color?: string } }>> {
  const response = await fetch(
    `${PRINTIFY_API_URL}/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
    {
      headers: getHeaders(),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to get variants: ${response.statusText}`)
  }

  const data = await response.json()
  return data.variants || []
}

// Create Printify product
export async function createPrintifyProduct(params: {
  title: string
  description: string
  imageId: string // Printify image ID from uploadImageToPrintify
  blueprintId: number
  printProviderId: number
  variants: Array<{ id: number; price: number }>
  placement: {
    front?: { x: number; y: number; scale: number; angle: number }
    back?: { x: number; y: number; scale: number; angle: number }
  }
}): Promise<string> {
  // Build print_areas array
  const printAreas: Array<{
    variant_ids: number[]
    placeholders: Array<{
      position: string
      images: Array<{
        id: string
        x: number
        y: number
        scale: number
        angle: number
      }>
    }>
  }> = []

  const variantIds = params.variants.map(v => v.id)

  // Add front placement if provided
  if (params.placement.front) {
    printAreas.push({
      variant_ids: variantIds,
      placeholders: [
        {
          position: 'front',
          images: [
            {
              id: params.imageId,
              x: params.placement.front.x,
              y: params.placement.front.y,
              scale: params.placement.front.scale,
              angle: params.placement.front.angle,
            },
          ],
        },
      ],
    })
  }

  // Add back placement if provided
  if (params.placement.back) {
    // If front exists, add back to same print_area, otherwise create new one
    if (printAreas.length > 0) {
      printAreas[0].placeholders.push({
        position: 'back',
        images: [
          {
            id: params.imageId,
            x: params.placement.back.x,
            y: params.placement.back.y,
            scale: params.placement.back.scale,
            angle: params.placement.back.angle,
          },
        ],
      })
    } else {
      printAreas.push({
        variant_ids: variantIds,
        placeholders: [
          {
            position: 'back',
            images: [
              {
                id: params.imageId,
                x: params.placement.back.x,
                y: params.placement.back.y,
                scale: params.placement.back.scale,
                angle: params.placement.back.angle,
              },
            ],
          },
        ],
      })
    }
  }

  // If no placements, default to front
  if (printAreas.length === 0) {
    printAreas.push({
      variant_ids: variantIds,
      placeholders: [
        {
          position: 'front',
          images: [
            {
              id: params.imageId,
              x: 0.5,
              y: 0.5,
              scale: 1.0,
              angle: 0,
            },
          ],
        },
      ],
    })
  }

  const payload = {
    title: params.title,
    description: params.description,
    blueprint_id: params.blueprintId,
    print_provider_id: params.printProviderId,
    variants: params.variants,
    print_areas: printAreas,
  }

  const response = await fetch(
    `${PRINTIFY_API_URL}/shops/${PRINTIFY_SHOP_ID}/products.json`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Printify product creation failed: ${error}`)
  }

  const data = await response.json()
  return data.id // Printify product ID
}
