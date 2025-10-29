'use client'

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h2 className="text-6xl font-bold text-[#ff0000] mb-4">404</h2>
        <h3 className="text-2xl font-bold text-[#ff6b6b] mb-4">Page Not Found</h3>
        <p className="text-[#ff6b6b] mb-6">
          The page you&apos;re looking for doesn&apos;t exist in The Damned collection.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-[#8B0000] text-white rounded hover:bg-[#ff0000] font-bold uppercase transition-all"
        >
          Return to Collection
        </Link>
      </div>
    </div>
  )
}

