import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export async function POST() {
  try {
    const pool = getPool()
    
    console.log('🔧 Adding compressed_size_bytes column...')
    
    await pool.query(`
      ALTER TABLE ascended_images_mint_queue 
      ADD COLUMN IF NOT EXISTS compressed_size_bytes INTEGER
    `)
    
    console.log('✅ Column added successfully')
    
    return NextResponse.json({
      success: true,
      message: 'compressed_size_bytes column added to ascended_images_mint_queue'
    })
    
  } catch (error) {
    console.error('❌ Failed to add column:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}



