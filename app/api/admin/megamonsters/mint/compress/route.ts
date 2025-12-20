import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getPool } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const pool = getPool()
    
    const { megaMonsterId, imageUrl } = await request.json()
    
    if (!megaMonsterId || !imageUrl) {
      return NextResponse.json({
        success: false,
        error: 'Missing megaMonsterId or imageUrl'
      }, { status: 400 })
    }
    
    console.log(`🖼️ Compressing mega monster image ${megaMonsterId}`)
    
    // Download the original image
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`)
    }
    
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    
    // Dynamically import sharp to avoid build-time errors
    const sharp = (await import('sharp')).default
    
    // Resize and compress to WebP
    const webpBuffer = await sharp(imageBuffer)
      .resize(630, 630, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .webp({ quality: 70, effort: 6 })
      .toBuffer()
    
    console.log(`✅ Compressed to WebP`)
    console.log(`📊 Compression stats:`)
    console.log(`   Original size: ${imageBuffer.length} bytes (${(imageBuffer.length / 1024).toFixed(2)} KB)`)
    console.log(`   Compressed size: ${webpBuffer.length} bytes (${(webpBuffer.length / 1024).toFixed(2)} KB)`)
    console.log(`   Reduction: ${Math.round((1 - webpBuffer.length / imageBuffer.length) * 100)}%`)
    
    // Convert to base64 for inscription
    const compressedBase64 = webpBuffer.toString('base64')
    
    // Upload compressed image to Vercel Blob Storage
    console.log(`☁️ Uploading compressed WebP image to blob storage...`)
    const blob = await put(`mega-monster-compressed-${megaMonsterId}.webp`, webpBuffer, {
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: true,
    })
    
    console.log(`✅ Uploaded to blob storage: ${blob.url}`)
    
    // Store compressed URL in a temporary field or return it
    // We'll store it in the response and the frontend will use it
    
    console.log(`✅ Compressed mega monster ${megaMonsterId}`)
    
    return NextResponse.json({
      success: true,
      compressed_url: blob.url,
      compressed_base64: compressedBase64,
      compressed_size: webpBuffer.length,
      original_size: imageBuffer.length,
      format: 'WebP'
    })
    
  } catch (error) {
    console.error('❌ Compression failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Compression failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

