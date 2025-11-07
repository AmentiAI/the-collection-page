'use client'

import { FileData, RareSatUtxo, InscriptionResult } from '@/types/inscription'

export interface InscriptionApiData {
  content: string
  contentType: string
  delegateAddress?: string
  parentInscriptionId?: string
}

export class InscriptionService {
  static async fetchMempoolFees() {
    const response = await fetch('https://mempool.space/api/v1/fees/recommended')
    if (!response.ok) {
      throw new Error('Failed to fetch mempool fees')
    }
    return response.json()
  }

  static async fetchPlatformFeeSettings() {
    const response = await fetch('/api/settings/public')
    if (!response.ok) {
      throw new Error('Failed to fetch platform fee settings')
    }
    const data = await response.json()
    const toolFeeValue = data.inscribeToolFee || 0
    return toolFeeValue < 1 ? Math.round(toolFeeValue * 100000000) : toolFeeValue
  }

  static getBlockedRareSatUtxos(address: string): Set<string> {
    try {
      const key = `blocked_rare_sats_${address}`
      const blocked = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
      return blocked ? new Set(JSON.parse(blocked) as string[]) : new Set()
    } catch (error) {
      console.warn('Failed to load blocked rare sat UTXOs from localStorage:', error)
      return new Set()
    }
  }

  static blockRareSatUtxo(address: string, utxoId: string): void {
    try {
      const key = `blocked_rare_sats_${address}`
      const blocked = this.getBlockedRareSatUtxos(address)
      blocked.add(utxoId)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify([...blocked]))
      }
    } catch (error) {
      console.warn('Failed to block rare sat UTXO in localStorage:', error)
    }
  }

  static clearBlockedRareSatUtxos(address: string): void {
    try {
      if (typeof window === 'undefined') return
      const key = `blocked_rare_sats_${address}`
      window.localStorage.removeItem(key)
    } catch (error) {
      console.warn('Failed to clear blocked rare sat UTXOs from localStorage:', error)
    }
  }

  static async fetchRareSatUtxos(address: string): Promise<RareSatUtxo[]> {
    const response = await fetch(`https://gw.sating.io/api/account/sats/${address}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch rare sats: ${response.statusText}`)
    }

    const data: RareSatUtxo[] = await response.json()
    const blockedUtxos = this.getBlockedRareSatUtxos(address)

    return data.filter((utxo) => {
      if (blockedUtxos.has(utxo.id)) {
        return false
      }

      if (!utxo.is_confirm) return false
      if (!utxo.sats || utxo.sats.length === 0) return false

      const hasRareTypes = utxo.sats.some((sat) => sat.types && sat.types.length > 0 && !sat.types.includes('inscription'))
      const hasInscription = utxo.sats.some((sat) => sat.types && sat.types.includes('inscription'))
      if (!hasRareTypes || hasInscription) return false

      const totalRareSats = utxo.sats.reduce((total, sat) => total + (sat.sat[1] - sat.sat[0] + 1), 0)
      const isPreSplitUtxo = utxo.value === 330 && totalRareSats > 1
      if (isPreSplitUtxo) return false

      return true
    })
  }

  static async waitForCommitTransaction(txId: string, maxWaitTime = 30000): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await fetch(`https://mempool.space/api/tx/${txId}`)
        if (response.ok) {
          return true
        }
      } catch (error) {
        // ignore until timeout
      }

      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    return false
  }

  static getExcludedUtxos(address: string): string[] {
    try {
      if (typeof window === 'undefined') return []
      const key = `excluded_utxos_${address}`
      const excluded = window.localStorage.getItem(key)
      return excluded ? JSON.parse(excluded) : []
    } catch (error) {
      console.warn('Failed to load excluded UTXOs from localStorage:', error)
      return []
    }
  }

  static addExcludedUtxos(address: string, utxoOutpoints: string[]): void {
    try {
      if (typeof window === 'undefined') return
      const key = `excluded_utxos_${address}`
      const excluded = this.getExcludedUtxos(address)
      const updated = [...new Set([...excluded, ...utxoOutpoints])]
      window.localStorage.setItem(key, JSON.stringify(updated))
    } catch (error) {
      console.warn('Failed to add excluded UTXOs to localStorage:', error)
    }
  }

  static removeExcludedUtxos(address: string, utxoOutpoints: string[]): void {
    try {
      if (typeof window === 'undefined') return
      const key = `excluded_utxos_${address}`
      const excluded = this.getExcludedUtxos(address)
      const filtered = excluded.filter((utxo) => !utxoOutpoints.includes(utxo))
      window.localStorage.setItem(key, JSON.stringify(filtered))
    } catch (error) {
      console.warn('Failed to remove excluded UTXOs from localStorage:', error)
    }
  }

  static clearAllExcludedUtxos(address: string): void {
    try {
      if (typeof window === 'undefined') return
      const key = `excluded_utxos_${address}`
      window.localStorage.removeItem(key)
    } catch (error) {
      console.warn('Failed to clear excluded UTXOs from localStorage:', error)
    }
  }

  static async createCustomInscriptionTransaction(
    inscriptions: InscriptionApiData[],
    userAddress: string,
    paymentAddress: string,
    paymentPublicKey: string,
    publicKey: string,
    feeRate: number,
    rareSatUtxo?: RareSatUtxo | null,
    hasOrdzaarPass?: boolean,
    destinationAddress?: string,
    burnEntireUtxo?: boolean,
    excludedUtxos?: string[]
  ): Promise<InscriptionResult> {
    const finalExcludedUtxos = excludedUtxos || this.getExcludedUtxos(paymentAddress)

    const response = await fetch('/api/self-inscribe/create-psbt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inscriptions: inscriptions.map((ins) => ({
          content: ins.content,
          contentType: ins.contentType,
          ...(ins.delegateAddress && { delegateAddress: ins.delegateAddress }),
          ...(ins.parentInscriptionId && { parentInscriptionId: ins.parentInscriptionId })
        })),
        userAddress,
        paymentAddress,
        paymentPubkey: paymentPublicKey,
        taprootPubkey: publicKey,
        feeRate,
        rareSatUtxo: rareSatUtxo || undefined,
        hasOrdzaarPass,
        ...(destinationAddress && { destinationAddress }),
        ...(burnEntireUtxo && { burnEntireUtxo }),
        ...(finalExcludedUtxos.length > 0 && { excludedUtxos: finalExcludedUtxos })
      })
    })

    if (!response.ok) {
      let errorData: any = null
      try {
        errorData = await response.json()
      } catch (parseError) {
        // ignore
      }

      if (errorData?.error === 'Fee rate validation failed' && errorData.recommendations) {
        const rec = errorData.recommendations
        const errorMessage = `${errorData.details}\n\nSuggestions:\n` +
          `• Try ${rec.recommendedFeeRate} sat/vB\n` +
          `• Available funds ${rec.availableFunds} sats (~${rec.actualFeeRate?.toFixed?.(2) ?? rec.actualFeeRate} sat/vB)\n` +
          `• Estimated size ~${rec.estimatedSize} vB`

        throw new Error(errorMessage)
      }

      throw new Error(errorData?.error || 'Failed to create inscription PSBT')
    }

    return response.json()
  }

  static async createRevealTransaction(
    commitTxId: string,
    commitOutputValue: number,
    commitOutputIndex: number,
    revealData: any,
    feeRate: number
  ): Promise<any> {
    const response = await fetch('/api/self-inscribe/create-reveal-psbt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        commitTxId,
        commitOutputValue,
        commitOutputIndex,
        feeRate,
        mode: 'signed',
        revealData
      })
    })

    if (!response.ok) {
      let errorMessage = 'Failed to create reveal transaction'
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch (parseError) {
        errorMessage = `Server error (${response.status}): ${response.statusText}`
      }
      throw new Error(errorMessage)
    }

    const responseData = await response.json()
    if (!responseData || !responseData.success) {
      throw new Error('Invalid response from reveal transaction API')
    }

    return responseData
  }

  static async broadcastViaSandshrew(signedTxHex: string): Promise<string> {
    const response = await fetch('/api/broadcast-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        txHex: signedTxHex,
        method: 'sandshrew'
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`Sandshrew broadcast failed: ${errorData.error || response.statusText}`)
    }

    const data = await response.json()
    return data.txId
  }

  static async broadcastViaMempoolSpace(signedTxHex: string): Promise<string> {
    const broadcastResponse = await fetch('https://mempool.space/api/tx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: signedTxHex
    })

    if (!broadcastResponse.ok) {
      const errorText = await broadcastResponse.text()
      if (errorText.includes('min relay fee not met')) {
        const feeMatch = errorText.match(/(\d+) < (\d+)/)
        if (feeMatch) {
          const [, actualFee, requiredFee] = feeMatch
          throw new Error(`Transaction fee too low: ${actualFee} sats (required: ${requiredFee} sats). Increase the fee rate.`)
        }
      }

      throw new Error(`Mempool broadcast failed: ${errorText}`)
    }

    return broadcastResponse.text()
  }

  static async broadcastTransaction(signedTxHex: string, feeRate?: number): Promise<string> {
    if (feeRate && feeRate < 1) {
      return this.broadcastViaSandshrew(signedTxHex)
    }

    return this.broadcastViaMempoolSpace(signedTxHex)
  }
}

export function analyzeSatRanges(utxo: RareSatUtxo) {
  let totalRareSats = 0
  let lastRareSatRange: [number, number] | null = null

  for (const sat of utxo.sats) {
    const rangeSize = sat.sat[1] - sat.sat[0] + 1
    totalRareSats += rangeSize
    if (!lastRareSatRange || sat.sat[1] > lastRareSatRange[1]) {
      lastRareSatRange = sat.sat
    }
  }

  const commonSats = utxo.value - totalRareSats

  return {
    totalRareSats,
    commonSats,
    lastRareSatRange,
    needsSplitting: totalRareSats > 1,
    types: [...new Set(utxo.sats.flatMap((sat) => sat.types))]
  }
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function formatSats(sats: number) {
  return new Intl.NumberFormat().format(Math.round(sats))
}

export function formatBTC(sats: number) {
  return (sats / 100000000).toFixed(8)
}

export async function saveInscriptionOrder(orderData: {
  userAddress: string
  paymentAddress?: string
  commitTxId: string
  revealTxIds: string[]
  inscriptionIds: string[]
  files: Array<{
    name: string
    mimeType: string
    size: number
    inscriptionId: string
    revealTxId: string
    isDelegateInscription?: boolean
    delegateAddress?: string
  }>
  totalCostSats: number
  commitFeeSats: number
  revealFeesSats: number
  platformFeeSats?: number
  toolFeeSats?: number
  feeRate: number
  batchInfo?: {
    totalBatches: number
    completedBatches: number
    failedBatches: number
    batchDetails: Array<{
      batchIndex: number
      commitTxId: string
      inscriptionCount: number
      status: 'pending' | 'completed' | 'failed'
    }>
  }
}) {
  try {
    const response = await fetch('/api/user/inscription-orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    })

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error || 'Failed to save inscription order')
    }

    return result.data
  } catch (error) {
    console.error('Failed to save inscription order:', error)
    throw error
  }
}

