import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Get mint queue records for a wallet with their mint status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')
    
    if (!walletAddress) {
      return NextResponse.json({
        success: false,
        error: 'Wallet address required'
      }, { status: 400 })
    }

    const pool = getPool()
    
    // Fetch mint queue records with their mint inscription status
    const result = await pool.query(
      `SELECT 
        mq.id,
        mq.wallet_address,
        mq.image_url,
        mq.image_blob_url,
        mq.compressed_image_url,
        mq.compressed_size_bytes,
        mq.is_compressed,
        mq.source_inscription_id,
        mq.generation_prompt,
        mq.created_at,
        mq.mint_status as queue_mint_status,
        mi.id as mint_inscription_id,
        mi.mint_status as inscription_mint_status,
        mi.commit_tx_id,
        mi.reveal_tx_id,
        mi.inscription_id,
        mi.fee_rate,
        mi.total_cost_sats,
        mi.error_message,
        mi.created_at as mint_created_at,
        mi.completed_at as mint_completed_at
       FROM ascended_images_mint_queue mq
       LEFT JOIN mint_inscriptions mi ON mi.mint_queue_id = mq.id
       WHERE LOWER(mq.wallet_address) = LOWER($1)
       ORDER BY mq.created_at DESC`,
      [walletAddress]
    )

    // Parse generation_prompt to extract silver and glow flags
    const records = result.rows.map(row => {
      const prompt = row.generation_prompt || ''
      const hasSilver = prompt.toLowerCase().includes('silver plated')
      const hasGlow = prompt.toLowerCase().includes('holy light')
      
      return {
        id: row.id,
        walletAddress: row.wallet_address,
        imageBlobUrl: row.image_blob_url,
        compressedImageUrl: row.compressed_image_url,
        compressedSizeBytes: row.compressed_size_bytes,
        isCompressed: row.is_compressed || false,
        sourceInscriptionId: row.source_inscription_id,
        hasSilver,
        hasGlow,
        createdAt: row.created_at,
        queueMintStatus: row.queue_mint_status || 'awaiting_mint',
        
        // Mint inscription data (if exists)
        mintInscription: row.mint_inscription_id ? {
          id: row.mint_inscription_id,
          status: row.inscription_mint_status,
          commitTxId: row.commit_tx_id,
          revealTxId: row.reveal_tx_id,
          inscriptionId: row.inscription_id,
          feeRate: row.fee_rate ? parseFloat(row.fee_rate) : null,
          totalCostSats: row.total_cost_sats,
          errorMessage: row.error_message,
          createdAt: row.mint_created_at,
          completedAt: row.mint_completed_at
        } : null
      }
    })

    return NextResponse.json({
      success: true,
      records,
      total: records.length
    })

  } catch (error) {
    console.error('[graveyard/mint-queue][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch mint queue' },
      { status: 500 }
    )
  }
}

