import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Initialize the mint tracking tables for graveyard awaited mints
 * Run this once to set up the schema
 */
export async function POST() {
  try {
    const pool = getPool()
    
    console.log('🔧 Creating mint_inscriptions table...')
    
    // Create main mint tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mint_inscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mint_queue_id UUID NOT NULL REFERENCES ascended_images_mint_queue(id) ON DELETE CASCADE,
        wallet_address TEXT NOT NULL,
        payment_address TEXT,
        receiving_address TEXT NOT NULL,
        
        -- Transaction tracking
        commit_tx_id TEXT,
        reveal_tx_id TEXT,
        inscription_id TEXT,
        
        -- Image data
        original_image_url TEXT NOT NULL,
        compressed_image_url TEXT,
        compressed_base64 TEXT,
        is_compressed BOOLEAN DEFAULT FALSE,
        
        -- Fee and gas tracking
        fee_rate DECIMAL NOT NULL,
        commit_fee_sats INTEGER,
        reveal_fee_sats INTEGER,
        total_cost_sats INTEGER,
        
        -- Status tracking
        mint_status TEXT NOT NULL DEFAULT 'pending',
        -- pending: Created, waiting for commit
        -- commit_signed: Commit signed, waiting for broadcast
        -- commit_broadcast: Commit broadcast, waiting for confirmation
        -- commit_confirmed: Commit confirmed, creating reveal
        -- reveal_broadcast: Reveal broadcast, waiting for confirmation
        -- completed: Inscription complete and confirmed
        -- failed: Failed at some step
        
        error_message TEXT,
        
        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT NOW(),
        commit_broadcast_at TIMESTAMPTZ,
        commit_confirmed_at TIMESTAMPTZ,
        reveal_broadcast_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        last_checked_at TIMESTAMPTZ,
        
        -- Reveal data (stored for creating reveal tx)
        reveal_data JSONB,
        
        UNIQUE(mint_queue_id)
      )
    `)
    
    // Create indexes for faster queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_wallet ON mint_inscriptions(LOWER(wallet_address))
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_status ON mint_inscriptions(mint_status)
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_commit_tx ON mint_inscriptions(commit_tx_id)
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_reveal_tx ON mint_inscriptions(reveal_tx_id)
    `)
    
    // Add fields to ascended_images_mint_queue if they don't exist
    console.log('🔧 Updating ascended_images_mint_queue table...')
    await pool.query(`
      ALTER TABLE ascended_images_mint_queue 
      ADD COLUMN IF NOT EXISTS mint_status TEXT DEFAULT 'awaiting_mint',
      ADD COLUMN IF NOT EXISTS compressed_image_url TEXT,
      ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT FALSE
    `)
    
    console.log('✅ Mint schema initialized successfully!')
    
    return NextResponse.json({
      success: true,
      message: 'Mint schema initialized'
    })
    
  } catch (error) {
    console.error('❌ Failed to initialize mint schema:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}









