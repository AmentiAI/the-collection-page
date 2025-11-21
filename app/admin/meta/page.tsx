'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Download, RefreshCw } from 'lucide-react'

type MetadataResponse = {
  success: boolean
  totalOriginal?: number
  totalBurned?: number
  totalUnburned?: number
  metadata?: Array<{
    id: string
    meta: {
      name: string
      attributes: Array<{
        trait_type: string
        value: string
      }>
    }
  }>
  error?: string
}

export default function MetaGeneratorPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<MetadataResponse | null>(null)
  const [metadataJson, setMetadataJson] = useState('')

  const generateMetadata = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/admin/meta', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Failed to generate metadata (${response.status})`)
      }

      const result: MetadataResponse = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate metadata')
      }

      setData(result)
      
      // Format the metadata as JSON for the textarea
      if (result.metadata) {
        setMetadataJson(JSON.stringify(result.metadata, null, 2))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate metadata.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const downloadJson = useCallback(() => {
    if (!metadataJson) return

    const blob = new Blob([metadataJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `damned-metadata-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [metadataJson])

  const copyToClipboard = useCallback(() => {
    if (!metadataJson) return
    
    navigator.clipboard.writeText(metadataJson)
      .then(() => alert('Metadata copied to clipboard!'))
      .catch(() => alert('Failed to copy to clipboard'))
  }, [metadataJson])

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-red-500">Metadata Generator</h1>
        <p className="text-gray-400 mb-8">
          Generate metadata for The Damned collection, excluding burned inscriptions
        </p>

        <div className="mb-6 flex gap-4">
          <Button
            onClick={generateMetadata}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Generate Metadata
              </>
            )}
          </Button>

          {metadataJson && (
            <>
              <Button
                onClick={downloadJson}
                variant="outline"
                className="border-red-600 text-red-500 hover:bg-red-950"
              >
                <Download className="mr-2 h-4 w-4" />
                Download JSON
              </Button>
              
              <Button
                onClick={copyToClipboard}
                variant="outline"
                className="border-red-600 text-red-500 hover:bg-red-950"
              >
                Copy to Clipboard
              </Button>
            </>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-600 rounded text-red-400">
            <strong>Error:</strong> {error}
          </div>
        )}

        {data && (
          <div className="mb-6 p-4 bg-gray-900 rounded border border-gray-700">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Total Original:</span>
                <span className="ml-2 font-bold text-white">{data.totalOriginal}</span>
              </div>
              <div>
                <span className="text-gray-400">Total Burned:</span>
                <span className="ml-2 font-bold text-red-500">{data.totalBurned}</span>
              </div>
              <div>
                <span className="text-gray-400">Total Unburned:</span>
                <span className="ml-2 font-bold text-green-500">{data.totalUnburned}</span>
              </div>
            </div>
          </div>
        )}

        {metadataJson && (
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Generated Metadata JSON:
            </label>
            <textarea
              value={metadataJson}
              readOnly
              className="w-full h-[600px] p-4 bg-gray-900 border border-gray-700 rounded font-mono text-sm text-gray-300 resize-none"
              spellCheck={false}
            />
          </div>
        )}

        {!metadataJson && !loading && (
          <div className="text-center py-12 text-gray-500">
            Click &quot;Generate Metadata&quot; to create the metadata JSON excluding burned inscriptions
          </div>
        )}
      </div>
    </div>
  )
}

