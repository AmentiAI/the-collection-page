'use client'

import { Ordinal } from '@/types'

interface ModalProps {
  ordinal: Ordinal
  onClose: () => void
}

export default function Modal({ ordinal, onClose }: ModalProps) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[rgba(10,10,10,0.98)] border-[3px] border-[#8B0000] rounded-lg p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto relative shadow-[0_0_50px_rgba(139,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#ff6b6b] text-3xl font-bold hover:text-[#ff0000] hover:drop-shadow-[0_0_10px_#ff0000] transition-all"
        >
          ×
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <img
              src={ordinal.image_url}
              alt={`Ordinal ${ordinal.id}`}
              className="w-full rounded-lg border-2 border-[#8B0000]"
            />
          </div>

          <div>
            <h2 className="text-3xl text-[#ff0000] mb-6 font-bold uppercase tracking-wider drop-shadow-[0_0_10px_#ff0000]">
              Ordinal ID: {ordinal.id.slice(-12)}
            </h2>

            <div className="space-y-6">
              {Object.entries(ordinal.traits).map(([category, trait]) => (
                <div key={category} className="mb-6">
                  <h3 className="text-[#ff6b6b] text-lg font-bold uppercase mb-2">
                    {category}
                  </h3>
                  <div className="text-[#e0e0e0] text-sm p-3 bg-[rgba(139,0,0,0.1)] border-l-[3px] border-[#ff0000]">
                    <div className="font-bold">{trait.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
