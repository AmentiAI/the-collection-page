"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/Toast'
import { Loader2, CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { getExcludedUtxos, addExcludedUtxos, clearExcludedUtxos } from '@/services/utxo-exclusion-service'

interface MintButtonProps {
  mintQueueId: string
  imageUrl: string
  compressedImageUrl?: string
  isCompressed: boolean
  existingMintInscription?: {
    id: string
    status: string
    commitTxId?: string
    revealTxId?: string
    inscriptionId?: string
  } | null
  onMintComplete?: () => void
  onMintStart?: () => void
}

type MintStatus = 
  | 'idle'
  | 'compressing'
  | 'creating_commit'
  | 'signing_commit'
  | 'broadcasting_commit'
  | 'waiting_commit_confirmation'
  | 'creating_reveal'
  | 'broadcasting_reveal'
  | 'waiting_reveal_confirmation'
  | 'completed'
  | 'failed'
  | 'reveal_failed' // Commit succeeded but reveal failed

export function MintButton({ 
  mintQueueId, 
  imageUrl, 
  compressedImageUrl,
  isCompressed,
  existingMintInscription,
  onMintComplete,
  onMintStart
}: MintButtonProps) {
  const { connected, address, paymentAddress, paymentPublicKey, publicKey, client } = useLaserEyes()
  const toast = useToast()
  
  const [feeRate, setFeeRate] = useState(0.20)
  const [status, setStatus] = useState<MintStatus>(() => {
    // Initialize status from existing mint inscription
    if (existingMintInscription) {
      if (existingMintInscription.status === 'completed') return 'completed'
      if (existingMintInscription.status === 'failed') return 'failed'
      if (existingMintInscription.status === 'reveal_broadcast') return 'waiting_reveal_confirmation'
      if (existingMintInscription.status === 'commit_broadcast') return 'waiting_commit_confirmation'
      // For commit_in_mempool, stay idle so user can manually trigger reveal
    }
    return 'idle'
  })
  const [mintInscriptionId, setMintInscriptionId] = useState<string | null>(existingMintInscription?.id || null)
  const [commitTxId, setCommitTxId] = useState<string | null>(existingMintInscription?.commitTxId || null)
  const [revealTxId, setRevealTxId] = useState<string | null>(existingMintInscription?.revealTxId || null)
  const [inscriptionId, setInscriptionId] = useState<string | null>(existingMintInscription?.inscriptionId || null)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [costBreakdown, setCostBreakdown] = useState<{
    commitTxFee: number
    revealTxFee: number
    toolFee: number
    totalCost: number
  } | null>(null)

  // Track which toasts have been shown to prevent duplicates
  const shownToastsRef = useRef<Set<string>>(new Set())

  // Helper to show toast only once per key
  const showToastOnce = useCallback((key: string, message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (shownToastsRef.current.has(key)) {
      return
    }
    shownToastsRef.current.add(key)
    if (type === 'success') {
      toast.success(message)
    } else if (type === 'error') {
      toast.error(message)
    } else {
      toast.info(message)
      }
  }, [toast])

  // Define createAndBroadcastReveal with useCallback to avoid recreating on every render
  const createAndBroadcastReveal = useCallback(async (mintId: string, commitTx: string, retryCount = 0) => {
    const MAX_RETRIES = 3
    const RETRY_DELAY_MS = 2000
    
    try {
      setStatus('creating_reveal')
      
      const revealResponse = await fetch('/api/graveyard/mint/create-reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintInscriptionId: mintId,
          commitTxId: commitTx,
          feeRate
        })
      })

      const revealData = await revealResponse.json()
      
      if (!revealData.success) {
        const errorMsg = revealData.error || 'Failed to create reveal transaction'
        
        // Check if error is due to commit not being found yet (race condition)
        const isRetryableError = errorMsg.toLowerCase().includes('not found') || 
                                 errorMsg.toLowerCase().includes('not available') ||
                                 errorMsg.toLowerCase().includes('not in mempool') ||
                                 errorMsg.toLowerCase().includes('bad-txns-inputs-missingorspent')
        
        if (isRetryableError && retryCount < MAX_RETRIES) {
          console.log(`⚠️ Reveal creation failed (attempt ${retryCount + 1}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
          return createAndBroadcastReveal(mintId, commitTx, retryCount + 1)
        }
        
        throw new Error(errorMsg)
      }

      console.log('✅ Reveal transaction created:', revealData.txId)
      
      // Broadcast reveal
      setStatus('broadcasting_reveal')
      
      const broadcastResponse = await fetch('/api/graveyard/mint/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintInscriptionId: mintId,
          txHex: revealData.signedTxHex,
          txType: 'reveal',
          feeRate
        })
      })

      const broadcastData = await broadcastResponse.json()
      
      if (!broadcastData.success) {
        const errorMsg = broadcastData.error || 'Failed to broadcast reveal transaction'
        
        // Check if error is retryable (same conditions as above)
        const isRetryableError = errorMsg.toLowerCase().includes('not found') || 
                                 errorMsg.toLowerCase().includes('not available') ||
                                 errorMsg.toLowerCase().includes('not in mempool') ||
                                 errorMsg.toLowerCase().includes('bad-txns-inputs-missingorspent')
        
        if (isRetryableError && retryCount < MAX_RETRIES) {
          console.log(`⚠️ Reveal broadcast failed (attempt ${retryCount + 1}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
          return createAndBroadcastReveal(mintId, commitTx, retryCount + 1)
        }
        
        throw new Error(errorMsg)
      }

      console.log('✅ Reveal transaction broadcast:', broadcastData.txId)
      setRevealTxId(broadcastData.txId)
      setInscriptionId(broadcastData.inscriptionId)
      
      // Wait for reveal confirmation
      setStatus('waiting_reveal_confirmation')
      showToastOnce(`reveal_broadcast_${mintId}`, 'Reveal broadcast! Waiting for confirmation...')
      
    } catch (error) {
      console.error('Reveal failed:', error)
      const errorMsg = error instanceof Error ? error.message : 'Reveal failed'
      setError(errorMsg)
      setStatus('reveal_failed') // Special status for reveal failure
      toast.error(`Reveal failed: ${errorMsg} - You can retry below`)
    }
  }, [feeRate, toast, showToastOnce])

  // Check status immediately on mount if waiting for commit or reveal
  useEffect(() => {
    console.log(`[MintButton] Mount check - mintInscriptionId: ${mintInscriptionId}, status: ${status}`)
    
    if (!mintInscriptionId) {
      console.log('[MintButton] No mintInscriptionId, skipping mount check')
      return
    }
    
    if (status !== 'waiting_commit_confirmation' && status !== 'waiting_reveal_confirmation') {
      console.log(`[MintButton] Status is ${status}, not waiting for confirmation, skipping mount check`)
      return
    }

    // Immediate check on mount
    const checkStatus = async () => {
      try {
        console.log(`🔍 [MintButton] Checking ${status === 'waiting_commit_confirmation' ? 'commit' : 'reveal'} status on mount for ${mintInscriptionId}...`)
        const response = await fetch('/api/graveyard/mint/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mintInscriptionId,
            pollForConfirmation: true
          })
        })

        const data = await response.json()
        console.log(`📊 [MintButton] Mount check response:`, data)
        
        if (data.success) {
          if (data.mint.status === 'commit_in_mempool' && status === 'waiting_commit_confirmation') {
            console.log('✅ Commit already in mempool on mount, waiting 2 seconds before broadcasting reveal...')
            setCommitTxId(data.mint.commitTxId)
            showToastOnce(`commit_confirmed_${mintInscriptionId}`, 'Commit confirmed! Broadcasting reveal transaction...')
            
            // Wait 2 seconds to ensure commit is fully indexed in mempool before revealing
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            await createAndBroadcastReveal(mintInscriptionId, data.mint.commitTxId)
          } else if (data.mint.status === 'completed' && status === 'waiting_reveal_confirmation') {
            console.log('✅ Reveal already confirmed on mount!')
            setStatus('completed')
            setInscriptionId(data.mint.inscriptionId)
            if (paymentAddress) {
              clearExcludedUtxos(paymentAddress)
            }
            showToastOnce(`mint_completed_${mintInscriptionId}`, `Mint completed! Inscription ID: ${data.mint.inscriptionId}`)
            onMintComplete?.()
          }
        }
      } catch (error) {
        console.error('[MintButton] Error checking status on mount:', error)
      }
    }

    checkStatus()
  }, [mintInscriptionId, status, createAndBroadcastReveal, paymentAddress, showToastOnce, onMintComplete, existingMintInscription])

  // Sync status when existingMintInscription changes
  useEffect(() => {
    console.log(`[MintButton] Sync check - existingMintInscription:`, existingMintInscription?.status, `current status:`, status)
    
    if (existingMintInscription) {
      if (existingMintInscription.status === 'completed' && status !== 'completed') {
        console.log('[MintButton] Updating status to completed from existingMintInscription')
        setStatus('completed')
        setInscriptionId(existingMintInscription.inscriptionId || null)
      } else if (existingMintInscription.status === 'reveal_broadcast' && status !== 'waiting_reveal_confirmation') {
        console.log('[MintButton] Updating status to waiting_reveal_confirmation from existingMintInscription')
        setStatus('waiting_reveal_confirmation')
      } else if (existingMintInscription.status === 'commit_broadcast' && status !== 'waiting_commit_confirmation') {
        console.log('[MintButton] Updating status to waiting_commit_confirmation from existingMintInscription')
        setStatus('waiting_commit_confirmation')
      }
      
      // Update IDs if they changed
      if (existingMintInscription.id && existingMintInscription.id !== mintInscriptionId) {
        console.log(`[MintButton] Updating mintInscriptionId: ${mintInscriptionId} -> ${existingMintInscription.id}`)
        setMintInscriptionId(existingMintInscription.id)
      }
      if (existingMintInscription.commitTxId && existingMintInscription.commitTxId !== commitTxId) {
        setCommitTxId(existingMintInscription.commitTxId)
      }
      if (existingMintInscription.revealTxId && existingMintInscription.revealTxId !== revealTxId) {
        setRevealTxId(existingMintInscription.revealTxId)
      }
      if (existingMintInscription.inscriptionId && existingMintInscription.inscriptionId !== inscriptionId) {
        setInscriptionId(existingMintInscription.inscriptionId)
      }
    }
  }, [existingMintInscription, status, mintInscriptionId, commitTxId, revealTxId, inscriptionId])

  // Poll for confirmations when waiting
  useEffect(() => {
    if (!mintInscriptionId || 
        (status !== 'waiting_commit_confirmation' && status !== 'waiting_reveal_confirmation')) {
      return
    }

    console.log(`🔄 Starting status polling for mint ${mintInscriptionId}, status: ${status}`)

    const pollInterval = setInterval(async () => {
      try {
        console.log(`🔍 Polling status for mint ${mintInscriptionId}...`)
        const response = await fetch('/api/graveyard/mint/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mintInscriptionId,
            pollForConfirmation: true
          })
        })

        const data = await response.json()
        
        if (data.success) {
          console.log(`📊 Status check result: ${data.mint.status}, changed: ${data.statusChanged}`)
          
          if (data.statusChanged) {
            console.log(`✅ Status changed to: ${data.mint.status}`)
            
            if (data.mint.status === 'commit_in_mempool' && status === 'waiting_commit_confirmation') {
              // Commit found in mempool, wait a moment for it to be fully indexed before broadcasting reveal
              console.log('✅ Commit in mempool, waiting 2 seconds before broadcasting reveal...')
              setCommitTxId(data.mint.commitTxId)
              clearInterval(pollInterval)
              showToastOnce(`commit_confirmed_${mintInscriptionId}`, 'Commit confirmed! Broadcasting reveal transaction...')
              
              // Wait 2 seconds to ensure commit is fully indexed in mempool before revealing
              await new Promise(resolve => setTimeout(resolve, 2000))
              
              // Automatically broadcast reveal
              await createAndBroadcastReveal(mintInscriptionId, data.mint.commitTxId)
            } else if (data.mint.status === 'completed' && status === 'waiting_reveal_confirmation') {
              // Mint completed! Clear excluded UTXOs
              console.log('🎉 Mint completed!')
              setStatus('completed')
              setInscriptionId(data.mint.inscriptionId)
              clearInterval(pollInterval)
              
              // Clear UTXO exclusions since transaction is confirmed
              if (paymentAddress) {
                clearExcludedUtxos(paymentAddress)
                console.log('🧹 Cleared UTXO exclusions (mint completed)')
              }
              
              showToastOnce(`mint_completed_${mintInscriptionId}`, `Mint completed! Inscription ID: ${data.mint.inscriptionId}`)
              onMintComplete?.()
            }
          } else if (data.mint.status === 'completed') {
            // Status already completed but our local state wasn't updated
            console.log('🎉 Mint already completed, updating local state')
            setStatus('completed')
            setInscriptionId(data.mint.inscriptionId)
            clearInterval(pollInterval)
            if (paymentAddress) {
              clearExcludedUtxos(paymentAddress)
            }
            showToastOnce(`mint_completed_${mintInscriptionId}`, `Mint completed! Inscription ID: ${data.mint.inscriptionId}`)
            onMintComplete?.()
          }
        }
      } catch (error) {
        console.error('Error polling status:', error)
      }
    }, 10000) // Poll every 10 seconds

    return () => {
      console.log(`🛑 Stopping status polling for mint ${mintInscriptionId}`)
      clearInterval(pollInterval)
    }
  }, [mintInscriptionId, status, createAndBroadcastReveal, paymentAddress, showToastOnce, onMintComplete])

  const compressImage = async () => {
    setStatus('compressing')
    
    try {
      const response = await fetch('/api/graveyard/mint/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintQueueId,
          imageUrl
        })
      })

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Compression failed')
      }

      return {
        compressedUrl: data.compressed_url,
        compressedBase64: data.compressed_base64
      }
    } catch (error) {
      console.error('Compression failed:', error)
      throw new Error(`Compression failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const startMint = async () => {
    if (!connected || !client || !address) {
      toast.error('Wallet not connected. Please connect your wallet first')
      return
    }

    // Check if commit is already in mempool - if so, just broadcast reveal
    if (existingMintInscription?.status === 'commit_in_mempool' && 
        existingMintInscription.commitTxId && 
        existingMintInscription.id) {
      console.log('🚀 Commit already in mempool, broadcasting reveal directly')
      toast.info('Broadcasting reveal transaction. Commit already confirmed in mempool')
      await createAndBroadcastReveal(existingMintInscription.id, existingMintInscription.commitTxId)
      return
    }

    if (feeRate < 0.1 || feeRate > 1000) {
      toast.error('Invalid fee rate. Fee rate must be between 0.1 and 1000 sat/vB')
      return
    }

    setError(null)
    onMintStart?.()

    try {
      // Step 1: Compress image if not already compressed
      let compressedBase64: string
      
      if (isCompressed && compressedImageUrl) {
        // Fetch and convert to base64
        setStatus('compressing')
        const response = await fetch(compressedImageUrl)
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        compressedBase64 = buffer.toString('base64')
      } else {
        // Compress the image
        const compressionResult = await compressImage()
        compressedBase64 = compressionResult.compressedBase64
      }

      console.log('✅ Image ready for inscription')

      // Step 2: Create commit PSBT (with excluded UTXOs from pending txs)
      setStatus('creating_commit')
      
      const excludedUtxos = getExcludedUtxos(paymentAddress || address)
      if (excludedUtxos.length > 0) {
        console.log(`🚫 Excluding ${excludedUtxos.length} UTXOs from pending transactions`)
      }
      
      const commitResponse = await fetch('/api/graveyard/mint/create-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintQueueId,
          compressedBase64,
          userAddress: address,
          paymentAddress: paymentAddress || address,
          paymentPubkey: paymentPublicKey,
          taprootPubkey: publicKey,
          feeRate,
          excludedUtxos: excludedUtxos.length > 0 ? excludedUtxos : undefined
        })
      })

      const commitData = await commitResponse.json()
      
      if (!commitData.success) {
        throw new Error(commitData.error || 'Failed to create commit transaction')
      }

      console.log('✅ Commit PSBT created')
      setMintInscriptionId(commitData.mintInscriptionId)
      
      // Store cost breakdown for display
      if (commitData.fees) {
        setCostBreakdown({
          commitTxFee: commitData.fees.commitTxFee,
          revealTxFee: commitData.fees.revealTxFee,
          toolFee: commitData.fees.toolFee || 0,
          totalCost: commitData.fees.totalCost
        })
        console.log('💰 Cost breakdown:', {
          commit: `${commitData.fees.commitTxFee} sats`,
          reveal: `${commitData.fees.revealTxFee} sats`,
          ascension: `${commitData.fees.toolFee || 0} sats`,
          total: `${commitData.fees.totalCost} sats (~${(commitData.fees.totalCost / 100000000).toFixed(8)} BTC)`
        })
      }
      
      // Add used UTXOs to exclusion list to prevent reuse in concurrent transactions
      if (commitData.usedUtxos && commitData.usedUtxos.length > 0) {
        addExcludedUtxos(paymentAddress || address, commitData.usedUtxos)
        console.log(`🚫 Added ${commitData.usedUtxos.length} UTXOs to exclusion list`)
      }

      // Step 3: Sign commit PSBT with wallet
      setStatus('signing_commit')
      
      const shouldAutoBroadcast = feeRate >= 1
      const walletResult = await client.signPsbt(commitData.commitPsbt, true, shouldAutoBroadcast)
      
      let txId: string
      
      if (typeof walletResult === 'string' && walletResult.length > 0) {
        // Wallet already broadcast
        txId = walletResult
        console.log('✅ Wallet broadcast commit tx:', txId)
        
        // CRITICAL: Update database even when wallet auto-broadcasts
        try {
          const updateResponse = await fetch('/api/graveyard/mint/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mintInscriptionId: commitData.mintInscriptionId,
              txType: 'commit',
              feeRate,
              txId: txId // Wallet already broadcast, just update DB
            })
          })
          
          const updateData = await updateResponse.json()
          if (!updateData.success) {
            console.warn('⚠️ Failed to update DB after wallet auto-broadcast:', updateData.error)
            // Don't throw - transaction is already broadcast, just DB update failed
          } else {
            console.log('✅ Updated database record after wallet auto-broadcast')
          }
        } catch (updateError) {
          console.error('⚠️ Error updating DB after wallet auto-broadcast:', updateError)
          // Don't throw - transaction is already broadcast, just DB update failed
        }
      } else if (walletResult && typeof walletResult === 'object' && 'txId' in walletResult && walletResult.txId) {
        // Wallet returned txId
        txId = walletResult.txId
        console.log('✅ Wallet broadcast commit tx:', txId)
        
        // CRITICAL: Update database even when wallet auto-broadcasts
        try {
          const updateResponse = await fetch('/api/graveyard/mint/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mintInscriptionId: commitData.mintInscriptionId,
              txType: 'commit',
              feeRate,
              txId: txId // Wallet already broadcast, just update DB
            })
          })
          
          const updateData = await updateResponse.json()
          if (!updateData.success) {
            console.warn('⚠️ Failed to update DB after wallet auto-broadcast:', updateData.error)
            // Don't throw - transaction is already broadcast, just DB update failed
          } else {
            console.log('✅ Updated database record after wallet auto-broadcast')
          }
        } catch (updateError) {
          console.error('⚠️ Error updating DB after wallet auto-broadcast:', updateError)
          // Don't throw - transaction is already broadcast, just DB update failed
        }
      } else {
        // Extract and broadcast manually
        setStatus('broadcasting_commit')
        
        const bitcoin = require('bitcoinjs-lib')
        const eccModule = await import('@bitcoinerlab/secp256k1')
        if (typeof bitcoin.initEccLib === 'function') {
          try {
            bitcoin.initEccLib((eccModule as any).default ?? eccModule)
          } catch (eccError) {
            console.warn('Failed to initialize ECC library', eccError)
          }
        }
        
        let psbtBase64: string
        
        if (typeof walletResult === 'object' && 'signedPsbtBase64' in walletResult) {
          psbtBase64 = walletResult.signedPsbtBase64
        } else if (typeof walletResult === 'object' && 'signedPsbtHex' in walletResult) {
          psbtBase64 = Buffer.from(walletResult.signedPsbtHex, 'hex').toString('base64')
        } else {
          psbtBase64 = walletResult
        }
        
        // Check if PSBT needs finalization (for wallets like Magic Eden)
        const psbt = bitcoin.Psbt.fromBase64(psbtBase64)
        const requiresFinalization = psbt.data.inputs.some(
          (input: any) => !input.finalScriptSig && !input.finalScriptWitness
        )
        
        if (requiresFinalization) {
          console.log('🔧 PSBT requires finalization (Magic Eden/similar wallet), calling finalize API...')
          try {
            const finalizeResponse = await fetch('/api/finalize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ txBase64: psbtBase64 })
            })
            
            const finalizeData = await finalizeResponse.json()
            
            if (!finalizeResponse.ok || !finalizeData.complete) {
              throw new Error('Finalization failed')
            }
            
            // Use finalized hex from Sandshrew
            const txHex = finalizeData.hex
            console.log('✅ PSBT finalized successfully')
            
            // Broadcast finalized transaction
            const broadcastResponse = await fetch('/api/graveyard/mint/broadcast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mintInscriptionId: commitData.mintInscriptionId,
                txHex,
                txType: 'commit',
                feeRate
              })
            })

            const broadcastData = await broadcastResponse.json()
            
            if (!broadcastData.success) {
              throw new Error(broadcastData.error || 'Failed to broadcast commit transaction')
            }

            txId = broadcastData.txId
            console.log('✅ Commit transaction broadcast:', txId)
          } catch (finalizeError) {
            console.error('Finalization failed:', finalizeError)
            throw new Error(`Finalization failed: ${finalizeError instanceof Error ? finalizeError.message : 'Unknown error'}`)
          }
        } else {
          // Already finalized, extract and broadcast
          console.log('✅ PSBT already finalized by wallet')
          const txHex = psbt.extractTransaction().toHex()
          
          // Broadcast commit
          const broadcastResponse = await fetch('/api/graveyard/mint/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mintInscriptionId: commitData.mintInscriptionId,
              txHex,
              txType: 'commit',
              feeRate
            })
          })

          const broadcastData = await broadcastResponse.json()
          
          if (!broadcastData.success) {
            throw new Error(broadcastData.error || 'Failed to broadcast commit transaction')
          }

          txId = broadcastData.txId
          console.log('✅ Commit transaction broadcast:', txId)
        }
      }

      setCommitTxId(txId)
      setStatus('waiting_commit_confirmation')
      showToastOnce(`commit_broadcast_${commitData.mintInscriptionId}`, 'Commit broadcast! Waiting for confirmation before reveal...')

     } catch (error) {
       console.error('Mint failed:', error)
       const errorMsg = error instanceof Error ? error.message : 'Mint failed'
       setError(errorMsg)
       setStatus('failed')
       toast.error(`Mint failed: ${errorMsg}`)
       
       // Clear UTXO exclusions on failure so UTXOs can be reused
       if (paymentAddress) {
         clearExcludedUtxos(paymentAddress)
         console.log('🧹 Cleared UTXO exclusions (mint failed)')
       }
     }
  }

  const getStatusText = () => {
    // If commit is in mempool and we're idle, show "Broadcast Reveal"
    if (status === 'idle' && existingMintInscription?.status === 'commit_in_mempool') {
      return 'Broadcast Reveal'
    }
    
    switch (status) {
      case 'idle': return 'Mint'
      case 'compressing': return 'Compressing image...'
      case 'creating_commit': return 'Creating commit...'
      case 'signing_commit': return 'Sign in wallet...'
      case 'broadcasting_commit': return 'Broadcasting commit...'
      case 'waiting_commit_confirmation': return 'Awaiting commit confirmation...'
      case 'creating_reveal': return 'Creating reveal...'
      case 'broadcasting_reveal': return 'Broadcasting reveal...'
      case 'waiting_reveal_confirmation': return 'Awaiting reveal confirmation...'
      case 'completed': return 'Completed!'
      case 'failed': return 'Failed'
      case 'reveal_failed': return 'Reveal Failed (Retry Below)'
      default: return 'Mint'
    }
  }

  const isProcessing = status !== 'idle' && status !== 'completed' && status !== 'failed' && status !== 'reveal_failed'

  return (
    <div className="flex flex-col gap-2">
      {/* Fee Rate Input - Hide when completed */}
      {status !== 'completed' && (
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-yellow-400" />
        <Input
          type="number"
          value={feeRate}
          onChange={(e) => setFeeRate(parseFloat(e.target.value) || 0)}
          min="0.1"
          max="1000"
          step="0.01"
            disabled={isProcessing}
          className="w-24 h-8 text-sm"
          placeholder="sat/vB"
        />
        <span className="text-xs text-gray-400">sat/vB</span>
      </div>
      )}

      {/* Cost Breakdown Display */}
      {costBreakdown && (
        <div className="text-xs space-y-1 p-2 bg-gray-800/50 rounded border border-gray-700">
          <div className="font-semibold text-gray-300 mb-1">Cost Breakdown:</div>
          <div className="flex justify-between text-gray-400">
            <span>Commit Fee:</span>
            <span className="text-blue-400">{costBreakdown.commitTxFee.toLocaleString()} sats</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Reveal Fee:</span>
            <span className="text-green-400">{costBreakdown.revealTxFee.toLocaleString()} sats</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Ascension Cost:</span>
            <span className="text-purple-400">{costBreakdown.toolFee.toLocaleString()} sats</span>
          </div>
          <div className="flex justify-between font-semibold text-gray-200 pt-1 border-t border-gray-700">
            <span>Total Cost:</span>
            <span className="text-yellow-400">{costBreakdown.totalCost.toLocaleString()} sats</span>
          </div>
          <div className="text-right text-gray-500 text-[10px]">
            ≈ {(costBreakdown.totalCost / 100000000).toFixed(8)} BTC
          </div>
        </div>
      )}

      {/* Mint Button */}
      <Button
        onClick={startMint}
        disabled={!connected || isProcessing || status === 'completed' || status === 'reveal_failed'}
        className="w-full"
        variant={status === 'completed' ? 'default' : (status === 'failed' || status === 'reveal_failed') ? 'outline' : 'default'}
      >
        {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {status === 'completed' && <CheckCircle2 className="mr-2 h-4 w-4" />}
        {(status === 'failed' || status === 'reveal_failed') && <AlertCircle className="mr-2 h-4 w-4" />}
        {getStatusText()}
      </Button>
      
      {/* Retry Reveal Button (shown when commit succeeded but reveal failed) */}
      {status === 'reveal_failed' && commitTxId && mintInscriptionId && (
        <Button
          onClick={() => createAndBroadcastReveal(mintInscriptionId, commitTxId)}
          disabled={isProcessing}
          className="w-full"
          variant="outline"
        >
          {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Retry Reveal Transaction
        </Button>
      )}

      {/* Status Details */}
      {(commitTxId || revealTxId || inscriptionId || error) && (
        <div className="text-xs space-y-1 mt-1">
          {commitTxId && (
            <div className="text-blue-400">
              Commit: <a href={`https://mempool.space/tx/${commitTxId}`} target="_blank" rel="noopener noreferrer" className="underline">
                {commitTxId.substring(0, 8)}...
              </a>
            </div>
          )}
          {revealTxId && (
            <div className="text-green-400">
              Reveal: <a href={`https://mempool.space/tx/${revealTxId}`} target="_blank" rel="noopener noreferrer" className="underline">
                {revealTxId.substring(0, 8)}...
              </a>
            </div>
          )}
          {inscriptionId && status === 'completed' && (
            <div className="text-emerald-400">
              Inscription: <a href={`https://ordinals.com/inscription/${inscriptionId}`} target="_blank" rel="noopener noreferrer" className="underline">
                {inscriptionId.substring(0, 12)}...
              </a>
            </div>
          )}
          {error && (
            <div className="text-red-400">
              Error: {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

