import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')?.trim()

    if (!walletAddress) {
      return NextResponse.json({
        success: false,
        error: 'Wallet address is required',
      }, { status: 400 })
    }

    const pool = getPool()

    // Fetch ALL graveyard entries (including hidden ones)
    const graveyardResult = await pool.query(
      `
        SELECT 
          inscription_id,
          tx_id,
          status,
          source,
          ascension_powder,
          image_blob_url,
          hidden,
          generation_prompt,
          created_at,
          confirmed_at,
          updated_at
        FROM abyss_burns
        WHERE LOWER(ordinal_wallet) = LOWER($1)
        ORDER BY created_at DESC
      `,
      [walletAddress]
    )

    // Fetch ALL mint queue items (awaiting mint)
    const mintQueueResult = await pool.query(
      `
        SELECT 
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
          mi.id as mint_inscription_id,
          mi.mint_status,
          mi.commit_tx_id,
          mi.reveal_tx_id,
          mi.inscription_id as minted_inscription_id,
          mi.completed_at as mint_completed_at,
          mi.error_message
        FROM ascended_images_mint_queue mq
        LEFT JOIN mint_inscriptions mi ON mi.mint_queue_id = mq.id
        WHERE LOWER(mq.wallet_address) = LOWER($1)
        ORDER BY mq.created_at DESC
      `,
      [walletAddress]
    )

    // Fetch profile info
    const profileResult = await pool.query(
      `
        SELECT 
          username,
          avatar_url,
          ascension_powder,
          wallet_address
        FROM profiles
        WHERE LOWER(wallet_address) = LOWER($1)
        LIMIT 1
      `,
      [walletAddress]
    )

    const profile = profileResult.rows[0] || null

    // Format graveyard entries
    const graveyard = graveyardResult.rows.map((row) => ({
      inscriptionId: row.inscription_id,
      txId: row.tx_id,
      status: row.status,
      source: row.source,
      ascensionPowder: Number(row.ascension_powder) || 0,
      imageBlobUrl: row.image_blob_url,
      hidden: row.hidden === true,
      generationPrompt: row.generation_prompt,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      updatedAt: row.updated_at,
    }))

    // Format mint queue items
    const mintQueue = mintQueueResult.rows.map((row) => ({
      id: row.id,
      imageUrl: row.image_url,
      imageBlobUrl: row.image_blob_url,
      compressedImageUrl: row.compressed_image_url,
      compressedSizeBytes: row.compressed_size_bytes,
      isCompressed: row.is_compressed === true,
      sourceInscriptionId: row.source_inscription_id,
      generationPrompt: row.generation_prompt,
      createdAt: row.created_at,
      mintStatus: row.mint_status,
      mintInscriptionId: row.mint_inscription_id,
      commitTxId: row.commit_tx_id,
      revealTxId: row.reveal_tx_id,
      mintedInscriptionId: row.minted_inscription_id,
      mintCompletedAt: row.mint_completed_at,
      errorMessage: row.error_message,
      isMinted: row.minted_inscription_id !== null,
    }))

    // Separate minted vs awaiting
    const minted = mintQueue.filter(item => item.isMinted)
    const awaitingMint = mintQueue.filter(item => !item.isMinted)

    return NextResponse.json({
      success: true,
      walletAddress,
      profile,
      graveyard: {
        total: graveyard.length,
        visible: graveyard.filter(g => !g.hidden).length,
        hidden: graveyard.filter(g => g.hidden).length,
        entries: graveyard,
      },
      mintQueue: {
        total: mintQueue.length,
        minted: minted.length,
        awaiting: awaitingMint.length,
        mintedItems: minted,
        awaitingItems: awaitingMint,
      },
    })
  } catch (error) {
    console.error('[sadmin/graveyard][GET]', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch graveyard data',
      },
      { status: 500 }
    )
  }
}

