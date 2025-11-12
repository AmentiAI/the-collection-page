export interface FileData {
  name: string
  mimeType: string
  size: number
  buffer?: ArrayBuffer
  content?: string
}

export interface SatRange {
  sat: [number, number]
  types: string[]
}

export interface RareSatUtxo {
  id: string
  txid: string
  vout: number
  value: number
  address?: string
  is_confirm: boolean
  sats: SatRange[]
}

export interface InscriptionResult {
  success: boolean
  commitTxId?: string
  revealTxIds?: string[]
  inscriptionIds?: string[]
  error?: string
  [key: string]: any
}



