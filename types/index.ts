export interface Trait {
  name: string
  description?: string
  trait_prompt?: string
}

export interface Ordinal {
  id: string
  collection_id: string
  ordinal_number?: number | null
  image_url: string
  metadata_url: string
  prompt: string
  traits: Record<string, Trait>
  trait_combination_hash: string
  rarity_score?: number | null
  rarity_tier?: string | null
  created_at: string
  thumbnail_url: string
  file_size_bytes: number
  is_minted: boolean
  inscription_id?: string | null
  minter_address?: string | null
  mint_tx_id?: string | null
  minted_at?: string | null
  inscription_data?: string | null
  tx_confirmed: boolean
  thumbnail_base64?: string | null
}
