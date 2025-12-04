import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'
import type { Pool } from 'pg'

async function ensureMintInfrastructure(pool: Pool) {
  if (isTableInitialized('mint_inscriptions')) {
    return
  }

  console.log('🔧 Initializing mint infrastructure (compress endpoint)...')

  // Create mint_inscriptions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mint_inscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mint_queue_id UUID REFERENCES ascended_images_mint_queue(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      payment_address TEXT,
      receiving_address TEXT,
      
      -- Transaction IDs
      commit_tx_id TEXT,
      reveal_tx_id TEXT,
      inscription_id TEXT,
      
      -- PSBTs and signed data
      commit_psbt_base64 TEXT,
      reveal_psbt_base64 TEXT,
      signed_commit_tx_hex TEXT,
      signed_reveal_tx_hex TEXT,
      
      -- Fee and cost info
      fee_rate DECIMAL(10, 2) NOT NULL,
      commit_fee_sats INTEGER,
      reveal_fee_sats INTEGER,
      total_cost_sats INTEGER,
      
      -- Image data
      original_image_url TEXT NOT NULL,
      compressed_image_url TEXT,
      compressed_base64 TEXT,
      is_compressed BOOLEAN DEFAULT FALSE,
      
      -- Status tracking
      mint_status TEXT NOT NULL DEFAULT 'pending_compression',
      error_message TEXT,
      
      -- Reveal data (JSON)
      reveal_data JSONB,
      
      -- Timestamps
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      commit_signed_at TIMESTAMPTZ,
      commit_broadcast_at TIMESTAMPTZ,
      commit_confirmed_at TIMESTAMPTZ,
      reveal_broadcast_at TIMESTAMPTZ,
      reveal_confirmed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      
      UNIQUE(mint_queue_id)
    )
  `)

  // Add unique constraint on mint_queue_id (one mint record per queue item)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mint_inscriptions_queue_unique 
    ON mint_inscriptions(mint_queue_id)
  `)
  
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_status 
    ON mint_inscriptions(mint_status)
  `)
  
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_wallet 
    ON mint_inscriptions(wallet_address)
  `)

  // Add fields to ascended_images_mint_queue if they don't exist
  await pool.query(`
    ALTER TABLE ascended_images_mint_queue 
    ADD COLUMN IF NOT EXISTS mint_status TEXT DEFAULT 'awaiting_mint',
    ADD COLUMN IF NOT EXISTS compressed_image_url TEXT,
    ADD COLUMN IF NOT EXISTS compressed_size_bytes INTEGER,
    ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT FALSE
  `)

  console.log('✅ Mint infrastructure initialized')
  markTableInitialized('mint_inscriptions')
}

export async function POST(request: NextRequest) {
  try {
    const pool = getPool()
    await ensureMintInfrastructure(pool)
    
    const { mintQueueId, imageUrl } = await request.json()
    
    if (!mintQueueId || !imageUrl) {
      return NextResponse.json({
        success: false,
        error: 'Missing mintQueueId or imageUrl'
      }, { status: 400 })
    }
    
    console.log(`🖼️ Compressing mint queue image ${mintQueueId}`)
    
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
    const blob = await put(`mint-compressed-${mintQueueId}.webp`, webpBuffer, {
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: true,
    })
    
    console.log(`✅ Uploaded to blob storage: ${blob.url}`)
    
    // Update the mint queue record with compressed data
    const updateResult = await pool.query(
      `UPDATE ascended_images_mint_queue
       SET compressed_image_url = $1,
           compressed_size_bytes = $2,
           is_compressed = true
       WHERE id = $3
       RETURNING id`,
      [blob.url, webpBuffer.length, mintQueueId]
    )
    
    if (updateResult.rowCount === 0) {
      throw new Error('Mint queue record not found')
    }
    
    console.log(`✅ Compressed and updated mint queue ${mintQueueId}`)
    
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

