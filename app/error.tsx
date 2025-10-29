'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h2 className="text-4xl font-bold text-[#ff0000] mb-4">Something went wrong!</h2>
        <p className="text-[#ff6b6b] mb-6">{error.message || 'An unexpected error occurred'}</p>
        <button
          onClick={() => reset()}
          className="px-6 py-3 bg-[#8B0000] text-white rounded hover:bg-[#ff0000] font-bold uppercase transition-all"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

