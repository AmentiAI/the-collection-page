import { NextRequest, NextResponse } from 'next/server'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { uploadImageToPrintify, getBlueprintVariants, createPrintifyProduct } from '@/lib/printify'

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
