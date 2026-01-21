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

  // Build placeholders array from all provided positions
  // params.placement can be: { front: {...}, back: {...}, sleeve: {...}, etc. }
  const placeholders: Array<{
    position: string
    images: Array<{
      id: string
      x: number
      y: number
      scale: number
      angle: number
    }>
  }> = []

  // Process each position in the placement object
  Object.entries(params.placement).forEach(([position, posData]) => {
    if (posData) {
      placeholders.push({
        position, // 'front', 'back', 'sleeve', etc.
        images: [
          {
            id: params.imageId,
            x: posData.x ?? 0.5,
            y: posData.y ?? 0.5,
            scale: posData.scale ?? 1.0,
            angle: posData.angle ?? 0,
          },
        ],
      })
    }
  })

  // If no placements provided, default to front
  if (placeholders.length === 0) {
    placeholders.push({
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
    })
  }

  // Create a single print_area with all placeholders
  // This is critical: all positions must be in the same print_area
  printAreas.push({
    variant_ids: variantIds,
    placeholders,
  })

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

    // 4. Build placement configuration from applied positions
    // body.placement is a Record<string, PlacementData> where keys are position names
    // Example: { front: { x, y, scale, widthScale, heightScale, angle, blueprintId, ... }, back: {...} }
    
    const placement: {
      front?: { x: number; y: number; scale: number; angle: number }
      back?: { x: number; y: number; scale: number; angle: number }
      [key: string]: { x: number; y: number; scale: number; angle: number } | undefined
    } = {}

    // Process each position from body.placement
    Object.entries(body.placement || {}).forEach(([position, posData]: [string, any]) => {
      // Calculate scale: use widthScale/heightScale if available, otherwise use scale
      const widthScale = posData.widthScale ?? posData.scale ?? 1.0
      const heightScale = posData.heightScale ?? posData.scale ?? 1.0
      
      // For Printify, use the average or widthScale as the primary scale
      // (Printify may only accept a single scale value)
      const finalScale = posData.widthScale && posData.heightScale
        ? (widthScale + heightScale) / 2 // Average for uniform scaling
        : (posData.scale ?? 1.0)

      placement[position] = {
        x: posData.x ?? 0.5,
        y: posData.y ?? 0.5,
        scale: finalScale,
        angle: posData.angle ?? 0,
      }
    })

    // Default to front if no placement specified
    if (Object.keys(placement).length === 0) {
      placement.front = { x: 0.5, y: 0.5, scale: 1.0, angle: 0 }
    }

    // 5. Group positions by blueprint (since each position can have different blueprint)
    // Build items grouped by blueprint for product creation
    const itemsByBlueprint = new Map<number, {
      blueprintId: number
      printProviderId: number
      positions: Array<{ position: string; placement: any }>
    }>()

    Object.entries(body.placement || {}).forEach(([position, posData]: [string, any]) => {
      const blueprintId = posData.blueprintId || body.blueprintId
      const printProviderId = posData.printProviderId || body.printProviderId

      if (!itemsByBlueprint.has(blueprintId)) {
        itemsByBlueprint.set(blueprintId, {
          blueprintId,
          printProviderId,
          positions: [],
        })
      }

      itemsByBlueprint.get(blueprintId)!.positions.push({
        position,
        placement: placement[position],
      })
    })

    // 6. Create products on Printify (one per blueprint)
    const createdProducts: string[] = []
    
    for (const [blueprintId, item] of itemsByBlueprint) {
      // Get variants for this specific blueprint
      const blueprintVariants = await getBlueprintVariants(item.blueprintId, item.printProviderId)
      const filteredVariants = blueprintVariants
        .filter(v => {
          const size = v.options?.size
          return size && ['S', 'M', 'L', 'XL', '2XL', '3XL'].includes(size)
        })
        .slice(0, 50)
      
      const variantsWithPrices = filteredVariants.map(v => ({
        id: v.id,
        price: Math.max(0.01, v.cost * 2),
      }))

      // Build placement object for this blueprint's positions
      const blueprintPlacement: Record<string, any> = {}
      item.positions.forEach(({ position, placement: posPlacement }) => {
        blueprintPlacement[position] = posPlacement
      })

      const printifyProductId = await createPrintifyProduct({
        title: body.title || 'Custom Product',
        description: body.description || '',
        imageId: printifyImageId,
        blueprintId: item.blueprintId,
        printProviderId: item.printProviderId,
        variants: variantsWithPrices,
        placement: blueprintPlacement,
      })

      createdProducts.push(printifyProductId)
    }

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
      printifyProductIds: createdProducts,
      cloudinaryUrl: cloudinaryResult.url,
      message: `Successfully created ${createdProducts.length} product(s)`,
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

## Step 4: UI Components & Workflow

### UI Architecture Overview

The UI follows a **multi-step workflow** that guides users through product creation:

1. **Step 1: Product Selection** - Select Printify blueprints (product types)
2. **Step 2: Design Generation** - Upload/generate design image
3. **Step 3: Placement Configuration** - Visual editor to position design on product
4. **Step 4: Product Details** - Title, description, category, etc.
5. **Step 5: Create Product** - Submit to Printify

### Key UI Concepts

#### Position Management

- **All positions are OFF by default** (front, back, sleeve, pocket, etc.)
- **Single-select viewing**: When a user selects a position checkbox, it becomes the active view (others are hidden)
- **Apply toggle per position**: Each position has its own "Apply image to [Position]" checkbox
- **Blueprint per position**: Each applied position can use a different blueprint

#### State Structure

```typescript
// Track which positions are selected for viewing
const [selectedPositions, setSelectedPositions] = useState<Record<string, boolean>>({
  front: false,
  back: false,
  // ... all positions default to false
})

// Track which positions have the image applied (will be included in product)
const [appliedPositions, setAppliedPositions] = useState<Record<string, boolean>>({
  front: false,
  back: false,
  // ... all default to false
})

// Track which blueprint is used for each position
const [positionBlueprints, setPositionBlueprints] = useState<Record<string, {
  blueprintId: number
  printProviderId: number
}>>({})

// Placement data for each position (x, y, scale, angle, widthScale, heightScale)
const [placement, setPlacement] = useState<{
  positionsData: Record<string, {
    x: number
    y: number
    scale: number
    widthScale?: number
    heightScale?: number
    angle: number
    lockAspectRatio?: boolean
  }>
}>({
  positionsData: {}
})
```

### Visual Placement Editor Component

The `ProductPlacementEditor` is a **drag-and-drop visual editor** that shows:
- Product mockup image (from Printify blueprint)
- Design overlay positioned on the product
- Interactive controls for positioning and sizing

#### Features:

1. **Drag to Position**: Click and drag the design overlay to move it
2. **Resize Handles**: Click and drag corner/edge handles to resize
3. **Independent Width/Height Scaling**: When `lockAspectRatio` is false, width and height can scale independently
4. **Real-time Preview**: Changes update immediately on the mockup

#### Implementation:

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'

interface PlacementPosition {
  x: number // 0.0 to 1.0 (0.5 = center)
  y: number // 0.0 to 1.0 (0.5 = center)
  scale: number // Uniform scale (fallback)
  widthScale?: number // Independent width scaling
  heightScale?: number // Independent height scaling
  angle: number // Rotation in degrees
  lockAspectRatio?: boolean
}

function ProductPlacementEditor({
  previewUrl, // The design image URL
  productImages, // Array of product mockup images [front, back, ...]
  placement, // Full placement state object
  onPlacementChange, // Callback to update placement
  position, // Current position name ('front', 'back', etc.)
}: {
  previewUrl: string
  productImages: string[] | null
  placement: { positionsData: Record<string, PlacementPosition> }
  onPlacementChange: (changes: Partial<typeof placement>) => void
  position: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)

  // Get current position data with defaults
  const posData = placement.positionsData[position] || {}
  const currentPosition: PlacementPosition = {
    x: posData.x ?? 0.5,
    y: posData.y ?? 0.5,
    scale: posData.scale ?? 1.0,
    widthScale: posData.widthScale ?? posData.scale ?? 1.0,
    heightScale: posData.heightScale ?? posData.scale ?? 1.0,
    angle: posData.angle ?? 0,
    lockAspectRatio: posData.lockAspectRatio ?? false,
  }

  // Use widthScale/heightScale if available, otherwise fall back to uniform scale
  const widthScale = currentPosition.widthScale ?? currentPosition.scale ?? 1.0
  const heightScale = currentPosition.heightScale ?? currentPosition.scale ?? 1.0

  // Handle drag to position
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    e.preventDefault()
    setIsDragging(true)
    const rect = containerRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    
    onPlacementChange({
      positionsData: {
        ...placement.positionsData,
        [position]: { ...currentPosition, x, y }
      }
    })
  }

  // Handle resize (simplified - full implementation has 8 handles)
  const handleResizeStart = (handle: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setIsResizing(true)
    setResizeHandle(handle)
    // Store initial values for resize calculation
  }

  // Get product mockup image for this position
  // Try to find position-specific image, fallback to front or first image
  const getMockupImage = (): string => {
    if (!productImages || productImages.length === 0) {
      return '/placeholder-product.png' // Fallback
    }
    
    // Map position to image index (front=0, back=1, etc.)
    const positionIndexMap: Record<string, number> = {
      front: 0,
      back: 1,
      left: 2,
      right: 3,
    }
    
    const index = positionIndexMap[position] ?? 0
    return productImages[Math.min(index, productImages.length - 1)]
  }

  return (
    <div className="relative border rounded-lg overflow-hidden bg-gray-50">
      {/* Product Mockup Background */}
      <div className="relative w-full aspect-square">
        <img
          src={getMockupImage()}
          alt={`${position} view`}
          className="w-full h-full object-contain"
        />
        
        {/* Design Overlay - Positioned and Scaled */}
        <div
          ref={containerRef}
          className="absolute inset-0 cursor-move"
          onMouseDown={handleMouseDown}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
        >
          <div
            className="absolute border-2 border-blue-500 bg-white bg-opacity-90"
            style={{
              left: `${currentPosition.x * 100}%`,
              top: `${currentPosition.y * 100}%`,
              width: `${widthScale * 200}px`, // Base size * scale
              height: `${heightScale * 200}px`,
              transform: `
                translate(-50%, -50%)
                rotate(${currentPosition.angle}deg)
              `,
              transformOrigin: 'center center',
            }}
          >
            <img
              src={previewUrl}
              alt="Design"
              className="w-full h-full object-contain pointer-events-none"
            />
            
            {/* Resize Handles (shown on hover/click) */}
            {showHandles && (
              <>
                {/* Corner handles */}
                <div className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 border border-white rounded cursor-nwse-resize"
                  onMouseDown={(e) => handleResizeStart('nw', e)}
                />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 border border-white rounded cursor-nesw-resize"
                  onMouseDown={(e) => handleResizeStart('ne', e)}
                />
                <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 border border-white rounded cursor-nesw-resize"
                  onMouseDown={(e) => handleResizeStart('sw', e)}
                />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border border-white rounded cursor-nwse-resize"
                  onMouseDown={(e) => handleResizeStart('se', e)}
                />
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Position Controls */}
      <div className="p-3 bg-white border-t space-y-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label>X: {currentPosition.x.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={currentPosition.x}
              onChange={(e) => onPlacementChange({
                positionsData: {
                  ...placement.positionsData,
                  [position]: { ...currentPosition, x: Number(e.target.value) }
                }
              })}
              className="w-full"
            />
          </div>
          <div>
            <label>Y: {currentPosition.y.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={currentPosition.y}
              onChange={(e) => onPlacementChange({
                positionsData: {
                  ...placement.positionsData,
                  [position]: { ...currentPosition, y: Number(e.target.value) }
                }
              })}
              className="w-full"
            />
          </div>
          <div>
            <label>Width Scale: {widthScale.toFixed(2)}</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.05"
              value={widthScale}
              onChange={(e) => onPlacementChange({
                positionsData: {
                  ...placement.positionsData,
                  [position]: { 
                    ...currentPosition, 
                    widthScale: Number(e.target.value),
                    scale: currentPosition.lockAspectRatio ? Number(e.target.value) : currentPosition.scale
                  }
                }
              })}
              className="w-full"
            />
          </div>
          <div>
            <label>Height Scale: {heightScale.toFixed(2)}</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.05"
              value={heightScale}
              onChange={(e) => onPlacementChange({
                positionsData: {
                  ...placement.positionsData,
                  [position]: { 
                    ...currentPosition, 
                    heightScale: Number(e.target.value),
                    scale: currentPosition.lockAspectRatio ? Number(e.target.value) : currentPosition.scale
                  }
                }
              })}
              className="w-full"
            />
          </div>
          <div>
            <label>Rotation: {currentPosition.angle}°</label>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={currentPosition.angle}
              onChange={(e) => onPlacementChange({
                positionsData: {
                  ...placement.positionsData,
                  [position]: { ...currentPosition, angle: Number(e.target.value) }
                }
              })}
              className="w-full"
            />
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={currentPosition.lockAspectRatio ?? false}
                onChange={(e) => onPlacementChange({
                  positionsData: {
                    ...placement.positionsData,
                    [position]: { 
                      ...currentPosition, 
                      lockAspectRatio: e.target.checked,
                      // When locking, sync scales
                      scale: e.target.checked ? widthScale : currentPosition.scale,
                      widthScale: e.target.checked ? widthScale : currentPosition.widthScale,
                      heightScale: e.target.checked ? widthScale : currentPosition.heightScale,
                    }
                  }
                })}
              />
              Lock Aspect Ratio
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### Complete Product Creator Component

```typescript
'use client'

import { useState } from 'react'
import { ProductPlacementEditor } from './ProductPlacementEditor'

export function ProductCreator() {
  // Step management
  const [currentStep, setCurrentStep] = useState<'products' | 'design' | 'placement' | 'details'>('products')
  
  // Product selection
  const [selectedBlueprints, setSelectedBlueprints] = useState<Map<number, {
    blueprintId: number
    printProviderId: number
    blueprintTitle: string
    availablePlacements: string[]
    placeholderImages: Record<string, string | string[]>
  }>>(new Map())
  
  // Design image
  const [designImageUrl, setDesignImageUrl] = useState<string>('')
  
  // Position management
  const [selectedPositions, setSelectedPositions] = useState<Record<string, boolean>>({
    front: false,
    back: false,
    // ... all positions default to false
  })
  
  const [appliedPositions, setAppliedPositions] = useState<Record<string, boolean>>({
    front: false,
    back: false,
  })
  
  const [positionBlueprints, setPositionBlueprints] = useState<Record<string, {
    blueprintId: number
    printProviderId: number
  }>>({})
  
  // Placement data
  const [placement, setPlacement] = useState<{
    positionsData: Record<string, PlacementPosition>
  }>({
    positionsData: {}
  })
  
  // Product details
  const [productTitle, setProductTitle] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [loading, setLoading] = useState(false)

  // Get all available positions from selected blueprints
  const getAllAvailablePositions = (): string[] => {
    const positions = new Set<string>()
    selectedBlueprints.forEach(bp => {
      bp.availablePlacements?.forEach(pos => positions.add(pos))
    })
    return Array.from(positions)
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Step 1: Product Selection */}
      {currentStep === 'products' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Select Products</h2>
          {/* Blueprint selection UI */}
          <button
            onClick={() => setCurrentStep('design')}
            disabled={selectedBlueprints.size === 0}
          >
            Continue to Design
          </button>
        </div>
      )}

      {/* Step 2: Design Upload/Generation */}
      {currentStep === 'design' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Upload Design</h2>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                const url = URL.createObjectURL(file)
                setDesignImageUrl(url)
              }
            }}
          />
          {designImageUrl && (
            <img src={designImageUrl} alt="Design" className="max-w-md" />
          )}
          <button
            onClick={() => setCurrentStep('placement')}
            disabled={!designImageUrl}
          >
            Continue to Placement
          </button>
        </div>
      )}

      {/* Step 3: Placement Configuration */}
      {currentStep === 'placement' && designImageUrl && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Configure Placement</h2>
          
          {/* Position Selection (Single-select for viewing) */}
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-3">Select Position to Configure</h3>
            <div className="grid grid-cols-3 gap-2">
              {getAllAvailablePositions().map((position) => (
                <label
                  key={position}
                  className={`flex items-center gap-2 p-2 rounded border-2 cursor-pointer ${
                    selectedPositions[position]
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPositions[position] || false}
                    onChange={(e) => {
                      // Single-select: when checking, uncheck all others
                      const newSelected: Record<string, boolean> = {}
                      getAllAvailablePositions().forEach(pos => {
                        newSelected[pos] = pos === position && e.target.checked
                      })
                      setSelectedPositions(newSelected)
                    }}
                  />
                  <span className="capitalize">{position}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Visual Editor for Selected Position */}
          {getAllAvailablePositions().filter(pos => selectedPositions[pos]).map((position) => {
            const isApplied = appliedPositions[position] || false
            const blueprint = positionBlueprints[position] 
              ? selectedBlueprints.get(positionBlueprints[position].blueprintId)
              : Array.from(selectedBlueprints.values())[0]
            
            const productImages = blueprint?.placeholderImages?.availableImages as string[] || null

            return (
              <div key={position} className="space-y-4">
                {/* Apply Toggle & Blueprint Selection */}
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isApplied}
                        onChange={(e) => {
                          setAppliedPositions({
                            ...appliedPositions,
                            [position]: e.target.checked
                          })
                          
                          // Auto-select blueprint if not set
                          if (e.target.checked && !positionBlueprints[position]) {
                            const firstBp = Array.from(selectedBlueprints.values())[0]
                            if (firstBp) {
                              setPositionBlueprints({
                                ...positionBlueprints,
                                [position]: {
                                  blueprintId: firstBp.blueprintId,
                                  printProviderId: firstBp.printProviderId
                                }
                              })
                            }
                          }
                        }}
                        className="w-5 h-5"
                      />
                      <span className="font-medium">
                        Apply image to {position.charAt(0).toUpperCase() + position.slice(1)}
                      </span>
                    </label>
                    {isApplied && <span className="text-green-600 text-sm">✓ Active</span>}
                  </div>
                  
                  {/* Blueprint Selection for this Position */}
                  {isApplied && (
                    <div>
                      <label className="block text-sm mb-1">Blueprint for {position}:</label>
                      <select
                        value={positionBlueprints[position]?.blueprintId || ''}
                        onChange={(e) => {
                          const blueprintId = parseInt(e.target.value)
                          const selectedBp = Array.from(selectedBlueprints.values()).find(
                            bp => bp.blueprintId === blueprintId
                          )
                          if (selectedBp) {
                            setPositionBlueprints({
                              ...positionBlueprints,
                              [position]: {
                                blueprintId: selectedBp.blueprintId,
                                printProviderId: selectedBp.printProviderId
                              }
                            })
                          }
                        }}
                        className="w-full px-3 py-2 border rounded"
                      >
                        {Array.from(selectedBlueprints.values()).map((bp) => (
                          <option key={bp.blueprintId} value={bp.blueprintId}>
                            {bp.blueprintTitle}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Visual Placement Editor */}
                <ProductPlacementEditor
                  previewUrl={designImageUrl}
                  productImages={productImages}
                  placement={placement}
                  onPlacementChange={setPlacement}
                  position={position}
                />
              </div>
            )
          })}

          <button
            onClick={() => setCurrentStep('details')}
            disabled={Object.values(appliedPositions).every(v => !v)}
          >
            Continue to Details
          </button>
        </div>
      )}

      {/* Step 4: Product Details */}
      {currentStep === 'details' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Product Details</h2>
          
          <div>
            <label>Product Title</label>
            <input
              type="text"
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          
          <div>
            <label>Description</label>
            <textarea
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              className="w-full px-4 py-2 border rounded"
              rows={4}
            />
          </div>

          <button
            onClick={async () => {
              setLoading(true)
              try {
                // Build placement data for applied positions only
                const placementData: Record<string, any> = {}
                Object.entries(appliedPositions).forEach(([pos, applied]) => {
                  if (applied && placement.positionsData[pos]) {
                    const posData = placement.positionsData[pos]
                    const bp = positionBlueprints[pos]
                    
                    placementData[pos] = {
                      blueprintId: bp.blueprintId,
                      printProviderId: bp.printProviderId,
                      x: posData.x,
                      y: posData.y,
                      scale: posData.scale,
                      widthScale: posData.widthScale ?? posData.scale,
                      heightScale: posData.heightScale ?? posData.scale,
                      angle: posData.angle,
                    }
                  }
                })

                const response = await fetch('/api/products/create', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    imageUrl: designImageUrl,
                    title: productTitle,
                    description: productDescription,
                    placement: placementData,
                  }),
                })

                const data = await response.json()
                if (data.success) {
                  alert('Product created successfully!')
                } else {
                  alert(`Error: ${data.error}`)
                }
              } catch (error) {
                alert('Failed to create product')
              } finally {
                setLoading(false)
              }
            }}
            disabled={loading || !productTitle}
          >
            {loading ? 'Creating...' : 'Create Product'}
          </button>
        </div>
      )}
    </div>
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

- **scale**: Uniform size multiplier (0.1 to 3.0)
  - `1.0` = default size
  - `0.5` = half size
  - `2.0` = double size
  - Used as fallback when `widthScale`/`heightScale` are not provided

- **widthScale, heightScale**: Independent scaling (0.1 to 3.0)
  - Allows non-uniform scaling (e.g., wider but not taller)
  - When `lockAspectRatio` is `false`, these can differ
  - When `lockAspectRatio` is `true`, both should match
  - **Important**: When sending to Printify, use `widthScale`/`heightScale` if available, otherwise use `scale` for both dimensions

- **angle**: Rotation in degrees (0 to 360)
  - `0` = no rotation
  - `90` = 90° clockwise
  - `180` = upside down
  - `270` = 90° counter-clockwise

### Scale Calculation Logic

When preparing placement data for Printify:

```typescript
// Calculate final scale values
const finalWidthScale = positionData.widthScale ?? positionData.scale ?? 1.0
const finalHeightScale = positionData.heightScale ?? positionData.scale ?? 1.0

// For Printify API, use the calculated values
const printifyPlacement = {
  x: positionData.x,
  y: positionData.y,
  scale: finalWidthScale, // Printify may use this for uniform scaling
  // OR if Printify supports separate width/height, use:
  widthScale: finalWidthScale,
  heightScale: finalHeightScale,
  angle: positionData.angle,
}
```

**Note**: Printify's API may only accept a single `scale` value. In that case, use the average or the larger of the two scales, or use `widthScale` as the primary value.

### Print Areas Structure

Printify requires all positions for the same variants to be in a **single print_area**. This is critical:

```json
{
  "print_areas": [
    {
      "variant_ids": [1, 2, 3, 4, 5],
      "placeholders": [
        {
          "position": "front",
          "images": [{ 
            "id": "image-id", 
            "x": 0.5, 
            "y": 0.5, 
            "scale": 1.0, 
            "angle": 0 
          }]
        },
        {
          "position": "back",
          "images": [{ 
            "id": "image-id", 
            "x": 0.5, 
            "y": 0.5, 
            "scale": 1.0, 
            "angle": 0 
          }]
        }
      ]
    }
  ]
}
```

**Key Points:**
- All positions (front, back, etc.) that share the same variants must be in the **same print_area**
- Each `print_area` contains one or more `placeholders` (one per position)
- Each `placeholder` contains an array of `images` (usually just one image)
- The same image ID can be used across multiple positions
- **Do NOT create separate print_areas for each position** - combine them into one

### UI Workflow Summary

1. **Product Selection**: User selects one or more blueprints (product types)
2. **Design Upload**: User uploads or generates a design image
3. **Position Viewing**: User selects a position checkbox to view it (single-select)
4. **Position Application**: User toggles "Apply image to [Position]" for each position they want
5. **Blueprint Assignment**: For each applied position, user selects which blueprint to use
6. **Visual Editing**: User drags, resizes, and rotates the design on the product mockup
7. **Product Creation**: Only applied positions are included in the final product

### Understanding Position States

There are **two separate concepts** for positions:

1. **Selected for Viewing** (`selectedPositions`):
   - Controls which position is currently visible in the editor
   - Single-select: only one position can be viewed at a time
   - Used for navigation/UI purposes only
   - Does NOT affect product creation

2. **Applied** (`appliedPositions`):
   - Controls which positions will actually have the design applied
   - Multiple positions can be applied simultaneously
   - Each applied position requires a blueprint selection
   - **Only applied positions are sent to Printify**

**Example Flow:**
```
1. User selects "front" checkbox → front position is now visible
2. User toggles "Apply image to Front" → front is now applied
3. User selects "back" checkbox → back position is now visible (front hidden)
4. User toggles "Apply image to Back" → back is now applied
5. User creates product → Both front AND back are included (because both are applied)
```

### Mockup Saving (Optional Feature)

After configuring placement, you may want to save visual mockups:

```typescript
// Capture the visual preview as an image
const handleSaveMockup = async (position: string) => {
  const mockupElement = mockupRefs.current[position]
  if (!mockupElement) return

  // Use html2canvas or similar to capture the element
  const canvas = await html2canvas(mockupElement)
  const imageData = canvas.toDataURL('image/png')
  
  // Upload to Cloudinary
  const response = await fetch('/api/upload-mockup', {
    method: 'POST',
    body: JSON.stringify({ imageData, position }),
  })
  
  const { url } = await response.json()
  // Save mockup URL to state
  setSavedMockups(prev => [...prev, { position, url }])
}
```

These mockups can be used as product preview images in your store.

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

## Common Pitfalls & Best Practices

### 1. Multiple Print Areas vs Single Print Area

❌ **WRONG**: Creating separate print_areas for each position
```typescript
// DON'T DO THIS
printAreas = [
  { variant_ids: [1,2,3], placeholders: [{ position: 'front', ... }] },
  { variant_ids: [1,2,3], placeholders: [{ position: 'back', ... }] }
]
```

✅ **CORRECT**: Combining all positions into one print_area
```typescript
// DO THIS
printAreas = [
  { 
    variant_ids: [1,2,3], 
    placeholders: [
      { position: 'front', ... },
      { position: 'back', ... }
    ]
  }
]
```

### 2. Scale Calculation

❌ **WRONG**: Always using `scale` even when `widthScale`/`heightScale` exist
```typescript
const scale = positionData.scale // Ignores custom width/height scaling
```

✅ **CORRECT**: Using `widthScale`/`heightScale` when available
```typescript
const widthScale = positionData.widthScale ?? positionData.scale ?? 1.0
const heightScale = positionData.heightScale ?? positionData.scale ?? 1.0
// Use these values for Printify
```

### 3. Position State Management

❌ **WRONG**: Confusing "selected for viewing" with "applied"
```typescript
// Only checking selectedPositions when creating product
if (selectedPositions[position]) { /* include in product */ }
```

✅ **CORRECT**: Using `appliedPositions` for product creation
```typescript
// Check appliedPositions, not selectedPositions
if (appliedPositions[position]) { /* include in product */ }
```

### 4. Blueprint Selection

❌ **WRONG**: Assuming all positions use the same blueprint
```typescript
const blueprintId = body.blueprintId // Same for all positions
```

✅ **CORRECT**: Allowing different blueprints per position
```typescript
const blueprintId = positionBlueprints[position]?.blueprintId || body.blueprintId
```

### 5. Default Values

Always provide defaults for placement values:
```typescript
const placement = {
  x: posData.x ?? 0.5,        // Default to center
  y: posData.y ?? 0.5,        // Default to center
  scale: posData.scale ?? 1.0, // Default to 100%
  angle: posData.angle ?? 0,   // Default to no rotation
}
```

### 6. Image URL Accessibility

Printify requires publicly accessible image URLs. Ensure:
- Images are uploaded to Cloudinary (or similar CDN) first
- URLs use HTTPS
- URLs are not behind authentication
- Images are in supported formats (PNG, JPG, WebP)

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
