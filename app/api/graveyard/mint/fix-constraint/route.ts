import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export async function POST() {
  try {
    const pool = getPool()
    
    console.log('🔧 Adding unique constraint to mint_inscriptions...')
    
    // Drop table and recreate with proper constraints
    await pool.query(`DROP TABLE IF EXISTS mint_inscriptions CASCADE`)
    
    console.log('✅ Dropped old mint_inscriptions table')
    
    // Recreate with unique constraint
    await pool.query(`
      CREATE TABLE mint_inscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mint_queue_id UUID REFERENCES ascended_images_mint_queue(id) ON DELETE CASCADE,
        wallet_address TEXT NOT NULL,
        payment_address TEXT,
        receiving_address TEXT,
        
        commit_tx_id TEXT,
        reveal_tx_id TEXT,
        inscription_id TEXT,
        
        commit_psbt_base64 TEXT,
        reveal_psbt_base64 TEXT,
        signed_commit_tx_hex TEXT,
        signed_reveal_tx_hex TEXT,
        
        fee_rate DECIMAL(10, 2) NOT NULL,
        commit_fee_sats INTEGER,
        reveal_fee_sats INTEGER,
        total_cost_sats INTEGER,
        
        original_image_url TEXT NOT NULL,
        compressed_image_url TEXT,
        compressed_base64 TEXT,
        is_compressed BOOLEAN DEFAULT FALSE,
        
        mint_status TEXT NOT NULL DEFAULT 'pending_compression',
        error_message TEXT,
        
        reveal_data JSONB,
        
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
    
    console.log('✅ Created mint_inscriptions table with unique constraint')
    
    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_wallet 
      ON mint_inscriptions(LOWER(wallet_address))
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_status 
      ON mint_inscriptions(mint_status)
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_commit_tx 
      ON mint_inscriptions(commit_tx_id)
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_reveal_tx 
      ON mint_inscriptions(reveal_tx_id)
    `)
    
    console.log('✅ Created indexes')
    
    return NextResponse.json({
      success: true,
      message: 'Unique constraint added to mint_inscriptions'
    })
    
  } catch (error) {
    console.error('❌ Failed to add constraint:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

