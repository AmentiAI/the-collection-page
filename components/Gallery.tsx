'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Ordinal } from '@/types'

interface GalleryProps {
  ordinals: Ordinal[]
  loading: boolean
  onOrdinalClick: (ordinal: Ordinal) => void
}

const ORDINALS_PER_PAGE = 8

export default function Gallery({ ordinals, loading, onOrdinalClick }: GalleryProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [hoveredOrdinal, setHoveredOrdinal] = useState<Ordinal | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const hoverRef = useRef<HTMLDivElement>(null)
  
  // Calculate preview position to stay on screen
  const getPreviewStyle = () => {
    const previewWidth = 400
    const previewHeight = 400
    const offset = 20
    let left = mousePosition.x + offset
    let top = mousePosition.y + offset
    
    // Check if preview would go off right edge
    if (typeof window !== 'undefined' && left + previewWidth > window.innerWidth) {
      left = mousePosition.x - previewWidth - offset
    }
    
    // Check if preview would go off bottom edge
    if (typeof window !== 'undefined' && top + previewHeight > window.innerHeight) {
      top = mousePosition.y - previewHeight - offset
    }
    
    // Ensure it stays on screen
    left = Math.max(offset, Math.min(left, (typeof window !== 'undefined' ? window.innerWidth : 1920) - previewWidth - offset))
    top = Math.max(offset, Math.min(top, (typeof window !== 'undefined' ? window.innerHeight : 1080) - previewHeight - offset))
    
    return { left: `${left}px`, top: `${top}px` }
  }

  // Calculate pagination
  const totalPages = Math.ceil(ordinals.length / ORDINALS_PER_PAGE)
  const startIndex = (currentPage - 1) * ORDINALS_PER_PAGE
  const endIndex = startIndex + ORDINALS_PER_PAGE
  const currentOrdinals = useMemo(() => {
    return ordinals.slice(startIndex, endIndex)
  }, [ordinals, startIndex, endIndex])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [ordinals.length])

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="text-2xl text-[#ff6b6b]">Loading collection...</p>
      </div>
    )
  }

  if (ordinals.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-xl text-[#ff6b6b]">No ordinals match your filters.</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <span className="text-xl text-[#ff6b6b] font-bold">{ordinals.length}</span>
          <span className="ml-2">ordinals</span>
          {totalPages > 1 && (
            <span className="ml-3 text-sm text-gray-400">
              (Page {currentPage} of {totalPages})
            </span>
          )}
        </div>
      </div>

      <div 
        className="relative"
        onMouseMove={(e) => {
          setMousePosition({ x: e.clientX, y: e.clientY })
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {currentOrdinals.map(ordinal => (
            <div
              key={ordinal.id}
              onClick={() => onOrdinalClick(ordinal)}
              onMouseEnter={() => setHoveredOrdinal(ordinal)}
              onMouseLeave={() => setHoveredOrdinal(null)}
              className="bg-[rgba(20,20,20,0.9)] border-2 border-gray-700 rounded-lg overflow-hidden cursor-pointer transition-all hover:-translate-y-2 hover:border-[#ff0000] hover:shadow-[0_10px_30px_rgba(255,0,0,0.3)]"
            >
              <div className="relative aspect-square">
                <img
                  src={ordinal.thumbnail_url}
                  alt={`Ordinal ${ordinal.id}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Crect fill='%23000'/%3E%3Ctext fill='%23ff0000' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-family='monospace'%3ENO IMAGE%3C/text%3E%3C/svg%3E"
                  }}
                />
              </div>
            <div className="p-4">
              <div className="text-[#ff6b6b] font-bold text-sm mb-2">
                ID: {ordinal.id.slice(-12)}
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                {Object.entries(ordinal.traits).map(([cat, trait]) => (
                  <div key={cat} className="truncate">
                    <strong className="text-gray-400">{cat}:</strong> {trait.name}
                  </div>
                ))}
              </div>
            </div>
            </div>
          ))}
        </div>

        {/* Hover Preview */}
        {hoveredOrdinal && hoveredOrdinal.image_url && (
          <div
            ref={hoverRef}
            className="fixed pointer-events-none z-50 border-4 border-[#ff0000] rounded-lg shadow-[0_0_30px_rgba(255,0,0,0.8)] bg-black"
            style={{
              ...getPreviewStyle(),
              width: '400px',
              height: '400px',
              maxWidth: 'calc(100vw - 40px)',
              maxHeight: 'calc(100vh - 40px)',
            }}
          >
            <img
              src={hoveredOrdinal.image_url}
              alt={`Ordinal ${hoveredOrdinal.id} - Large Preview`}
              className="w-full h-full object-contain rounded-lg"
              onError={(e) => {
                e.currentTarget.src = hoveredOrdinal.thumbnail_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23000'/%3E%3Ctext fill='%23ff0000' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-family='monospace'%3ENO IMAGE%3C/text%3E%3C/svg%3E"
              }}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 rounded-b-lg">
              <div className="text-white text-sm font-bold">ID: {hoveredOrdinal.id}</div>
            </div>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-[#8B0000] text-white rounded hover:bg-[#ff0000] hover:shadow-[0_0_15px_rgba(255,0,0,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold"
          >
            Previous
          </button>
          
          <div className="flex gap-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-4 py-2 rounded font-bold transition-all ${
                    currentPage === pageNum
                      ? 'bg-[#ff0000] text-white shadow-[0_0_15px_rgba(255,0,0,0.5)]'
                      : 'bg-[#333] text-[#ff6b6b] hover:bg-[#8B0000] hover:text-white'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-[#8B0000] text-white rounded hover:bg-[#ff0000] hover:shadow-[0_0_15px_rgba(255,0,0,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold"
          >
            Next
          </button>
        </div>
      )}
    </>
  )
}
