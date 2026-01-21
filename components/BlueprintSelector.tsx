'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Blueprint {
  id: number
  title: string
  description: string
  brand: string
  model: string
  images: string[]
}

interface PrintProvider {
  id: number
  title: string
  location: string
}

interface PlaceholderImage {
  position: string
  images: string[]
}

interface BlueprintSelectorProps {
  onSelect: (blueprintId: number, printProviderId: number, mockupImages: Record<string, string>) => void
  selectedBlueprintId?: number
  selectedPrintProviderId?: number
  selectedMockupImages?: Record<string, string>
}

export default function BlueprintSelector({
  onSelect,
  selectedBlueprintId,
  selectedPrintProviderId,
  selectedMockupImages = {},
}: BlueprintSelectorProps) {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [filteredBlueprints, setFilteredBlueprints] = useState<Blueprint[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null)
  const [printProviders, setPrintProviders] = useState<PrintProvider[]>([])
  const [selectedPrintProvider, setSelectedPrintProvider] = useState<PrintProvider | null>(null)
  const [placeholderImages, setPlaceholderImages] = useState<PlaceholderImage[]>([])
  const [mockupImages, setMockupImages] = useState<Record<string, string>>(selectedMockupImages)
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [loadingPlaceholders, setLoadingPlaceholders] = useState(false)
  
  const itemsPerPage = 12
  const observerRef = useRef<IntersectionObserver | null>(null)
  const lastBlueprintElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && filteredBlueprints.length > currentPage * itemsPerPage) {
        setCurrentPage(prev => prev + 1)
      }
    })
    if (node) observerRef.current.observe(node)
  }, [loading, filteredBlueprints.length, currentPage])

  // Fetch blueprints
  useEffect(() => {
    fetchBlueprints()
  }, [])

  // Filter blueprints based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredBlueprints(blueprints)
    } else {
      const query = searchQuery.toLowerCase()
      setFilteredBlueprints(
        blueprints.filter(bp =>
          bp.title.toLowerCase().includes(query) ||
          bp.brand.toLowerCase().includes(query) ||
          bp.model.toLowerCase().includes(query) ||
          bp.description.toLowerCase().includes(query)
        )
      )
    }
    setCurrentPage(1)
  }, [searchQuery, blueprints])

  // Fetch blueprint details when selected
  useEffect(() => {
    if (selectedBlueprint) {
      fetchBlueprintDetails(selectedBlueprint.id)
    }
  }, [selectedBlueprint])

  // Fetch print provider details when selected
  useEffect(() => {
    if (selectedBlueprint && selectedPrintProvider) {
      fetchPrintProviderDetails(selectedBlueprint.id, selectedPrintProvider.id)
    }
  }, [selectedBlueprint, selectedPrintProvider])

  const fetchBlueprints = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/printify/blueprints')
      const data = await response.json()
      if (data.success) {
        setBlueprints(data.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch blueprints:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchBlueprintDetails = async (blueprintId: number) => {
    setLoadingProviders(true)
    try {
      // Fetch blueprint details
      const blueprintResponse = await fetch(`/api/printify/blueprint/${blueprintId}`)
      const blueprintData = await blueprintResponse.json()
      console.log('Blueprint details response:', blueprintData)
      
      // Try to fetch print providers separately
      let providers: PrintProvider[] = []
      try {
        const providersResponse = await fetch(`/api/printify/blueprint/${blueprintId}/print-providers`)
        const providersData = await providersResponse.json()
        if (providersData.success) {
          providers = providersData.data || []
        }
      } catch (err) {
        console.warn('Could not fetch print providers separately:', err)
      }
      
      // If still no providers, use default
      if (providers.length === 0) {
        console.warn('No print providers found, using default')
        providers = [{ id: 1, title: 'Default Print Provider', location: 'US' }]
      }
      
      setPrintProviders(providers)
      // Auto-select first print provider if available
      if (providers.length > 0) {
        setSelectedPrintProvider(providers[0])
      }
    } catch (error) {
      console.error('Failed to fetch blueprint details:', error)
      // Fallback: create default provider
      setPrintProviders([{ id: 1, title: 'Default Print Provider', location: 'US' }])
      setSelectedPrintProvider({ id: 1, title: 'Default Print Provider', location: 'US' })
    } finally {
      setLoadingProviders(false)
    }
  }

  const fetchPrintProviderDetails = async (blueprintId: number, printProviderId: number) => {
    setLoadingPlaceholders(true)
    try {
      const response = await fetch(
        `/api/printify/print-provider?blueprintId=${blueprintId}&printProviderId=${printProviderId}`
      )
      const data = await response.json()
      console.log('Print provider details response:', data)
      
      if (data.success) {
        let placeholderImages = data.data.placeholder_images || []
        console.log('Placeholder images from API:', placeholderImages)
        
        // If no placeholder images, use blueprint images as mockups
        if (placeholderImages.length === 0 && selectedBlueprint?.images && selectedBlueprint.images.length > 0) {
          console.log('No placeholder images from API, using blueprint images as mockups')
          // Use blueprint images as mockup options for front and back
          // Users can select which image to use for each position
          placeholderImages = [
            {
              position: 'front',
              images: selectedBlueprint.images // All blueprint images available for front
            },
            {
              position: 'back',
              images: selectedBlueprint.images // All blueprint images available for back
            }
          ]
        }
        
        setPlaceholderImages(placeholderImages)
        
        // Auto-select first image for each position
        const autoSelected: Record<string, string> = {}
        placeholderImages.forEach((pi: PlaceholderImage) => {
          const images = Array.isArray(pi.images) ? pi.images : (pi.images ? [pi.images] : [])
          if (images.length > 0) {
            autoSelected[pi.position] = images[0]
          }
        })
        console.log('Auto-selected mockup images:', autoSelected)
        setMockupImages(autoSelected)
      } else {
        console.error('Failed to fetch print provider details:', data.error)
        // Fallback: use blueprint images
        if (selectedBlueprint?.images && selectedBlueprint.images.length > 0) {
          const fallbackImages = [
            {
              position: 'front',
              images: selectedBlueprint.images.slice(0, 3)
            },
            {
              position: 'back',
              images: selectedBlueprint.images.slice(0, 3)
            }
          ]
          setPlaceholderImages(fallbackImages)
          setMockupImages({
            front: selectedBlueprint.images[0],
            back: selectedBlueprint.images[0]
          })
        }
      }
    } catch (error) {
      console.error('Failed to fetch print provider details:', error)
      // Fallback: use blueprint images
      if (selectedBlueprint?.images && selectedBlueprint.images.length > 0) {
        const fallbackImages = [
          {
            position: 'front',
            images: selectedBlueprint.images.slice(0, 3)
          },
          {
            position: 'back',
            images: selectedBlueprint.images.slice(0, 3)
          }
        ]
        setPlaceholderImages(fallbackImages)
        setMockupImages({
          front: selectedBlueprint.images[0],
          back: selectedBlueprint.images[0]
        })
      }
    } finally {
      setLoadingPlaceholders(false)
    }
  }

  const handleBlueprintSelect = (blueprint: Blueprint) => {
    setSelectedBlueprint(blueprint)
    setSelectedPrintProvider(null)
    setPlaceholderImages([])
    setMockupImages({})
  }

  const handlePrintProviderSelect = (provider: PrintProvider) => {
    setSelectedPrintProvider(provider)
  }

  const handleMockupImageSelect = (position: string, imageUrl: string) => {
    setMockupImages(prev => ({
      ...prev,
      [position]: imageUrl,
    }))
  }

  const handleConfirm = () => {
    if (selectedBlueprint && selectedPrintProvider) {
      onSelect(selectedBlueprint.id, selectedPrintProvider.id, mockupImages)
    }
  }

  const displayedBlueprints = filteredBlueprints.slice(0, currentPage * itemsPerPage)

  return (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search blueprints..."
          className="w-full px-4 py-2 bg-black/60 border border-red-600/40 rounded-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      {selectedBlueprint ? (
        <div className="space-y-6">
          {/* Selected Blueprint Info */}
          <div className="bg-black/60 rounded-lg p-4 border border-red-600/40">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-red-200">{selectedBlueprint.title}</h3>
                <p className="text-sm text-gray-400 font-mono">{selectedBlueprint.brand} - {selectedBlueprint.model}</p>
                <p className="text-xs text-gray-500 mt-2">{selectedBlueprint.description}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedBlueprint(null)
                  setSelectedPrintProvider(null)
                  setPlaceholderImages([])
                  setMockupImages({})
                }}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm font-mono uppercase"
              >
                Change
              </button>
            </div>
          </div>

          {/* Print Provider Selection */}
          {loadingProviders ? (
            <p className="text-gray-400 font-mono text-sm">Loading print providers...</p>
          ) : printProviders.length > 0 ? (
            <div className="space-y-2">
              <label className="block text-sm font-mono uppercase text-gray-400">Print Provider</label>
              <select
                value={selectedPrintProvider?.id || ''}
                onChange={(e) => {
                  const provider = printProviders.find(p => p.id === parseInt(e.target.value))
                  if (provider) handlePrintProviderSelect(provider)
                }}
                className="w-full px-4 py-2 bg-black/60 border border-red-600/40 rounded-lg text-white font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Select print provider...</option>
                {printProviders.map(provider => (
                  <option key={provider.id} value={provider.id}>
                    {provider.title} ({provider.location})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Mockup Image Selection */}
          {selectedPrintProvider && (
            <div className="space-y-4">
              {loadingPlaceholders ? (
                <p className="text-gray-400 font-mono text-sm">Loading mockup images...</p>
              ) : (
                <>
                  <label className="block text-sm font-mono uppercase text-gray-400">
                    Select Mockup Images for Placement Preview
                  </label>
                  
                  {/* Use blueprint images if placeholder images aren't available */}
                  {placeholderImages.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {placeholderImages.map((pi) => {
                        const images = Array.isArray(pi.images) ? pi.images : (pi.images ? [pi.images] : [])
                        const position = pi.position || 'front'
                        
                        if (images.length === 0) return null
                        
                        return (
                          <div key={position} className="space-y-2">
                            <label className="block text-xs font-mono uppercase text-gray-500">
                              {position.charAt(0).toUpperCase() + position.slice(1)} Mockup
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {images.map((img, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleMockupImageSelect(position, img)}
                                  className={`aspect-square rounded border-2 overflow-hidden transition-all ${
                                    mockupImages[position] === img
                                      ? 'border-red-500 ring-2 ring-red-500'
                                      : 'border-gray-700 hover:border-red-600'
                                  }`}
                                >
                                  <img
                                    src={img}
                                    alt={`${position} ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      console.error('Failed to load mockup image:', img)
                                      e.currentTarget.style.display = 'none'
                                    }}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : selectedBlueprint?.images && selectedBlueprint.images.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Front Position */}
                      <div className="space-y-2">
                        <label className="block text-xs font-mono uppercase text-gray-500">
                          Front Mockup
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {selectedBlueprint.images.map((img, idx) => (
                            <button
                              key={`front-${idx}`}
                              type="button"
                              onClick={() => handleMockupImageSelect('front', img)}
                              className={`aspect-square rounded border-2 overflow-hidden transition-all ${
                                mockupImages.front === img
                                  ? 'border-red-500 ring-2 ring-red-500'
                                  : 'border-gray-700 hover:border-red-600'
                              }`}
                            >
                              <img
                                src={img}
                                alt={`Front mockup ${idx + 1}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  console.error('Failed to load image:', img)
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Back Position */}
                      <div className="space-y-2">
                        <label className="block text-xs font-mono uppercase text-gray-500">
                          Back Mockup
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {selectedBlueprint.images.map((img, idx) => (
                            <button
                              key={`back-${idx}`}
                              type="button"
                              onClick={() => handleMockupImageSelect('back', img)}
                              className={`aspect-square rounded border-2 overflow-hidden transition-all ${
                                mockupImages.back === img
                                  ? 'border-red-500 ring-2 ring-red-500'
                                  : 'border-gray-700 hover:border-red-600'
                              }`}
                            >
                              <img
                                src={img}
                                alt={`Back mockup ${idx + 1}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  console.error('Failed to load image:', img)
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-gray-400 font-mono text-sm">No mockup images available</p>
                      <div className="mt-4 p-4 bg-black/60 rounded border border-red-600/40">
                        <p className="text-xs text-gray-400 font-mono mb-2">Manual Mockup Image URLs:</p>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Front Mockup URL:</label>
                            <input
                              type="text"
                              placeholder="https://..."
                              value={mockupImages.front || ''}
                              onChange={(e) => handleMockupImageSelect('front', e.target.value)}
                              className="w-full px-2 py-1 bg-black/60 border border-red-600/40 rounded text-white text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Back Mockup URL:</label>
                            <input
                              type="text"
                              placeholder="https://..."
                              value={mockupImages.back || ''}
                              onChange={(e) => handleMockupImageSelect('back', e.target.value)}
                              className="w-full px-2 py-1 bg-black/60 border border-red-600/40 rounded text-white text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Confirm Button */}
          {selectedPrintProvider && Object.keys(mockupImages).length > 0 && (
            <button
              onClick={handleConfirm}
              className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-xl font-mono font-bold uppercase tracking-widest text-white transition-all"
            >
              Confirm Selection
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Blueprint Grid */}
          {loading ? (
            <p className="text-gray-400 font-mono text-sm text-center py-8">Loading blueprints...</p>
          ) : displayedBlueprints.length === 0 ? (
            <p className="text-gray-400 font-mono text-sm text-center py-8">No blueprints found</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {displayedBlueprints.map((blueprint, index) => (
                <div
                  key={blueprint.id}
                  ref={index === displayedBlueprints.length - 1 ? lastBlueprintElementRef : null}
                  className="bg-black/60 rounded-lg border border-red-600/40 overflow-hidden cursor-pointer hover:border-red-500 transition-all"
                  onClick={() => handleBlueprintSelect(blueprint)}
                >
                  {blueprint.images && blueprint.images.length > 0 ? (
                    <img
                      src={blueprint.images[0]}
                      alt={blueprint.title}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-gray-800 flex items-center justify-center">
                      <span className="text-xs text-gray-500">No Image</span>
                    </div>
                  )}
                  <div className="p-3">
                    <h4 className="text-sm font-bold text-red-200 truncate">{blueprint.title}</h4>
                    <p className="text-xs text-gray-400 font-mono truncate">{blueprint.brand}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
