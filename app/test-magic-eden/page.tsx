'use client'

import { useState } from 'react'

interface TestResponse {
  success: boolean
  status: number
  statusText: string
  url: string
  method: string
  headers: {
    sent: Record<string, string>
    received: Record<string, string>
  }
  response: any
  responseSize: number
  error?: string
}

const PRESET_ENDPOINTS = [
  {
    name: 'Get Tokens by Owner',
    endpoint: 'tokens?collectionSymbol=the-damned&ownerAddress=bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2&showAll=true',
    method: 'GET'
  },
  {
    name: 'Get Activities - Buying Broadcasted',
    endpoint: 'activities?collectionSymbol=the-damned&ownerAddress=bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2&kind=buying_broadcasted&limit=100',
    method: 'GET'
  },
  {
    name: 'Get Activities - Mint Broadcasted',
    endpoint: 'activities?collectionSymbol=the-damned&ownerAddress=bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2&kind=mint_broadcasted&limit=100',
    method: 'GET'
  },
  {
    name: 'Get Activities - Create',
    endpoint: 'activities?collectionSymbol=the-damned&ownerAddress=bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2&kind=create&limit=100',
    method: 'GET'
  },
  {
    name: 'Get Activities - List',
    endpoint: 'activities?collectionSymbol=the-damned&ownerAddress=bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2&kind=list&limit=100',
    method: 'GET'
  },
  {
    name: 'Get Activities - Delist',
    endpoint: 'activities?collectionSymbol=the-damned&ownerAddress=bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2&kind=delist&limit=100',
    method: 'GET'
  },
  {
    name: 'Get Collection Stats',
    endpoint: 'collections/the-damned/stats',
    method: 'GET'
  },
  {
    name: 'Get Collection Traits',
    endpoint: 'collections/the-damned/traits',
    method: 'GET'
  }
]

export default function TestMagicEdenPage() {
  const [endpoint, setEndpoint] = useState('tokens?collectionSymbol=the-damned&ownerAddress=bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2&showAll=true')
  const [method, setMethod] = useState('GET')
  const [requestBody, setRequestBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<TestResponse | null>(null)
  const [apiKey, setApiKey] = useState('d637ae87-8bfe-4d6a-ac3d-9d563901b444')

  const handleTest = async () => {
    setLoading(true)
    setResponse(null)
    
    try {
      const testBody: any = {
        endpoint,
        method
      }
      
      if (requestBody.trim() && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        try {
          testBody.body = JSON.parse(requestBody)
        } catch {
          testBody.body = requestBody
        }
      }

      const res = await fetch('/api/test-magic-eden', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testBody)
      })

      const data = await res.json()
      setResponse(data)
    } catch (error) {
      setResponse({
        success: false,
        status: 0,
        statusText: 'Error',
        url: '',
        method,
        headers: { sent: {}, received: {} },
        response: null,
        responseSize: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setLoading(false)
    }
  }

  const handlePreset = (preset: typeof PRESET_ENDPOINTS[0]) => {
    setEndpoint(preset.endpoint)
    setMethod(preset.method)
    setRequestBody('')
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-red-600 mb-6 font-mono border-b border-red-600/50 pb-4">
          Magic Eden API Tester
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Side - Input */}
          <div className="space-y-6">
            <div className="bg-black/60 border border-red-600/50 rounded-lg p-6">
              <h2 className="text-xl font-bold text-red-600 mb-4 font-mono">Request Configuration</h2>
              
              {/* API Key Display (Read-only) */}
              <div className="mb-4">
                <label className="block text-sm font-mono text-gray-400 mb-2">API Key (from env)</label>
                <input
                  type="text"
                  value={apiKey}
                  readOnly
                  className="w-full bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">Bearer token is automatically added to requests</p>
              </div>

              {/* Method Select */}
              <div className="mb-4">
                <label className="block text-sm font-mono text-gray-400 mb-2">HTTP Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full bg-black/40 border border-red-600/50 rounded px-3 py-2 text-sm font-mono"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>

              {/* Endpoint Input */}
              <div className="mb-4">
                <label className="block text-sm font-mono text-gray-400 mb-2">
                  Endpoint (path after /v2/ord/btc/)
                </label>
                <textarea
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="w-full bg-black/40 border border-red-600/50 rounded px-3 py-2 text-sm font-mono h-24"
                  placeholder="tokens?collectionSymbol=the-damned&ownerAddress=..."
                />
              </div>

              {/* Request Body (for POST/PUT/PATCH) */}
              {(method === 'POST' || method === 'PUT' || method === 'PATCH') && (
                <div className="mb-4">
                  <label className="block text-sm font-mono text-gray-400 mb-2">Request Body (JSON)</label>
                  <textarea
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="w-full bg-black/40 border border-red-600/50 rounded px-3 py-2 text-sm font-mono h-32"
                    placeholder='{"key": "value"}'
                  />
                </div>
              )}

              {/* Test Button */}
              <button
                onClick={handleTest}
                disabled={loading || !endpoint}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded font-mono transition-all"
              >
                {loading ? 'Testing...' : 'Test Endpoint'}
              </button>
            </div>

            {/* Preset Endpoints */}
            <div className="bg-black/60 border border-red-600/50 rounded-lg p-6">
              <h2 className="text-xl font-bold text-red-600 mb-4 font-mono">Preset Endpoints</h2>
              <div className="space-y-2">
                {PRESET_ENDPOINTS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePreset(preset)}
                    className="w-full text-left bg-black/40 hover:bg-black/60 border border-red-600/30 hover:border-red-600/60 rounded px-4 py-2 text-sm font-mono transition-all"
                  >
                    <div className="text-red-400 font-bold">{preset.name}</div>
                    <div className="text-gray-400 text-xs truncate">{preset.endpoint}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Side - Response */}
          <div className="bg-black/60 border border-red-600/50 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-600 mb-4 font-mono">Response</h2>
            
            {!response && !loading && (
              <div className="text-gray-400 font-mono text-sm text-center py-12">
                Click &quot;Test Endpoint&quot; to see results here
              </div>
            )}

            {loading && (
              <div className="text-red-600 font-mono text-sm text-center py-12 animate-pulse">
                Testing endpoint...
              </div>
            )}

            {response && (
              <div className="space-y-4">
                {/* Status */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-3 py-1 rounded text-sm font-mono font-bold ${
                      response.success 
                        ? 'bg-green-600/80 text-white' 
                        : 'bg-red-600/80 text-white'
                    }`}>
                      {response.status} {response.statusText}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      {response.responseSize.toLocaleString()} bytes
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono break-all">
                    {response.method} {response.url}
                  </div>
                </div>

                {/* Headers */}
                <details className="bg-black/40 rounded p-3 border border-gray-700">
                  <summary className="cursor-pointer text-sm font-mono text-gray-400 hover:text-white">
                    Headers ({Object.keys(response.headers.received).length} received)
                  </summary>
                  <div className="mt-2 space-y-2 text-xs font-mono">
                    <div>
                      <div className="text-green-400 mb-1">Sent Headers:</div>
                      <pre className="bg-black/60 p-2 rounded overflow-auto text-gray-300">
                        {JSON.stringify(response.headers.sent, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-blue-400 mb-1">Received Headers:</div>
                      <pre className="bg-black/60 p-2 rounded overflow-auto text-gray-300 max-h-40">
                        {JSON.stringify(response.headers.received, null, 2)}
                      </pre>
                    </div>
                  </div>
                </details>

                {/* Error */}
                {response.error && (
                  <div className="bg-red-900/30 border border-red-600 rounded p-3">
                    <div className="text-red-400 font-mono text-sm font-bold mb-1">Error:</div>
                    <div className="text-red-300 font-mono text-xs">{response.error}</div>
                  </div>
                )}

                {/* Response Body */}
                <details open className="bg-black/40 rounded p-3 border border-gray-700">
                  <summary className="cursor-pointer text-sm font-mono text-gray-400 hover:text-white mb-2">
                    Response Body
                  </summary>
                  <pre className="bg-black/60 p-3 rounded overflow-auto text-xs font-mono text-gray-300 max-h-96">
                    {JSON.stringify(response.response, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-black/40 border border-yellow-600/50 rounded-lg p-4">
          <h3 className="text-yellow-400 font-mono font-bold mb-2">📝 How to Use</h3>
          <ul className="text-sm text-gray-300 font-mono space-y-1">
            <li>• The endpoint should be the path after <code className="text-yellow-400">/v2/ord/btc/</code></li>
            <li>• Bearer token is automatically added from <code className="text-yellow-400">NEXT_PUBLIC_MAGIC_EDEN_API_KEY</code></li>
            <li>• Use preset endpoints or create custom ones</li>
            <li>• Full URL will be: <code className="text-yellow-400">https://api-mainnet.magiceden.dev/v2/ord/btc/</code> + your endpoint</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

