# Printify Product Creation Integration Guide

This guide provides a complete implementation for creating Printify products through a UI, including image upload, placement configuration, and product creation.

## Overview

This integration allows users to:
1. Upload design images to Cloudinary
2. Select Printify blueprints (product types)
3. Configure design placement (front/back positions, sizing, rotation)
4. Create products on Printify with proper print areas
5. Save product data to your database

## Prerequisites

- Node.js 18+ with Next.js 14+
- Printify API account and credentials
- Cloudinary account and credentials
- Database (PostgreSQL recommended, but any SQL database works)

## Environment Variables

Add these to your `.env.local`:

```env
# Printify API
PRINTIFY_API_KEY=your_printify_api_key_here
PRINTIFY_SHOP_ID=your_printify_shop_id_here

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Database (example for PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

## Installation

```bash
npm install @cloudinary/url-gen cloudinary
# or
npm install cloudinary
```

## Architecture Overview

```
┌─────────────┐
│   UI Page   │  User uploads image, selects blueprint, configures placement
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  API Route  │  /api/products/create
└──────┬──────┘
       │
       ├──► Cloudinary (upload image)
       ├──► Printify (upload image, create product)
       └──► Database (save product)
```

## Step 1: Cloudinary Integration

### Setup Cloudinary Client

Create `lib/cloudinary.ts`:

```typescript
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function uploadToCloudinary(
  imageUrl: string,
  folder: string = 'designs'
): Promise<{ url: string; publicId: string }> {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder,
      resource_type: 'image',
    })
    
    return {
      url: result.secure_url,
      publicId: result.public_id,
    }
  } catch (error: any) {
    throw new Error(`Cloudinary upload failed: ${error.message}`)
  }
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: string = 'designs',
  publicId?: string
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        public_id: publicId,
      },
      (error, result) => {
        if (error) reject(error)
        else if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          })
        } else {
          reject(new Error('Upload failed: no result'))
        }
      }
    )
    uploadStream.end(buffer)
  })
}
```

## Step 2: Printify Integration

### Setup Printify Client

Create `lib/printify.ts`:

```typescript
const PRINTIFY_API_URL = 'https://api.printify.com/v1'
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID
const PRINTIFY_API_KEY = process.env.PRINTIFY_API_KEY

function getHeaders() {
  return {
    'Authorization': `Bearer ${PRINTIFY_API_KEY}`,
    'Content-Type': 'application/json',
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
```

## Step 3: API Route

Create `app/api/products/create/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { uploadImageToPrintify, getBlueprintVariants, createPrintifyProduct } from '@/lib/printify'
// Import your database client here

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.imageUrl || !body.blueprintId || !body.printProviderId) {
      return NextResponse.json(
        { error: 'Missing required fields: imageUrl, blueprintId, printProviderId' },
        { status: 400 }
      )
    }

    // 1. Upload image to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(body.imageUrl, 'product-designs')

    // 2. Upload image to Printify
    const printifyImageId = await uploadImageToPrintify(
      cloudinaryResult.url,
      `${body.title || 'design'}.png`
    )

    // 3. Get blueprint variants
    const allVariants = await getBlueprintVariants(body.blueprintId, body.printProviderId)

    // Filter variants (optional - limit to common sizes/colors)
    const commonSizes = ['S', 'M', 'L', 'XL', '2XL', '3XL']
    const filteredVariants = allVariants
      .filter(v => {
        const size = v.options?.size
        return size && commonSizes.includes(size)
      })
      .slice(0, 50) // Printify max is 100 variants

    // Calculate prices (example: 2x cost)
    const variantsWithPrices = filteredVariants.map(v => ({
      id: v.id,
      price: Math.max(0.01, v.cost * 2), // Minimum $0.01
    }))

    // 4. Build placement configuration
    const placement: {
      front?: { x: number; y: number; scale: number; angle: number }
      back?: { x: number; y: number; scale: number; angle: number }
    } = {}

    if (body.placement?.front) {
      placement.front = {
        x: body.placement.front.x ?? 0.5,
        y: body.placement.front.y ?? 0.5,
        scale: body.placement.front.scale ?? 1.0,
        angle: body.placement.front.angle ?? 0,
      }
    }

    if (body.placement?.back) {
      placement.back = {
        x: body.placement.back.x ?? 0.5,
        y: body.placement.back.y ?? 0.5,
        scale: body.placement.back.scale ?? 1.0,
        angle: body.placement.back.angle ?? 0,
      }
    }

    // Default to front if no placement specified
    if (!placement.front && !placement.back) {
      placement.front = { x: 0.5, y: 0.5, scale: 1.0, angle: 0 }
    }

    // 5. Create product on Printify
    const printifyProductId = await createPrintifyProduct({
      title: body.title || 'Custom Product',
      description: body.description || '',
      imageId: printifyImageId,
      blueprintId: body.blueprintId,
      printProviderId: body.printProviderId,
      variants: variantsWithPrices,
      placement,
    })

    // 6. Save to database (example structure)
    // const product = await db.insert(products).values({
    //   title: body.title,
    //   printifyProductId,
    //   cloudinaryUrl: cloudinaryResult.url,
    //   cloudinaryPublicId: cloudinaryResult.publicId,
    //   blueprintId: body.blueprintId,
    //   // ... other fields
    // })

    return NextResponse.json({
      success: true,
      printifyProductId,
      cloudinaryUrl: cloudinaryResult.url,
      message: 'Product created successfully',
    })
  } catch (error: any) {
    console.error('Product creation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create product' },
      { status: 500 }
    )
  }
}
```

## Step 4: UI Components

### Basic Product Creation Form

Create `components/ProductCreator.tsx`:

```typescript
'use client'

import { useState } from 'react'

interface Placement {
  front?: { x: number; y: number; scale: number; angle: number }
  back?: { x: number; y: number; scale: number; angle: number }
}

export function ProductCreator() {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [blueprintId, setBlueprintId] = useState<number>(0)
  const [printProviderId, setPrintProviderId] = useState<number>(0)
  const [placement, setPlacement] = useState<Placement>({})
  const [loading, setLoading] = useState(false)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Convert to base64 or upload to Cloudinary first
    const reader = new FileReader()
    reader.onloadend = () => {
      setImageUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/products/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          title,
          description,
          blueprintId,
          printProviderId,
          placement,
        }),
      })

      const data = await response.json()
      if (data.success) {
        alert('Product created successfully!')
        // Reset form or redirect
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to create product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label>Product Image</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          required
        />
        {imageUrl && (
          <img src={imageUrl} alt="Preview" className="mt-2 max-w-xs" />
        )}
      </div>

      <div>
        <label>Product Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div>
        <label>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label>Blueprint ID</label>
        <input
          type="number"
          value={blueprintId}
          onChange={(e) => setBlueprintId(Number(e.target.value))}
          required
        />
      </div>

      <div>
        <label>Print Provider ID</label>
        <input
          type="number"
          value={printProviderId}
          onChange={(e) => setPrintProviderId(Number(e.target.value))}
          required
        />
      </div>

      {/* Placement Configuration */}
      <div className="space-y-2">
        <label>Placement Configuration</label>
        
        <div>
          <label>
            <input
              type="checkbox"
              checked={!!placement.front}
              onChange={(e) => {
                setPlacement({
                  ...placement,
                  front: e.target.checked
                    ? { x: 0.5, y: 0.5, scale: 1.0, angle: 0 }
                    : undefined,
                })
              }}
            />
            Front
          </label>
          {placement.front && (
            <div className="ml-6 space-y-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={placement.front.x}
                onChange={(e) =>
                  setPlacement({
                    ...placement,
                    front: { ...placement.front!, x: Number(e.target.value) },
                  })
                }
              />
              <label>X: {placement.front.x.toFixed(2)}</label>
              {/* Add Y, Scale, Angle controls similarly */}
            </div>
          )}
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={!!placement.back}
              onChange={(e) => {
                setPlacement({
                  ...placement,
                  back: e.target.checked
                    ? { x: 0.5, y: 0.5, scale: 1.0, angle: 0 }
                    : undefined,
                })
              }}
            />
            Back
          </label>
          {placement.back && (
            <div className="ml-6 space-y-2">
              {/* Similar controls for back placement */}
            </div>
          )}
        </div>
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Product'}
      </button>
    </form>
  )
}
```

## Step 5: Page Implementation

Create `app/products/create/page.tsx`:

```typescript
import { ProductCreator } from '@/components/ProductCreator'

export default function CreateProductPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Create Product</h1>
      <ProductCreator />
    </div>
  )
}
```

## Key Concepts

### Placement Values

- **x, y**: Position coordinates (0.0 to 1.0)
  - `0.5, 0.5` = center
  - `0.0, 0.0` = top-left
  - `1.0, 1.0` = bottom-right

- **scale**: Size multiplier (0.1 to 2.0)
  - `1.0` = default size
  - `0.5` = half size
  - `2.0` = double size

- **angle**: Rotation in degrees (0 to 360)
  - `0` = no rotation
  - `90` = 90° clockwise

### Print Areas Structure

Printify requires all positions for the same variants to be in a **single print_area**:

```json
{
  "print_areas": [
    {
      "variant_ids": [1, 2, 3],
      "placeholders": [
        {
          "position": "front",
          "images": [{ "id": "image-id", "x": 0.5, "y": 0.5, "scale": 1.0, "angle": 0 }]
        },
        {
          "position": "back",
          "images": [{ "id": "image-id", "x": 0.5, "y": 0.5, "scale": 1.0, "angle": 0 }]
        }
      ]
    }
  ]
}
```

## Common Blueprint IDs

- T-Shirt: `5` (Gildan 64000)
- Hoodie: `91` (Gildan 18500)
- Tank Top: `12` (Gildan 42000)

## Error Handling

Always wrap Printify API calls in try-catch blocks. Common errors:
- Invalid image URL (must be publicly accessible)
- Invalid blueprint/print provider combination
- Too many variants (max 100)
- Invalid placement values (must be within ranges)

## Testing

1. Test with a simple front-only placement first
2. Verify image uploads to both Cloudinary and Printify
3. Check Printify dashboard to confirm product creation
4. Test with both front and back placements
5. Verify scale and position values are applied correctly

## Next Steps

- Add blueprint selection UI (fetch from Printify catalog API)
- Add visual placement editor (drag/drop, resize, rotate)
- Add variant filtering UI (size, color selection)
- Add product preview before creation
- Implement error recovery and retry logic

## Notes

- Printify products are created as drafts by default
- You may need to publish products separately
- Mockup images are generated asynchronously by Printify
- Use Printify webhooks to track product status updates
