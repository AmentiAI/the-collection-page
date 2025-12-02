'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Loader2, Trash2, ChevronLeft, ChevronRight, Edit2, X, Save, Sparkles, Plus, Zap, Upload } from 'lucide-react'

type MegaMonster = {
  id: string
  wallet_address: string | null
  inscription_id: string | null
  commit_txid: string | null
  broadcast_txid: string | null
  prompt: string
  name: string | null
  image_data: string | null
  image_blob_url: string | null
  full_body_image_blob_url: string | null
  created_at: string
  updated_at: string
}

type EditingRecord = {
  id: string
  wallet_address: string
  inscription_id: string
  commit_txid: string
  broadcast_txid: string
  prompt: string
  name: string
}

export default function MegaMonstersAdminPage() {
  const [loading, setLoading] = useState(false)
  const [monsters, setMonsters] = useState<MegaMonster[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditingRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [generatingFullBody, setGeneratingFullBody] = useState<string | null>(null)
  const [uploadingFullBody, setUploadingFullBody] = useState<string | null>(null)
  const [fileInputs, setFileInputs] = useState<Map<string, HTMLInputElement | null>>(new Map())
  const [regenerateComparison, setRegenerateComparison] = useState<{
    recordId: string
    originalImageUrl: string
    regeneratedImageUrl: string
    regeneratedImageBlobUrl: string
  } | null>(null)
  const [applyingRegenerate, setApplyingRegenerate] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({
    wallet_address: '',
    inscription_id: '',
    commit_txid: '',
    broadcast_txid: '',
    prompt: '',
    name: '',
  })
  const [creating, setCreating] = useState(false)

  const LIMIT = 10

  const loadMonsters = useCallback(async (page: number) => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/admin/megamonsters?page=${page}&limit=${LIMIT}`,
        { cache: 'no-store' }
      )
      if (!response.ok) throw new Error('Failed to load mega monsters')
      const data = await response.json()
      setMonsters(data.records || [])
      setTotalRecords(data.total || 0)
      setTotalPages(Math.ceil((data.total || 0) / LIMIT))
    } catch (error) {
      console.error('Failed to load mega monsters:', error)
      alert('Failed to load mega monsters')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleCreate = useCallback(async () => {
    if (!createForm.prompt.trim()) {
      alert('Prompt is required')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/admin/megamonsters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })

      if (!response.ok) throw new Error('Failed to create mega monster')
      
      const data = await response.json()
      
      // Reset form and close
      setCreateForm({
        wallet_address: '',
        inscription_id: '',
        commit_txid: '',
        broadcast_txid: '',
        prompt: '',
        name: '',
      })
      setShowCreateForm(false)
      
      // Reload the first page to show the new record
      await loadMonsters(1)
      setCurrentPage(1)
    } catch (error) {
      console.error('Failed to create mega monster:', error)
      alert('Failed to create mega monster')
    } finally {
      setCreating(false)
    }
  }, [createForm, loadMonsters])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this mega monster?')) return
    
    setDeleting(id)
    try {
      const response = await fetch(`/api/admin/megamonsters/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete')
      await loadMonsters(currentPage)
    } catch (error) {
      console.error('Failed to delete:', error)
      alert('Failed to delete record')
    } finally {
      setDeleting(null)
    }
  }, [currentPage, loadMonsters])

  const handleEdit = useCallback((record: MegaMonster) => {
    setEditing(record.id)
    setEditForm({
      id: record.id,
      wallet_address: record.wallet_address || '',
      inscription_id: record.inscription_id || '',
      commit_txid: record.commit_txid || '',
      broadcast_txid: record.broadcast_txid || '',
      prompt: record.prompt,
      name: record.name || '',
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
      const response = await fetch(`/api/admin/megamonsters/${editForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: editForm.wallet_address || null,
          inscription_id: editForm.inscription_id || null,
          commit_txid: editForm.commit_txid || null,
          broadcast_txid: editForm.broadcast_txid || null,
          prompt: editForm.prompt,
          name: editForm.name || null,
        }),
      })
      if (!response.ok) throw new Error('Failed to update')
      await loadMonsters(currentPage)
      setEditing(null)
      setEditForm(null)
    } catch (error) {
      console.error('Failed to save:', error)
      alert('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }, [editForm, currentPage, loadMonsters])

  const handleGenerate = useCallback(async (record: MegaMonster) => {
    if (generating || !record.prompt) {
      if (!record.prompt) {
        alert('No prompt available for this record')
      }
      return
    }

    setGenerating(record.id)
    try {
      const response = await fetch(
        `/api/admin/megamonsters/${record.id}/generate`,
        {
          method: 'POST',
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate image')
      }

      // Reload to show the new image
      await loadMonsters(currentPage)
      alert('Image generated successfully!')
    } catch (error) {
      console.error('Failed to generate:', error)
      alert(error instanceof Error ? error.message : 'Failed to generate image')
    } finally {
      setGenerating(null)
    }
  }, [generating, currentPage, loadMonsters])

  const handleGenerateFullBody = useCallback(async (record: MegaMonster) => {
    if (generatingFullBody || !record.prompt) {
      if (!record.prompt) {
        alert('No prompt available for this record')
      }
      return
    }

    setGeneratingFullBody(record.id)
    try {
      const response = await fetch(
        `/api/admin/megamonsters/${record.id}/generate-fullbody`,
        {
          method: 'POST',
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate full body image')
      }

      // Reload to show the new full body image
      await loadMonsters(currentPage)
      alert('Full body image generated successfully!')
    } catch (error) {
      console.error('Failed to generate full body:', error)
      alert(error instanceof Error ? error.message : 'Failed to generate full body image')
    } finally {
      setGeneratingFullBody(null)
    }
  }, [generatingFullBody, currentPage, loadMonsters])

  const handleUploadFullBody = useCallback(async (record: MegaMonster, file: File) => {
    if (uploadingFullBody) return

    setUploadingFullBody(record.id)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(
        `/api/admin/megamonsters/${record.id}/upload-fullbody`,
        {
          method: 'POST',
          body: formData,
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload full body image')
      }

      // Reload to show the new full body image
      await loadMonsters(currentPage)
      alert('Full body image uploaded successfully!')
    } catch (error) {
      console.error('Failed to upload full body:', error)
      alert(error instanceof Error ? error.message : 'Failed to upload full body image')
    } finally {
      setUploadingFullBody(null)
    }
  }, [uploadingFullBody, currentPage, loadMonsters])

  const handleFileInputChange = useCallback((record: MegaMonster, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleUploadFullBody(record, file)
    }
    // Reset input
    event.target.value = ''
  }, [handleUploadFullBody])

  const handleRegenerate = useCallback(async (record: MegaMonster) => {
    if (regenerating || !record.prompt) {
      if (!record.prompt) {
        alert('No generation prompt available for this record')
      }
      return
    }

    setRegenerating(record.id)
    try {
      const response = await fetch(
        `/api/admin/megamonsters/${record.id}/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: record.prompt }),
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to regenerate image')
      }

      // Show comparison modal
      setRegenerateComparison({
        recordId: record.id,
        originalImageUrl: record.image_blob_url || record.image_data || '',
        regeneratedImageUrl: data.regeneratedImageUrl,
        regeneratedImageBlobUrl: data.regeneratedImageBlobUrl,
      })
    } catch (error) {
      console.error('Failed to regenerate:', error)
      alert(error instanceof Error ? error.message : 'Failed to regenerate image')
    } finally {
      setRegenerating(null)
    }
  }, [regenerating])

  const handleApplyRegenerate = useCallback(async (choice: 'original' | 'regenerated') => {
    if (!regenerateComparison) return

    if (choice === 'original') {
      // User chose to keep original, just close modal
      setRegenerateComparison(null)
      return
    }

    // User chose regenerated, update database
    setApplyingRegenerate(true)
    try {
      const response = await fetch(
        `/api/admin/megamonsters/${regenerateComparison.recordId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_blob_url: regenerateComparison.regeneratedImageBlobUrl,
            image_data: regenerateComparison.regeneratedImageUrl,
          }),
        }
      )

      if (!response.ok) throw new Error('Failed to apply regenerated image')

      setRegenerateComparison(null)
      await loadMonsters(currentPage)
      alert('Regenerated image applied successfully!')
    } catch (error) {
      console.error('Failed to apply regenerated image:', error)
      alert('Failed to apply regenerated image')
    } finally {
      setApplyingRegenerate(false)
    }
  }, [regenerateComparison, currentPage, loadMonsters])

  useEffect(() => {
    void loadMonsters(1)
  }, [loadMonsters])

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage)
    void loadMonsters(newPage)
  }, [loadMonsters])

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-cyan-400 mb-2">Mega Monster Creation</h1>
          <p className="text-gray-400">Generate and manage mega monster images</p>
        </div>

        {/* Create New Button */}
        <div className="mb-6">
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-xl flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Create New Mega Monster
          </Button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <section className="mb-8 rounded-3xl border border-cyan-600/40 bg-black/80 p-6">
            <h2 className="text-2xl font-bold text-cyan-300 mb-4">New Mega Monster</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-cyan-300/70 uppercase mb-1">Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Monster name (optional)"
                  className="w-full px-4 py-2 bg-black border border-cyan-500/30 rounded-lg text-cyan-200 placeholder-cyan-500/30"
                />
              </div>
              <div>
                <label className="block text-sm text-cyan-300/70 uppercase mb-1">Prompt *</label>
                <textarea
                  value={createForm.prompt}
                  onChange={(e) => setCreateForm({ ...createForm, prompt: e.target.value })}
                  placeholder="Describe your mega monster..."
                  className="w-full px-4 py-3 bg-black border border-cyan-500/30 rounded-lg text-cyan-200 placeholder-cyan-500/30 min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-cyan-300/70 uppercase mb-1">Wallet Address</label>
                  <input
                    type="text"
                    value={createForm.wallet_address}
                    onChange={(e) => setCreateForm({ ...createForm, wallet_address: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-4 py-2 bg-black border border-cyan-500/30 rounded-lg text-cyan-200 placeholder-cyan-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-cyan-300/70 uppercase mb-1">Inscription ID (Folder)</label>
                  <input
                    type="text"
                    value={createForm.inscription_id}
                    onChange={(e) => setCreateForm({ ...createForm, inscription_id: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-4 py-2 bg-black border border-cyan-500/30 rounded-lg text-cyan-200 placeholder-cyan-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-cyan-300/70 uppercase mb-1">Commit TXID</label>
                  <input
                    type="text"
                    value={createForm.commit_txid}
                    onChange={(e) => setCreateForm({ ...createForm, commit_txid: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-4 py-2 bg-black border border-cyan-500/30 rounded-lg text-cyan-200 placeholder-cyan-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-cyan-300/70 uppercase mb-1">Broadcast TXID</label>
                  <input
                    type="text"
                    value={createForm.broadcast_txid}
                    onChange={(e) => setCreateForm({ ...createForm, broadcast_txid: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-4 py-2 bg-black border border-cyan-500/30 rounded-lg text-cyan-200 placeholder-cyan-500/30"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={handleCreate}
                  disabled={creating || !createForm.prompt.trim()}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
                </Button>
                <Button
                  onClick={() => {
                    setShowCreateForm(false)
                    setCreateForm({
                      wallet_address: '',
                      inscription_id: '',
                      commit_txid: '',
                      broadcast_txid: '',
                      prompt: '',
                      name: '',
                    })
                  }}
                  className="bg-transparent border border-cyan-500/30 text-cyan-300 px-6 py-2 rounded-lg hover:bg-cyan-900/30"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Monsters List */}
        <section className="rounded-3xl border border-cyan-600/40 bg-black/80 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-cyan-300">
              Mega Monsters ({totalRecords})
            </h2>
            <div className="text-sm text-cyan-300/70">
              Page {currentPage} of {totalPages || 1}
            </div>
          </div>

          {loading && !monsters.length ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            </div>
          ) : monsters.length === 0 ? (
            <div className="text-center py-12 text-cyan-300/50">
              No mega monsters yet. Create one to get started!
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {monsters.map((monster) => {
                  const isEditing = editing === monster.id
                  return (
                    <div
                      key={monster.id}
                      className="flex flex-col md:flex-row gap-4 rounded-2xl border border-cyan-500/30 bg-black/60 p-4"
                    >
                      {/* Image */}
                      <div className="flex-shrink-0">
                        {monster.image_blob_url || monster.image_data ? (
                          <Image
                            src={monster.image_blob_url || monster.image_data || ''}
                            alt="Mega monster"
                            width={200}
                            height={200}
                            className="rounded border border-cyan-500/20 object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-[200px] h-[200px] border border-cyan-500/30 rounded bg-black/50 flex items-center justify-center">
                            <span className="text-xs text-cyan-300/50">No image yet</span>
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 space-y-2">
                        {isEditing ? (
                          <>
                            <div>
                              <label className="block text-xs text-cyan-300/70 uppercase mb-1">Name</label>
                              <input
                                type="text"
                                value={editForm?.name || ''}
                                onChange={(e) => editForm && setEditForm({ ...editForm, name: e.target.value })}
                                placeholder="Monster name (optional)"
                                className="w-full px-3 py-1 text-xs bg-black border border-cyan-500/30 rounded text-cyan-200"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-cyan-300/70 uppercase mb-1">Prompt</label>
                              <textarea
                                value={editForm?.prompt || ''}
                                onChange={(e) => editForm && setEditForm({ ...editForm, prompt: e.target.value })}
                                className="w-full px-3 py-2 text-sm bg-black border border-cyan-500/30 rounded text-cyan-200 min-h-[80px]"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs text-cyan-300/70 uppercase mb-1">Wallet</label>
                                <input
                                  type="text"
                                  value={editForm?.wallet_address || ''}
                                  onChange={(e) => editForm && setEditForm({ ...editForm, wallet_address: e.target.value })}
                                  className="w-full px-3 py-1 text-xs bg-black border border-cyan-500/30 rounded text-cyan-200"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-cyan-300/70 uppercase mb-1">Inscription ID</label>
                                <input
                                  type="text"
                                  value={editForm?.inscription_id || ''}
                                  onChange={(e) => editForm && setEditForm({ ...editForm, inscription_id: e.target.value })}
                                  className="w-full px-3 py-1 text-xs bg-black border border-cyan-500/30 rounded text-cyan-200"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-cyan-300/70 uppercase mb-1">Commit TXID</label>
                                <input
                                  type="text"
                                  value={editForm?.commit_txid || ''}
                                  onChange={(e) => editForm && setEditForm({ ...editForm, commit_txid: e.target.value })}
                                  className="w-full px-3 py-1 text-xs bg-black border border-cyan-500/30 rounded text-cyan-200"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-cyan-300/70 uppercase mb-1">Broadcast TXID</label>
                                <input
                                  type="text"
                                  value={editForm?.broadcast_txid || ''}
                                  onChange={(e) => editForm && setEditForm({ ...editForm, broadcast_txid: e.target.value })}
                                  className="w-full px-3 py-1 text-xs bg-black border border-cyan-500/30 rounded text-cyan-200"
                                />
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            {monster.name && (
                              <div>
                                <span className="text-xs text-cyan-300/70 uppercase">Name:</span>
                                <p className="text-xs text-cyan-200 mt-1 font-bold">{monster.name}</p>
                              </div>
                            )}
                            <div>
                              <span className="text-xs text-cyan-300/70 uppercase">Prompt:</span>
                              <p className="text-xs text-cyan-200 mt-1">{monster.prompt}</p>
                            </div>
                            {monster.wallet_address && (
                              <div>
                                <span className="text-xs text-cyan-300/70 uppercase">Wallet:</span>
                                <code className="ml-2 text-xs text-cyan-200">{monster.wallet_address}</code>
                              </div>
                            )}
                            {monster.inscription_id && (
                              <div>
                                <span className="text-xs text-cyan-300/70 uppercase">Inscription ID:</span>
                                <code className="ml-2 text-xs text-cyan-200">{monster.inscription_id}</code>
                              </div>
                            )}
                            {monster.commit_txid && (
                              <div>
                                <span className="text-xs text-cyan-300/70 uppercase">Commit:</span>
                                <code className="ml-2 text-xs text-cyan-200">{monster.commit_txid}</code>
                              </div>
                            )}
                            {monster.broadcast_txid && (
                              <div>
                                <span className="text-xs text-cyan-300/70 uppercase">Broadcast:</span>
                                <code className="ml-2 text-xs text-cyan-200">{monster.broadcast_txid}</code>
                              </div>
                            )}
                            <div>
                              <span className="text-xs text-cyan-300/70 uppercase">Created:</span>
                              <span className="ml-2 text-xs text-cyan-200">
                                {new Date(monster.created_at).toLocaleString()}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex md:flex-col gap-2">
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
                              className="text-cyan-300 text-sm px-3 py-1.5 bg-transparent hover:bg-cyan-900/30"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            {!monster.image_blob_url && !monster.image_data ? (
                              <Button
                                onClick={() => handleGenerate(monster)}
                                disabled={generating === monster.id}
                                className="text-green-400 hover:text-green-300 text-sm px-3 py-1.5 bg-transparent hover:bg-green-900/30"
                                title="Generate image"
                              >
                                {generating === monster.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Zap className="h-4 w-4" />
                                )}
                              </Button>
                            ) : (
                              <>
                                <Button
                                  onClick={() => handleRegenerate(monster)}
                                  disabled={regenerating === monster.id || !monster.prompt}
                                  className="text-purple-400 hover:text-purple-300 text-sm px-3 py-1.5 bg-transparent hover:bg-purple-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={!monster.prompt ? 'No generation prompt available' : 'Regenerate image'}
                                >
                                  {regenerating === monster.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4" />
                                  )}
                                </Button>
                                <div className="relative">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    id={`fullbody-upload-${monster.id}`}
                                    onChange={(e) => handleFileInputChange(monster, e)}
                                    ref={(el) => {
                                      const map = new Map(fileInputs)
                                      map.set(monster.id, el)
                                      setFileInputs(map)
                                    }}
                                  />
                                  <Button
                                    onClick={() => {
                                      const input = fileInputs.get(monster.id)
                                      if (input) {
                                        input.click()
                                      }
                                    }}
                                    disabled={uploadingFullBody === monster.id}
                                    className="text-orange-400 hover:text-orange-300 text-sm px-3 py-1.5 bg-transparent hover:bg-orange-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Upload full body image"
                                  >
                                    {uploadingFullBody === monster.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Upload className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </>
                            )}
                            <Button
                              onClick={() => handleEdit(monster)}
                              className="text-blue-400 hover:text-blue-300 text-sm px-3 py-1.5 bg-transparent hover:bg-blue-900/30"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() => handleDelete(monster.id)}
                              disabled={deleting === monster.id}
                              className="text-red-400 hover:text-red-300 text-sm px-3 py-1.5 bg-transparent hover:bg-red-900/30"
                            >
                              {deleting === monster.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-4">
                  <Button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                    variant="outline"
                    className="border-cyan-500/50 text-cyan-200 text-sm px-3 py-1.5"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-cyan-200 text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || loading}
                    variant="outline"
                    className="border-cyan-500/50 text-cyan-200 text-sm px-3 py-1.5"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Regenerate Comparison Modal */}
        {regenerateComparison && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/90 p-4 overflow-y-auto">
            <div className="relative max-w-5xl rounded-3xl border border-cyan-500/60 bg-black/95 p-6 my-4 w-full shadow-[0_0_50px_rgba(34,211,238,0.5)]">
              <h2 className="mb-6 text-center text-2xl font-mono uppercase tracking-[0.3em] text-cyan-200">
                Choose Your Image
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Original Image */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-center text-sm font-mono uppercase tracking-[0.3em] text-cyan-300">
                    Original
                  </h3>
                  <div className="aspect-square overflow-hidden rounded-2xl border border-cyan-500/40">
                    <Image
                      src={regenerateComparison.originalImageUrl}
                      alt="Original mega monster"
                      width={512}
                      height={512}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  </div>
                  <Button
                    onClick={() => handleApplyRegenerate('original')}
                    disabled={applyingRegenerate}
                    className="w-full rounded-full border border-cyan-500/60 bg-cyan-600/30 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-cyan-100 transition hover:bg-cyan-600/45 disabled:opacity-50"
                  >
                    {applyingRegenerate ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      'Keep Original'
                    )}
                  </Button>
                </div>

                {/* Regenerated Image */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-center text-sm font-mono uppercase tracking-[0.3em] text-purple-300">
                    Regenerated
                  </h3>
                  <div className="aspect-square overflow-hidden rounded-2xl border border-purple-500/40">
                    <Image
                      src={regenerateComparison.regeneratedImageUrl}
                      alt="Regenerated mega monster"
                      width={512}
                      height={512}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  </div>
                  <Button
                    onClick={() => handleApplyRegenerate('regenerated')}
                    disabled={applyingRegenerate}
                    className="w-full rounded-full border border-purple-500/60 bg-purple-600/30 px-4 py-3 text-sm font-mono uppercase tracking-[0.3em] text-purple-100 transition hover:bg-purple-600/45 disabled:opacity-50"
                  >
                    {applyingRegenerate ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      'Use Regenerated'
                    )}
                  </Button>
                </div>
              </div>

              <p className="text-center text-xs uppercase tracking-[0.3em] text-cyan-200/60">
                Choose which version to keep
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

