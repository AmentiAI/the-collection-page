'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Loader2, Trash2, ChevronLeft, ChevronRight, Edit2, X, Save } from 'lucide-react'

type MintQueueRecord = {
  id: string
  limbo_id: string | null
  wallet_address: string
  image_url: string
  image_blob_url: string | null
  source_inscription_id: string
  generation_prompt: string | null
  created_at: string
}

type EditingRecord = {
  id: string
  image_blob_url: string
  generation_prompt: string
}

type MissingProfileWallet = {
  wallet_address: string
  count: number
  has_mint_queue: boolean
}

export default function AscendedQueueAdminPage() {
  const [loading, setLoading] = useState(false)
  const [missingWallets, setMissingWallets] = useState<MissingProfileWallet[]>([])
  const [mintQueue, setMintQueue] = useState<MintQueueRecord[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditingRecord | null>(null)
  const [saving, setSaving] = useState(false)

  const LIMIT = 10

  const loadMissingWallets = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/ascended-queue/missing-wallets', {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Failed to load missing wallets')
      const data = await response.json()
      setMissingWallets(data.wallets || [])
    } catch (error) {
      console.error('Failed to load missing wallets:', error)
      alert('Failed to load missing wallets')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMintQueue = useCallback(async (page: number) => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/admin/ascended-queue/mint-queue?page=${page}&limit=${LIMIT}`,
        { cache: 'no-store' }
      )
      if (!response.ok) throw new Error('Failed to load mint queue')
      const data = await response.json()
      setMintQueue(data.records || [])
      setTotalRecords(data.total || 0)
      setTotalPages(Math.ceil((data.total || 0) / LIMIT))
    } catch (error) {
      console.error('Failed to load mint queue:', error)
      alert('Failed to load mint queue')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleCreateMissingProfiles = useCallback(async () => {
    if (!confirm('Create profiles for all missing wallets?')) return
    
    setCreating(true)
    try {
      const response = await fetch('/api/admin/ascended-queue/create-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error('Failed to create profiles')
      const data = await response.json()
      alert(`Created ${data.created} profiles`)
      await loadMissingWallets()
    } catch (error) {
      console.error('Failed to create profiles:', error)
      alert('Failed to create profiles')
    } finally {
      setCreating(false)
    }
  }, [loadMissingWallets])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this mint queue entry?')) return
    
    setDeleting(id)
    try {
      const response = await fetch(`/api/admin/ascended-queue/mint-queue/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete')
      await loadMintQueue(currentPage)
    } catch (error) {
      console.error('Failed to delete:', error)
      alert('Failed to delete record')
    } finally {
      setDeleting(null)
    }
  }, [currentPage, loadMintQueue])

  const handleEdit = useCallback((record: MintQueueRecord) => {
    setEditing(record.id)
    setEditForm({
      id: record.id,
      image_blob_url: record.image_blob_url || '',
      generation_prompt: record.generation_prompt || '',
    })
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditing(null)
    setEditForm(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!editForm) return
    
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/ascended-queue/mint-queue/${editForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_blob_url: editForm.image_blob_url,
          generation_prompt: editForm.generation_prompt,
        }),
      })
      if (!response.ok) throw new Error('Failed to update')
      await loadMintQueue(currentPage)
      setEditing(null)
      setEditForm(null)
    } catch (error) {
      console.error('Failed to save:', error)
      alert('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }, [editForm, currentPage, loadMintQueue])

  useEffect(() => {
    void loadMissingWallets()
    void loadMintQueue(1)
  }, [loadMissingWallets, loadMintQueue])

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold uppercase tracking-wider text-amber-200">
          Ascended Queue Admin
        </h1>

        {/* Missing Profiles Section */}
        <section className="rounded-xl border border-red-500/40 bg-red-950/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold uppercase tracking-wide text-red-200">
              Wallets Missing Profiles
            </h2>
            {missingWallets.length > 0 && (
              <Button
                onClick={handleCreateMissingProfiles}
                disabled={creating || loading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  `Create ${missingWallets.length} Profiles`
                )}
              </Button>
            )}
          </div>
          
          {loading && missingWallets.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-red-400" />
            </div>
          ) : missingWallets.length === 0 ? (
            <p className="text-red-300/70 text-sm">✓ All wallets have profiles</p>
          ) : (
            <div className="space-y-2">
              {missingWallets.map((wallet) => (
                <div
                  key={wallet.wallet_address}
                  className="flex justify-between items-center bg-red-900/30 border border-red-500/20 rounded p-3"
                >
                  <div className="flex items-center gap-3">
                    <code className="text-sm text-red-200">{wallet.wallet_address}</code>
                    {wallet.has_mint_queue && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">
                        Has Mint Queue
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-red-300/70">
                    {wallet.count} burn{wallet.count !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Mint Queue Section */}
        <section className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold uppercase tracking-wide text-amber-200">
              Mint Queue Records ({totalRecords})
            </h2>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  setCurrentPage(1)
                  void loadMintQueue(1)
                }}
                disabled={loading}
                variant="outline"
                className="border-amber-500/50 text-amber-200 text-sm px-3 py-1.5"
              >
                Refresh
              </Button>
            </div>
          </div>

          {loading && mintQueue.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
            </div>
          ) : mintQueue.length === 0 ? (
            <p className="text-amber-300/70 text-sm">No records found</p>
          ) : (
            <>
              <div className="space-y-4">
                {mintQueue.map((record) => {
                  const isEditing = editing === record.id
                  
                  return (
                    <div
                      key={record.id}
                      className="border border-amber-500/30 rounded-lg bg-amber-950/10 p-4"
                    >
                      <div className="flex gap-4">
                        {/* Image */}
                        <div className="flex-shrink-0">
                          {isEditing && editForm ? (
                            <div className="space-y-2">
                              <div className="w-32 h-32 border border-amber-500/30 rounded overflow-hidden bg-black/50 flex items-center justify-center">
                                {editForm.image_blob_url ? (
                                  <Image
                                    src={editForm.image_blob_url}
                                    alt="Preview"
                                    width={128}
                                    height={128}
                                    className="object-cover"
                                  />
                                ) : (
                                  <span className="text-xs text-amber-300/50">No image</span>
                                )}
                              </div>
                              <input
                                type="text"
                                value={editForm.image_blob_url}
                                onChange={(e) => setEditForm({ ...editForm, image_blob_url: e.target.value })}
                                placeholder="Image URL"
                                className="w-32 px-2 py-1 text-xs bg-black border border-amber-500/30 rounded text-amber-200"
                              />
                            </div>
                          ) : record.image_blob_url ? (
                            <Image
                              src={record.image_blob_url}
                              alt="Mint queue"
                              width={128}
                              height={128}
                              className="rounded border border-amber-500/20 object-cover"
                            />
                          ) : (
                            <div className="w-32 h-32 border border-amber-500/30 rounded bg-black/50 flex items-center justify-center">
                              <span className="text-xs text-amber-300/50">No image</span>
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div>
                                <span className="text-xs text-amber-300/70 uppercase">Wallet:</span>
                                <code className="ml-2 text-xs text-amber-200">
                                  {record.wallet_address}
                                </code>
                              </div>
                              <div>
                                <span className="text-xs text-amber-300/70 uppercase">Source:</span>
                                <code className="ml-2 text-xs text-amber-200">
                                  {record.source_inscription_id}
                                </code>
                              </div>
                              <div>
                                <span className="text-xs text-amber-300/70 uppercase">Created:</span>
                                <span className="ml-2 text-xs text-amber-200">
                                  {new Date(record.created_at).toLocaleString()}
                                </span>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              {isEditing ? (
                                <>
                                  <Button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5"
                                  >
                                    {saving ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    onClick={handleCancelEdit}
                                    disabled={saving}
                                    className="text-amber-300 text-sm px-3 py-1.5 bg-transparent hover:bg-amber-900/30"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    onClick={() => handleEdit(record)}
                                    className="text-blue-400 hover:text-blue-300 text-sm px-3 py-1.5 bg-transparent hover:bg-blue-900/30"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={() => handleDelete(record.id)}
                                    disabled={deleting === record.id}
                                    className="text-red-400 hover:text-red-300 text-sm px-3 py-1.5 bg-transparent hover:bg-red-900/30"
                                  >
                                    {deleting === record.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Prompt - only show when editing */}
                          {isEditing && editForm && (
                            <div>
                              <span className="text-xs text-amber-300/70 uppercase">Generation Prompt:</span>
                              <textarea
                                value={editForm.generation_prompt}
                                onChange={(e) => setEditForm({ ...editForm, generation_prompt: e.target.value })}
                                placeholder="Generation prompt..."
                                rows={6}
                                className="mt-1 w-full px-3 py-2 text-xs bg-black border border-amber-500/30 rounded text-amber-200 font-mono resize-none"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-amber-500/20">
                  <p className="text-xs text-amber-300/70">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const newPage = currentPage - 1
                        setCurrentPage(newPage)
                        void loadMintQueue(newPage)
                      }}
                      disabled={currentPage === 1 || loading}
                      variant="outline"
                      className="border-amber-500/50 text-amber-200 text-sm px-3 py-1.5"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => {
                        const newPage = currentPage + 1
                        setCurrentPage(newPage)
                        void loadMintQueue(newPage)
                      }}
                      disabled={currentPage === totalPages || loading}
                      variant="outline"
                      className="border-amber-500/50 text-amber-200 text-sm px-3 py-1.5"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

