'use client'

import Header from '@/components/Header'
import Image from 'next/image'

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
            <p className="text-lg font-mono uppercase tracking-[0.3em] text-red-300/90 leading-relaxed mb-8">
              Unnatural offerings to the abyss have caused a disruption....whispers of the horde block all concentration.
            </p>
            <div className="mt-8 flex justify-center">
              <Image
                src="https://zw1fxeadkfnoi8cq.public.blob.vercel-storage.com/mega-monsters/mega-1764602186267.png"
                alt="Mega Monster"
                width={600}
                height={600}
                className="rounded-lg border border-red-600/40 shadow-[0_0_40px_rgba(220,38,38,0.5)]"
                unoptimized
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
