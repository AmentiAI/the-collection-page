'use client'

import { useState, useEffect } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'
import Header from '@/components/Header'
import ProductPlacementEditor from '@/components/ProductPlacementEditor'
import BlueprintSelector from '@/components/BlueprintSelector'

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

interface PlacementPosition {
  x: number
  y: number
  scale: number
  widthScale?: number
  heightScale?: number
  angle: number
  lockAspectRatio?: boolean
}

type Step = 'products' | 'design' | 'placement' | 'details'

export default function MerchPage() {
  const { connected, address } = useLaserEyes()
  
  // Step management
  const [currentStep, setCurrentStep] = useState<Step>('products')
  
  // Product selection
  const [blueprintId, setBlueprintId] = useState<number | undefined>(undefined)
  const [printProviderId, setPrintProviderId] = useState<number | undefined>(undefined)
  const [mockupImages, setMockupImages] = useState<Record<string, string>>({})
  
  // Design image
  const [designImageUrl, setDesignImageUrl] = useState<string>('')
  const [ordinals, setOrdinals] = useState<MagicEdenToken[]>([])
  const [loadingOrdinals, setLoadingOrdinals] = useState(false)
  const [selectedOrdinal, setSelectedOrdinal] = useState<MagicEdenToken | null>(null)
  
  // Position management
  const [selectedPositions, setSelectedPositions] = useState<Record<string, boolean>>({
    front: false,
    back: false,
  })
  
  const [appliedPositions, setAppliedPositions] = useState<Record<string, boolean>>({
    front: false,
    back: false,
  })
  
  // Placement data
  const [placement, setPlacement] = useState<{
    positionsData: Record<string, PlacementPosition>
  }>({
    positionsData: {}
  })

  // Wrapper to handle partial updates from ProductPlacementEditor
  const handlePlacementChange = (changes: Partial<{ positionsData: Record<string, PlacementPosition> }>) => {
    setPlacement((prev) => ({
      positionsData: {
        ...prev.positionsData,
        ...(changes.positionsData || {}),
      },
    }))
  }
  
  // Product details
  const [productTitle, setProductTitle] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Available positions
  const availablePositions = ['front', 'back']

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
    const image = ordinal.contentURI || ordinal.image || ordinal.thumbnail
    if (image) {
      setDesignImageUrl(image)
      setProductTitle(ordinal.meta?.name || ordinal.name || 'Custom Product')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      setDesignImageUrl(result)
      setSelectedOrdinal(null)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Build placement data for applied positions only
      const placementData: Record<string, any> = {}
      Object.entries(appliedPositions).forEach(([pos, applied]) => {
        if (applied && placement.positionsData[pos]) {
          const posData = placement.positionsData[pos]
          placementData[pos] = {
            x: posData.x,
            y: posData.y,
            scale: posData.scale,
            widthScale: posData.widthScale ?? posData.scale,
            heightScale: posData.heightScale ?? posData.scale,
            angle: posData.angle,
          }
        }
      })

      // Default to front if no positions applied
      if (Object.keys(placementData).length === 0) {
        placementData.front = {
          x: 0.5,
          y: 0.5,
          scale: 1.0,
          angle: 0,
        }
      }

      const response = await fetch('/api/products/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: designImageUrl,
          title: productTitle || 'Custom Product',
          description: productDescription,
          blueprintId,
          printProviderId,
          placement: placementData,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setSuccess(`Product created successfully! Printify ID: ${data.printifyProductId}`)
        // Reset form
        setCurrentStep('products')
        setDesignImageUrl('')
        setSelectedOrdinal(null)
        setProductTitle('')
        setProductDescription('')
        setAppliedPositions({ front: false, back: false })
        setPlacement({ positionsData: {} })
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
    <div className="min-h-screen bg-gradient-to-b from-black via-red-950 to-black text-white">
      <Header />
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-widest text-red-200">
              Create Merch
            </h1>
            <p className="text-gray-400 font-mono text-sm uppercase tracking-wide">
              Step {currentStep === 'products' ? '1' : currentStep === 'design' ? '2' : currentStep === 'placement' ? '3' : '4'} of 4
            </p>
          </div>

          {/* Step 1: Product Selection */}
          {currentStep === 'products' && (
            <div className="bg-black/40 rounded-xl border border-red-600/40 p-6 space-y-6">
              <h2 className="text-2xl font-bold uppercase tracking-widest text-red-200">Select Product Type</h2>
              
              <BlueprintSelector
                onSelect={(bpId, ppId, mockups) => {
                  setBlueprintId(bpId)
                  setPrintProviderId(ppId)
                  setMockupImages(mockups)
                }}
                selectedBlueprintId={blueprintId}
                selectedPrintProviderId={printProviderId}
                selectedMockupImages={mockupImages}
              />

              {blueprintId && printProviderId && (
                <button
                  onClick={() => setCurrentStep('design')}
                  className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-xl font-mono font-bold uppercase tracking-widest text-white transition-all"
                >
                  Continue to Design Selection
                </button>
              )}
            </div>
          )}

          {/* Step 2: Design Selection */}
          {currentStep === 'design' && (
            <div className="bg-black/40 rounded-xl border border-red-600/40 p-6 space-y-6">
              <h2 className="text-2xl font-bold uppercase tracking-widest text-red-200">Select Design</h2>
              
              {/* Ordinal Selection */}
              {connected && (
                <div className="space-y-4">
                  <h3 className="text-lg font-mono uppercase text-red-300">Select from The Damned Ordinals</h3>
                  
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

              {/* Upload Option */}
              <div className="space-y-4">
                <h3 className="text-lg font-mono uppercase text-red-300">Or Upload Your Own Image</h3>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-mono file:bg-red-600 file:text-white hover:file:bg-red-700"
                />
              </div>

              {/* Image Preview */}
              {designImageUrl && (
                <div className="mt-4">
                  <p className="text-sm text-gray-400 font-mono mb-2">Preview:</p>
                  <div className="relative w-full max-w-md aspect-square rounded-lg border border-red-600/40 overflow-hidden">
                    <img
                      src={designImageUrl}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setCurrentStep('products')}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-mono font-bold uppercase tracking-widest text-white transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep('placement')}
                  disabled={!designImageUrl}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-mono font-bold uppercase tracking-widest text-white transition-all"
                >
                  Continue to Placement
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Placement Configuration */}
          {currentStep === 'placement' && designImageUrl && (
            <div className="bg-black/40 rounded-xl border border-red-600/40 p-6 space-y-6">
              <h2 className="text-2xl font-bold uppercase tracking-widest text-red-200">Configure Placement</h2>
              
              {/* Position Selection (Single-select for viewing) */}
              <div className="border border-red-600/40 rounded-lg p-4 bg-black/60">
                <h3 className="text-sm font-mono uppercase text-gray-400 mb-3">Select Position to Configure</h3>
                <div className="grid grid-cols-2 gap-2">
                  {availablePositions.map((position) => (
                    <label
                      key={position}
                      className={`flex items-center gap-2 p-3 rounded border-2 cursor-pointer transition-all ${
                        selectedPositions[position]
                          ? 'border-red-500 bg-red-950/50'
                          : 'border-gray-700 hover:border-red-600/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="position"
                        checked={selectedPositions[position] || false}
                        onChange={() => {
                          // Single-select: when checking, uncheck all others
                          const newSelected: Record<string, boolean> = {}
                          availablePositions.forEach(pos => {
                            newSelected[pos] = pos === position
                          })
                          setSelectedPositions(newSelected)
                        }}
                        className="w-4 h-4 accent-red-600"
                      />
                      <span className="capitalize font-mono text-sm uppercase">{position}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Visual Editor for Selected Position */}
              {availablePositions.filter(pos => selectedPositions[pos]).map((position) => {
                const isApplied = appliedPositions[position] || false
                
                // Initialize placement data if not exists
                if (!placement.positionsData[position]) {
                  setPlacement({
                    positionsData: {
                      ...placement.positionsData,
                      [position]: { x: 0.5, y: 0.5, scale: 1.0, angle: 0 }
                    }
                  })
                }

                return (
                  <div key={position} className="space-y-4">
                    {/* Apply Toggle */}
                    <div className="border border-red-600/40 rounded-lg p-4 bg-black/60">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isApplied}
                            onChange={(e) => {
                              setAppliedPositions({
                                ...appliedPositions,
                                [position]: e.target.checked
                              })
                            }}
                            className="w-5 h-5 accent-red-600"
                          />
                          <span className="font-mono text-sm uppercase">
                            Apply image to {position.charAt(0).toUpperCase() + position.slice(1)}
                          </span>
                        </label>
                        {isApplied && <span className="text-green-500 text-sm font-mono">✓ Active</span>}
                      </div>
                    </div>

                    {/* Visual Placement Editor */}
                    <ProductPlacementEditor
                      previewUrl={designImageUrl}
                      productImages={mockupImages[position] ? [mockupImages[position]] : null}
                      placement={placement}
                      onPlacementChange={handlePlacementChange}
                      position={position}
                    />
                  </div>
                )
              })}

              <div className="flex gap-4">
                <button
                  onClick={() => setCurrentStep('design')}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-mono font-bold uppercase tracking-widest text-white transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep('details')}
                  disabled={Object.values(appliedPositions).every(v => !v)}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-mono font-bold uppercase tracking-widest text-white transition-all"
                >
                  Continue to Details
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Product Details */}
          {currentStep === 'details' && (
            <div className="bg-black/40 rounded-xl border border-red-600/40 p-6 space-y-6">
              <h2 className="text-2xl font-bold uppercase tracking-widest text-red-200">Product Details</h2>
              
              <div>
                <label className="block text-sm font-mono uppercase text-gray-400 mb-2">
                  Product Title
                </label>
                <input
                  type="text"
                  value={productTitle}
                  onChange={(e) => setProductTitle(e.target.value)}
                  placeholder="Enter product title"
                  className="w-full px-4 py-2 bg-black/60 border border-red-600/40 rounded-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-mono uppercase text-gray-400 mb-2">
                  Description
                </label>
                <textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="Enter product description"
                  rows={4}
                  className="w-full px-4 py-2 bg-black/60 border border-red-600/40 rounded-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                />
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

              <div className="flex gap-4">
                <button
                  onClick={() => setCurrentStep('placement')}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-mono font-bold uppercase tracking-widest text-white transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !productTitle || !designImageUrl}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-mono font-bold uppercase tracking-widest text-white transition-all"
                >
                  {loading ? 'Creating Product...' : 'Create Product'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
