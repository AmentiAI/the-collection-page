'use client'

import { useState, useEffect } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'

interface MagicEdenToken {
  id?: string
  inscriptionId?: string
  collectionSymbol?: string
  tokenId?: string
  name?: string
  image?: string
  thumbnail?: string
  contentURI?: string
  meta?: {
    name?: string
    traits?: Array<{
      trait_type: string
      value: string | number
    }>
    [key: string]: any
  }
  priceInfo?: {
    price?: number
    [key: string]: any
  }
  traits?: Record<string, any>
  price?: number
  [key: string]: any
}

interface Placement {
  front?: { x: number; y: number; scale: number; angle: number }
  back?: { x: number; y: number; scale: number; angle: number }
}

export default function MerchPage() {
  const { connected, address } = useLaserEyes()
  const [ordinals, setOrdinals] = useState<MagicEdenToken[]>([])
  const [loadingOrdinals, setLoadingOrdinals] = useState(false)
  const [selectedOrdinal, setSelectedOrdinal] = useState<MagicEdenToken | null>(null)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [imageSource, setImageSource] = useState<'ordinal' | 'upload' | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [blueprintId, setBlueprintId] = useState<number>(5) // Default: T-Shirt
  const [printProviderId, setPrintProviderId] = useState<number>(1) // Default print provider
  const [placement, setPlacement] = useState<Placement>({ front: { x: 0.5, y: 0.5, scale: 1.0, angle: 0 } })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Fetch user's ordinals from Magic Eden
  useEffect(() => {
    if (connected && address) {
      fetchUserOrdinals(address)
    }
  }, [connected, address])

  const fetchUserOrdinals = async (walletAddress: string) => {
    setLoadingOrdinals(true)
    try {
      const apiUrl = `/api/magic-eden?ownerAddress=${encodeURIComponent(walletAddress)}&collectionSymbol=the-damned&showAll=true`
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      })

      if (!response.ok) {
        console.error('Failed to fetch ordinals:', response.status)
        return
      }

      const data = await response.json()
      
      let tokens: MagicEdenToken[] = []
      if (Array.isArray(data.tokens)) {
        tokens = data.tokens
      } else if (Array.isArray(data)) {
        tokens = data
      }

      setOrdinals(tokens)
    } catch (error) {
      console.error('Error fetching ordinals:', error)
    } finally {
      setLoadingOrdinals(false)
    }
  }

  const handleOrdinalSelect = (ordinal: MagicEdenToken) => {
    setSelectedOrdinal(ordinal)
    // Try to get image from contentURI, image, or thumbnail
    const image = ordinal.contentURI || ordinal.image || ordinal.thumbnail
    if (image) {
      setImageUrl(image)
      setImageSource('ordinal')
    } else {
      setError('Selected ordinal has no image URL')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Convert to base64 data URL
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      setImageUrl(result)
      setImageSource('upload')
      setSelectedOrdinal(null)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/products/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          title: title || (selectedOrdinal?.meta?.name || selectedOrdinal?.name || 'Custom Product'),
          description: description || `Created from ${selectedOrdinal ? 'The Damned ordinal' : 'uploaded image'}`,
          blueprintId,
          printProviderId,
          placement,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setSuccess(`Product created successfully! Printify ID: ${data.printifyProductId}`)
        // Reset form
        setImageUrl('')
        setImageSource(null)
        setSelectedOrdinal(null)
        setTitle('')
        setDescription('')
      } else {
        setError(data.error || 'Failed to create product')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to create product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-red-950 to-black text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-widest text-red-200">
            Create Merch
          </h1>
          <p className="text-gray-400 font-mono text-sm uppercase tracking-wide">
            Select a Damned ordinal or upload your own design
          </p>
        </div>

        {!connected && (
          <div className="bg-red-950/70 rounded-xl border-2 border-red-500/70 p-6 text-center">
            <p className="text-red-200 font-mono">Please connect your wallet to view your ordinals</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Source Selection */}
          <div className="bg-black/40 rounded-xl border border-red-600/40 p-6 space-y-4">
            <h2 className="text-xl font-bold uppercase tracking-widest text-red-200">Image Source</h2>
            
            {/* Ordinal Selection */}
            {connected && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="source-ordinal"
                    name="imageSource"
                    checked={imageSource === 'ordinal'}
                    onChange={() => {
                      setImageSource('ordinal')
                      if (selectedOrdinal) {
                        const image = selectedOrdinal.contentURI || selectedOrdinal.image || selectedOrdinal.thumbnail
                        if (image) setImageUrl(image)
                      }
                    }}
                    className="w-4 h-4 text-red-600"
                  />
                  <label htmlFor="source-ordinal" className="font-mono text-sm uppercase">
                    Select from The Damned Ordinals
                  </label>
                </div>

                {imageSource === 'ordinal' && (
                  <div className="space-y-2">
                    {loadingOrdinals ? (
                      <p className="text-gray-400 font-mono text-sm">Loading ordinals...</p>
                    ) : ordinals.length === 0 ? (
                      <p className="text-gray-400 font-mono text-sm">No ordinals found in your wallet</p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-96 overflow-y-auto p-2">
                        {ordinals.map((ordinal) => {
                          const image = ordinal.contentURI || ordinal.image || ordinal.thumbnail
                          return (
                            <button
                              key={ordinal.inscriptionId || ordinal.id}
                              type="button"
                              onClick={() => handleOrdinalSelect(ordinal)}
                              className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                                selectedOrdinal?.inscriptionId === ordinal.inscriptionId
                                  ? 'border-red-500 ring-2 ring-red-500'
                                  : 'border-gray-700 hover:border-red-600'
                              }`}
                            >
                              {image ? (
                                <img
                                  src={image}
                                  alt={ordinal.meta?.name || ordinal.name || 'Ordinal'}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                  <span className="text-xs text-gray-500">No Image</span>
                                </div>
                              )}
                              {selectedOrdinal?.inscriptionId === ordinal.inscriptionId && (
                                <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                                  <span className="text-red-200 font-bold text-sm">✓</span>
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Upload Option */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="source-upload"
                  name="imageSource"
                  checked={imageSource === 'upload'}
                  onChange={() => {
                    setImageSource('upload')
                    setSelectedOrdinal(null)
                  }}
                  className="w-4 h-4 text-red-600"
                />
                <label htmlFor="source-upload" className="font-mono text-sm uppercase">
                  Upload Image
                </label>
              </div>

              {imageSource === 'upload' && (
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-mono file:bg-red-600 file:text-white hover:file:bg-red-700"
                  />
                </div>
              )}
            </div>

            {/* Image Preview */}
            {imageUrl && (
              <div className="mt-4">
                <p className="text-sm text-gray-400 font-mono mb-2">Preview:</p>
                <div className="relative w-full max-w-md aspect-square rounded-lg border border-red-600/40 overflow-hidden">
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="bg-black/40 rounded-xl border border-red-600/40 p-6 space-y-4">
            <h2 className="text-xl font-bold uppercase tracking-widest text-red-200">Product Details</h2>
            
            <div>
              <label className="block text-sm font-mono uppercase text-gray-400 mb-2">
                Product Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selectedOrdinal?.meta?.name || selectedOrdinal?.name || 'Enter product title'}
                className="w-full px-4 py-2 bg-black/60 border border-red-600/40 rounded-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-mono uppercase text-gray-400 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter product description"
                rows={3}
                className="w-full px-4 py-2 bg-black/60 border border-red-600/40 rounded-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          {/* Product Configuration */}
          <div className="bg-black/40 rounded-xl border border-red-600/40 p-6 space-y-4">
            <h2 className="text-xl font-bold uppercase tracking-widest text-red-200">Product Configuration</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-mono uppercase text-gray-400 mb-2">
                  Blueprint ID
                </label>
                <input
                  type="number"
                  value={blueprintId}
                  onChange={(e) => setBlueprintId(Number(e.target.value))}
                  placeholder="5 (T-Shirt)"
                  className="w-full px-4 py-2 bg-black/60 border border-red-600/40 rounded-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="text-xs text-gray-500 mt-1 font-mono">5 = T-Shirt, 91 = Hoodie, 12 = Tank Top</p>
              </div>

              <div>
                <label className="block text-sm font-mono uppercase text-gray-400 mb-2">
                  Print Provider ID
                </label>
                <input
                  type="number"
                  value={printProviderId}
                  onChange={(e) => setPrintProviderId(Number(e.target.value))}
                  placeholder="1"
                  className="w-full px-4 py-2 bg-black/60 border border-red-600/40 rounded-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
          </div>

          {/* Placement Configuration */}
          <div className="bg-black/40 rounded-xl border border-red-600/40 p-6 space-y-4">
            <h2 className="text-xl font-bold uppercase tracking-widest text-red-200">Placement Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={!!placement.front}
                    onChange={(e) => {
                      setPlacement({
                        ...placement,
                        front: e.target.checked
                          ? { x: 0.5, y: 0.5, scale: 1.0, angle: 0 }
                          : undefined,
                      })
                    }}
                    className="w-4 h-4 text-red-600"
                  />
                  <span className="font-mono text-sm uppercase">Front Placement</span>
                </label>
                {placement.front && (
                  <div className="ml-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">X</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={placement.front.x}
                        onChange={(e) =>
                          setPlacement({
                            ...placement,
                            front: { ...placement.front!, x: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                      <span className="text-xs text-gray-500">{placement.front.x.toFixed(2)}</span>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Y</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={placement.front.y}
                        onChange={(e) =>
                          setPlacement({
                            ...placement,
                            front: { ...placement.front!, y: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                      <span className="text-xs text-gray-500">{placement.front.y.toFixed(2)}</span>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Scale</label>
                      <input
                        type="range"
                        min="0.1"
                        max="2"
                        step="0.1"
                        value={placement.front.scale}
                        onChange={(e) =>
                          setPlacement({
                            ...placement,
                            front: { ...placement.front!, scale: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                      <span className="text-xs text-gray-500">{placement.front.scale.toFixed(1)}</span>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Angle</label>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="1"
                        value={placement.front.angle}
                        onChange={(e) =>
                          setPlacement({
                            ...placement,
                            front: { ...placement.front!, angle: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                      <span className="text-xs text-gray-500">{placement.front.angle}°</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={!!placement.back}
                    onChange={(e) => {
                      setPlacement({
                        ...placement,
                        back: e.target.checked
                          ? { x: 0.5, y: 0.5, scale: 1.0, angle: 0 }
                          : undefined,
                      })
                    }}
                    className="w-4 h-4 text-red-600"
                  />
                  <span className="font-mono text-sm uppercase">Back Placement</span>
                </label>
                {placement.back && (
                  <div className="ml-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">X</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={placement.back.x}
                        onChange={(e) =>
                          setPlacement({
                            ...placement,
                            back: { ...placement.back!, x: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                      <span className="text-xs text-gray-500">{placement.back.x.toFixed(2)}</span>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Y</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={placement.back.y}
                        onChange={(e) =>
                          setPlacement({
                            ...placement,
                            back: { ...placement.back!, y: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                      <span className="text-xs text-gray-500">{placement.back.y.toFixed(2)}</span>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Scale</label>
                      <input
                        type="range"
                        min="0.1"
                        max="2"
                        step="0.1"
                        value={placement.back.scale}
                        onChange={(e) =>
                          setPlacement({
                            ...placement,
                            back: { ...placement.back!, scale: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                      <span className="text-xs text-gray-500">{placement.back.scale.toFixed(1)}</span>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Angle</label>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="1"
                        value={placement.back.angle}
                        onChange={(e) =>
                          setPlacement({
                            ...placement,
                            back: { ...placement.back!, angle: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                      <span className="text-xs text-gray-500">{placement.back.angle}°</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-950/70 rounded-xl border-2 border-red-500/70 p-4">
              <p className="text-red-200 font-mono">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-950/70 rounded-xl border-2 border-green-500/70 p-4">
              <p className="text-green-200 font-mono">{success}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !imageUrl || !blueprintId || !printProviderId}
            className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-mono font-bold uppercase tracking-widest text-white transition-all"
          >
            {loading ? 'Creating Product...' : 'Create Product'}
          </button>
        </form>
      </div>
    </div>
  )
}
