import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export async function POST() {
  try {
    const pool = getPool()
    
    console.log('🔧 Ensuring all required columns exist...')
    
    // Add all columns to ascended_images_mint_queue
    await pool.query(`
      ALTER TABLE ascended_images_mint_queue 
      ADD COLUMN IF NOT EXISTS mint_status TEXT DEFAULT 'awaiting_mint',
      ADD COLUMN IF NOT EXISTS compressed_image_url TEXT,
      ADD COLUMN IF NOT EXISTS compressed_size_bytes INTEGER,
      ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT FALSE
    `)
    
    console.log('✅ All columns ensured in ascended_images_mint_queue')
    
    // Verify mint_inscriptions has all columns (it was recreated with fix-constraint)
    const mintInscriptionsCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'mint_inscriptions'
      AND column_name IN ('last_checked_at', 'completed_at')
    `)
    
    console.log(`✅ mint_inscriptions check: ${mintInscriptionsCheck.rows.length} critical columns found`)
    
    return NextResponse.json({
      success: true,
      message: 'All required columns verified/added',
      details: {
        ascendedImagesMintQueue: 'mint_status, compressed_image_url, compressed_size_bytes, is_compressed',
        mintInscriptions: mintInscriptionsCheck.rows.map(r => r.column_name).join(', ')
      }
    })
    
  } catch (error) {
    console.error('❌ Failed to ensure columns:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}









