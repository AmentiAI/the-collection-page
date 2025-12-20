"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/Toast'
import { Loader2, CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { getExcludedUtxos, addExcludedUtxos, clearExcludedUtxos } from '@/services/utxo-exclusion-service'

interface MegaMonsterMintButtonProps {
  megaMonsterId: string
  imageUrl: string
  compressedImageUrl?: string
  isCompressed: boolean
  existingMint?: {
    commitTxId?: string
    revealTxId?: string
    inscriptionId?: string
    status?: string
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
  | 'reveal_failed'

export function MegaMonsterMintButton({ 
  megaMonsterId, 
  imageUrl, 
  compressedImageUrl,
  isCompressed,
  existingMint,
  onMintComplete,
  onMintStart
}: MegaMonsterMintButtonProps) {
  const { connected, address, paymentAddress, paymentPublicKey, publicKey, client } = useLaserEyes()
  const toast = useToast()
  
  const [feeRate, setFeeRate] = useState(0.20)
  const [status, setStatus] = useState<MintStatus>(() => {
    if (existingMint) {
      if (existingMint.status === 'completed' || existingMint.inscriptionId) return 'completed'
      if (existingMint.status === 'reveal_broadcast') return 'waiting_reveal_confirmation'
      if (existingMint.status === 'commit_broadcast' || existingMint.commitTxId) return 'waiting_commit_confirmation'
    }
    return 'idle'
  })
  const [commitTxId, setCommitTxId] = useState<string | null>(existingMint?.commitTxId || null)
  const [revealTxId, setRevealTxId] = useState<string | null>(existingMint?.revealTxId || null)
  const [inscriptionId, setInscriptionId] = useState<string | null>(existingMint?.inscriptionId || null)
  const [error, setError] = useState<string | null>(null)
  const [costBreakdown, setCostBreakdown] = useState<{
    commitTxFee: number
    revealTxFee: number
    toolFee: number
    totalCost: number
  } | null>(null)
  const [revealData, setRevealData] = useState<any>(null)

  const shownToastsRef = useRef<Set<string>>(new Set())

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

  const createAndBroadcastReveal = useCallback(async (megaMonsterId: string, commitTx: string, storedRevealData: any, retryCount = 0) => {
    const MAX_RETRIES = 3
    const RETRY_DELAY_MS = 2000
    
    try {
      setStatus('creating_reveal')
      
      const revealResponse = await fetch('/api/admin/megamonsters/mint/create-reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          megaMonsterId,
          commitTxId: commitTx,
          feeRate,
          revealData: storedRevealData // Optional - API will fetch from DB if not provided
        })
      })

      const revealData = await revealResponse.json()
      
      if (!revealData.success) {
        const errorMsg = revealData.error || 'Failed to create reveal transaction'
        
        const isRetryableError = errorMsg.toLowerCase().includes('not found') || 
                                 errorMsg.toLowerCase().includes('not available') ||
                                 errorMsg.toLowerCase().includes('not in mempool') ||
                                 errorMsg.toLowerCase().includes('bad-txns-inputs-missingorspent')
        
        if (isRetryableError && retryCount < MAX_RETRIES) {
          console.log(`⚠️ Reveal creation failed (attempt ${retryCount + 1}/${MAX_RETRIES}), retrying...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
          return createAndBroadcastReveal(megaMonsterId, commitTx, storedRevealData, retryCount + 1)
        }
        
        throw new Error(errorMsg)
      }

      console.log('✅ Reveal transaction created:', revealData.txId)
      
      setStatus('broadcasting_reveal')
      
      const broadcastResponse = await fetch('/api/admin/megamonsters/mint/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          megaMonsterId,
          txHex: revealData.signedTxHex,
          txType: 'reveal',
          feeRate
        })
      })

      const broadcastData = await broadcastResponse.json()
      
      if (!broadcastData.success) {
        const errorMsg = broadcastData.error || 'Failed to broadcast reveal transaction'
        
        const isRetryableError = errorMsg.toLowerCase().includes('not found') || 
                                 errorMsg.toLowerCase().includes('not available') ||
                                 errorMsg.toLowerCase().includes('not in mempool') ||
                                 errorMsg.toLowerCase().includes('bad-txns-inputs-missingorspent')
        
        if (isRetryableError && retryCount < MAX_RETRIES) {
          console.log(`⚠️ Reveal broadcast failed (attempt ${retryCount + 1}/${MAX_RETRIES}), retrying...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
          return createAndBroadcastReveal(megaMonsterId, commitTx, storedRevealData, retryCount + 1)
        }
        
        throw new Error(errorMsg)
      }

      console.log('✅ Reveal transaction broadcast:', broadcastData.txId)
      setRevealTxId(broadcastData.txId)
      setInscriptionId(broadcastData.inscriptionId)
      
      setStatus('waiting_reveal_confirmation')
      showToastOnce(`reveal_broadcast_${megaMonsterId}`, 'Reveal broadcast! Waiting for confirmation...')
      
    } catch (error) {
      console.error('Reveal failed:', error)
      const errorMsg = error instanceof Error ? error.message : 'Reveal failed'
      setError(errorMsg)
      setStatus('reveal_failed')
      toast.error(`Reveal failed: ${errorMsg} - You can retry below`)
    }
  }, [feeRate, toast, showToastOnce])

  // Fetch reveal data from DB if we have commit but no reveal data in state
  useEffect(() => {
    if (commitTxId && !revealData && !revealTxId) {
      // Try to fetch reveal data from API (it's stored in DB)
      // We'll let create-reveal fetch it, but we can also fetch it here if needed
      // For now, we'll just proceed - create-reveal will fetch from DB
    }
  }, [commitTxId, revealData, revealTxId])

  // Check status on mount if waiting
  useEffect(() => {
    if (!commitTxId && !revealTxId) {
      return
    }
    
    if (status !== 'waiting_commit_confirmation' && status !== 'waiting_reveal_confirmation') {
      return
    }

    const checkStatus = async () => {
      try {
        const response = await fetch('/api/admin/megamonsters/mint/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            megaMonsterId,
            commitTxId,
            revealTxId,
            pollForConfirmation: true
          })
        })

        const data = await response.json()
        
        if (data.success) {
          if (data.mint.status === 'commit_in_mempool' && status === 'waiting_commit_confirmation') {
            console.log('✅ Commit in mempool, waiting 2 seconds before broadcasting reveal...')
            setCommitTxId(data.mint.commitTxId)
            showToastOnce(`commit_confirmed_${megaMonsterId}`, 'Commit confirmed! Broadcasting reveal transaction...')
            
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            // Reveal data will be fetched from DB by create-reveal endpoint if not in state
            await createAndBroadcastReveal(megaMonsterId, data.mint.commitTxId, revealData || null)
          } else if (data.mint.status === 'completed' && status === 'waiting_reveal_confirmation') {
            console.log('✅ Reveal already confirmed!')
            setStatus('completed')
            setInscriptionId(data.mint.inscriptionId)
            if (paymentAddress) {
              clearExcludedUtxos(paymentAddress)
            }
            showToastOnce(`mint_completed_${megaMonsterId}`, `Mint completed! Inscription ID: ${data.mint.inscriptionId}`)
            onMintComplete?.()
          }
        }
      } catch (error) {
        console.error('Error checking status on mount:', error)
      }
    }

    checkStatus()
  }, [megaMonsterId, commitTxId, revealTxId, status, createAndBroadcastReveal, paymentAddress, showToastOnce, onMintComplete, revealData])

  // Poll for confirmations
  useEffect(() => {
    if (!commitTxId && !revealTxId) {
      return
    }
    
    if (status !== 'waiting_commit_confirmation' && status !== 'waiting_reveal_confirmation') {
      return
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/admin/megamonsters/mint/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            megaMonsterId,
            commitTxId,
            revealTxId,
            pollForConfirmation: true
          })
        })

        const data = await response.json()
        
        if (data.success) {
          if (data.statusChanged) {
            if (data.mint.status === 'commit_in_mempool' && status === 'waiting_commit_confirmation') {
              console.log('✅ Commit in mempool, waiting 2 seconds before broadcasting reveal...')
              setCommitTxId(data.mint.commitTxId)
              clearInterval(pollInterval)
              showToastOnce(`commit_confirmed_${megaMonsterId}`, 'Commit confirmed! Broadcasting reveal transaction...')
              
              await new Promise(resolve => setTimeout(resolve, 2000))
              
              // Reveal data will be fetched from DB by create-reveal endpoint if not in state
              await createAndBroadcastReveal(megaMonsterId, data.mint.commitTxId, revealData || null)
            } else if (data.mint.status === 'completed' && status === 'waiting_reveal_confirmation') {
              console.log('🎉 Mint completed!')
              setStatus('completed')
              setInscriptionId(data.mint.inscriptionId)
              clearInterval(pollInterval)
              
              if (paymentAddress) {
                clearExcludedUtxos(paymentAddress)
              }
              
              showToastOnce(`mint_completed_${megaMonsterId}`, `Mint completed! Inscription ID: ${data.mint.inscriptionId}`)
              onMintComplete?.()
            }
          } else if (data.mint.status === 'completed') {
            setStatus('completed')
            setInscriptionId(data.mint.inscriptionId)
            clearInterval(pollInterval)
            if (paymentAddress) {
              clearExcludedUtxos(paymentAddress)
            }
            showToastOnce(`mint_completed_${megaMonsterId}`, `Mint completed! Inscription ID: ${data.mint.inscriptionId}`)
            onMintComplete?.()
          }
        }
      } catch (error) {
        console.error('Error polling status:', error)
      }
    }, 10000)

    return () => {
      clearInterval(pollInterval)
    }
  }, [megaMonsterId, commitTxId, revealTxId, status, createAndBroadcastReveal, paymentAddress, showToastOnce, onMintComplete, revealData])

  const compressImage = async () => {
    setStatus('compressing')
    
    try {
      const response = await fetch('/api/admin/megamonsters/mint/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          megaMonsterId,
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

    if (existingMint?.commitTxId && !existingMint.revealTxId && revealData) {
      console.log('🚀 Commit already exists, broadcasting reveal directly')
      toast.info('Broadcasting reveal transaction. Commit already confirmed in mempool')
      await createAndBroadcastReveal(megaMonsterId, existingMint.commitTxId, revealData)
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
        setStatus('compressing')
        const response = await fetch(compressedImageUrl)
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        compressedBase64 = buffer.toString('base64')
      } else {
        const compressionResult = await compressImage()
        compressedBase64 = compressionResult.compressedBase64
      }

      console.log('✅ Image ready for inscription')

      // Step 2: Create commit PSBT
      setStatus('creating_commit')
      
      const excludedUtxos = getExcludedUtxos(paymentAddress || address)
      if (excludedUtxos.length > 0) {
        console.log(`🚫 Excluding ${excludedUtxos.length} UTXOs from pending transactions`)
      }
      
      const commitResponse = await fetch('/api/admin/megamonsters/mint/create-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          megaMonsterId,
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
      
      // Store reveal data for later use (also stored in DB by API)
      setRevealData(commitData.revealData)
      
      // Store cost breakdown
      if (commitData.fees) {
        setCostBreakdown({
          commitTxFee: commitData.fees.commitTxFee,
          revealTxFee: commitData.fees.revealTxFee,
          toolFee: commitData.fees.toolFee || 0,
          totalCost: commitData.fees.totalCost
        })
      }
      
      // Add used UTXOs to exclusion list
      if (commitData.usedUtxos && commitData.usedUtxos.length > 0) {
        addExcludedUtxos(paymentAddress || address, commitData.usedUtxos)
        console.log(`🚫 Added ${commitData.usedUtxos.length} UTXOs to exclusion list`)
      }

      // Step 3: Sign commit PSBT with wallet
      setStatus('signing_commit')
      
      const shouldAutoBroadcast = false
      const walletResult = await client.signPsbt(commitData.commitPsbt, true, shouldAutoBroadcast)
      
      setStatus('broadcasting_commit')
      
      let txId: string
      
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
      
      const psbt = bitcoin.Psbt.fromBase64(psbtBase64)
      const requiresFinalization = psbt.data.inputs.some(
        (input: any) => !input.finalScriptSig && !input.finalScriptWitness
      )
      
      if (requiresFinalization) {
        console.log('🔧 PSBT requires finalization, calling finalize API...')
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
          
          const txHex = finalizeData.hex
          console.log('✅ PSBT finalized successfully')
          
          const broadcastResponse = await fetch('/api/admin/megamonsters/mint/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              megaMonsterId,
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
        console.log('✅ PSBT already finalized by wallet')
        const txHex = psbt.extractTransaction().toHex()
        
        const broadcastResponse = await fetch('/api/admin/megamonsters/mint/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            megaMonsterId,
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

      if (!txId) {
        throw new Error('Failed to get transaction ID after broadcast')
      }

      setCommitTxId(txId)
      setStatus('waiting_commit_confirmation')
      showToastOnce(`commit_broadcast_${megaMonsterId}`, 'Commit broadcast! Waiting for confirmation before reveal...')

     } catch (error) {
       console.error('Mint failed:', error)
       const errorMsg = error instanceof Error ? error.message : 'Mint failed'
       setError(errorMsg)
       setStatus('failed')
       toast.error(`Mint failed: ${errorMsg}`)
       
       if (paymentAddress) {
         clearExcludedUtxos(paymentAddress)
       }
     }
  }

  const getStatusText = () => {
    if (status === 'idle' && existingMint?.commitTxId && !existingMint.revealTxId) {
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
            <span>Tool Fee:</span>
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
      
      {status === 'reveal_failed' && commitTxId && (
        <Button
          onClick={() => createAndBroadcastReveal(megaMonsterId, commitTxId, revealData || null)}
          disabled={isProcessing}
          className="w-full"
          variant="outline"
        >
          {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Retry Reveal Transaction
        </Button>
      )}

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

