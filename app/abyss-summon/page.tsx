'use client'

import Header from '@/components/Header'

export default function AbyssSummonPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header showMusicControls={true} />
      
      <div className="container mx-auto px-4 py-20 max-w-4xl">
        <div className="text-center">
          <div className="mx-auto max-w-2xl rounded-3xl border-2 border-red-600/80 bg-black/95 p-12 shadow-[0_0_80px_rgba(220,38,38,0.8)]">
            <h1 className="text-3xl font-black uppercase tracking-[0.4em] text-red-200 mb-8 md:text-4xl">
              Access Denied
          </h1>
            <p className="text-lg font-mono uppercase tracking-[0.3em] text-red-300/90 leading-relaxed">
              Unnatural offerings to the abyss have caused a disruption....whispers of the horde block all concentration.
            </p>
              </div>
            </div>
          </div>
    </div>
  )
}
