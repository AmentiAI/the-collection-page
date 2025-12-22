'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Search, Edit2, Save, X, ChevronLeft, ChevronRight, Filter, ArrowUpDown, Plus, Trash2 } from 'lucide-react'

type Collection = {
  id: string
  lp_public_key: string
  network: string | null
  host_name: string | null
  host_namespace: string | null
  curve_type: string | null
  asset_a_address: string | null
  asset_b_address: string | null
  asset_a_name: string | null
  asset_b_name: string | null
  asset_a_symbol: string | null
  asset_b_symbol: string | null
  asset_a_decimals: number | null
  asset_b_decimals: number | null
  asset_a_reserve: number | null
  asset_b_reserve: number | null
  tvl_asset_b: number | null
  volume_24h_asset_b: number | null
  price_change_percent_24h: number | null
  current_price_a_in_b: number | null
  lp_fee_bps: number | null
  host_fee_bps: number | null
  created_at: string | null
  updated_at: string | null
  last_synced_at: string | null
}

type EditingRecord = {
  id: string
  [key: string]: any
}

export default function LaunchpadAdminPage() {
  const [loading, setLoading] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditingRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(false)

  const LIMIT = 50

  const getAdminHeaders = useCallback(() => {
    const headers: Record<string, string> = {}
    // Note: Admin token should be set via environment variable
    // For client-side, we'll rely on server-side validation
    return headers
  }, [])

  const loadCollections = useCallback(async (page: number, search?: string, sort?: { column: string; direction: 'asc' | 'desc' }, filterValues?: Record<string, string>) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: LIMIT.toString(),
      })
      if (search) {
        params.set('search', search)
      }
      if (sort?.column) {
        params.set('sortColumn', sort.column)
        params.set('sortDirection', sort.direction)
      }
      if (filterValues) {
        Object.entries(filterValues).forEach(([key, value]) => {
          if (value) {
            params.set(`filter_${key}`, value)
          }
        })
      }

      const response = await fetch(
        `/api/admin/launchpad/collections?${params.toString()}`,
        { 
          cache: 'no-store',
          headers: getAdminHeaders()
        }
      )
      if (!response.ok) throw new Error('Failed to load collections')
      const data = await response.json()
      setCollections(data.records || [])
      setTotalRecords(data.total || 0)
      setTotalPages(data.totalPages || 1)
    } catch (error) {
      console.error('Failed to load collections:', error)
      alert('Failed to load collections')
    } finally {
      setLoading(false)
    }
  }, [getAdminHeaders])

  const handleEdit = useCallback((collection: Collection) => {
    setEditing(collection.id)
    setEditForm({ ...collection })
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditing(null)
    setEditForm(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!editForm) return
    
    setSaving(true)
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...getAdminHeaders()
      }
      const response = await fetch(`/api/admin/launchpad/collections/${editForm.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(editForm),
      })
      if (!response.ok) throw new Error('Failed to update')
      await loadCollections(currentPage, searchTerm, sortColumn ? { column: sortColumn, direction: sortDirection } : undefined, filters)
      setEditing(null)
      setEditForm(null)
    } catch (error) {
      console.error('Failed to save:', error)
      alert('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }, [editForm, currentPage, searchTerm, sortColumn, sortDirection, filters, loadCollections, getAdminHeaders])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this collection?')) return
    
    setDeleting(id)
    try {
      const response = await fetch(`/api/admin/launchpad/collections/${id}`, {
        method: 'DELETE',
        headers: getAdminHeaders()
      })
      if (!response.ok) throw new Error('Failed to delete')
      await loadCollections(currentPage, searchTerm, sortColumn ? { column: sortColumn, direction: sortDirection } : undefined, filters)
    } catch (error) {
      console.error('Failed to delete:', error)
      alert('Failed to delete record')
    } finally {
      setDeleting(null)
    }
  }, [currentPage, searchTerm, sortColumn, sortDirection, filters, loadCollections, getAdminHeaders])

  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }, [sortColumn, sortDirection])

  useEffect(() => {
    void loadCollections(currentPage, searchTerm, sortColumn ? { column: sortColumn, direction: sortDirection } : undefined, filters)
  }, [currentPage, searchTerm, sortColumn, sortDirection, filters, loadCollections])

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage)
  }, [])

  // Get all column names from the first collection
  const columns = collections.length > 0 ? Object.keys(collections[0]) : []

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-cyan-400 mb-2">Launchpad Collections Editor</h1>
          <p className="text-gray-400">phpMyAdmin-style editor for flashnet_pools (collections) table</p>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search across all fields..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-10 bg-black border-cyan-500/30 text-cyan-200"
              />
            </div>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant="outline"
              className="border-cyan-500/50 text-cyan-300"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-black/60 border border-cyan-500/30 rounded-lg">
              <div>
                <label className="block text-xs text-cyan-300/70 uppercase mb-1">Host Name</label>
                <Input
                  type="text"
                  value={filters.host_name || ''}
                  onChange={(e) => setFilters({ ...filters, host_name: e.target.value })}
                  className="w-full px-2 py-1 text-xs bg-black border border-cyan-500/30 rounded text-cyan-200"
                  placeholder="Filter by host..."
                />
              </div>
              <div>
                <label className="block text-xs text-cyan-300/70 uppercase mb-1">Asset A Symbol</label>
                <Input
                  type="text"
                  value={filters.asset_a_symbol || ''}
                  onChange={(e) => setFilters({ ...filters, asset_a_symbol: e.target.value })}
                  className="w-full px-2 py-1 text-xs bg-black border border-cyan-500/30 rounded text-cyan-200"
                  placeholder="Filter by symbol..."
                />
              </div>
              <div>
                <label className="block text-xs text-cyan-300/70 uppercase mb-1">Network</label>
                <Input
                  type="text"
                  value={filters.network || ''}
                  onChange={(e) => setFilters({ ...filters, network: e.target.value })}
                  className="w-full px-2 py-1 text-xs bg-black border border-cyan-500/30 rounded text-cyan-200"
                  placeholder="Filter by network..."
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => {
                    setFilters({})
                    setCurrentPage(1)
                  }}
                  variant="outline"
                  className="w-full border-red-500/50 text-red-300 text-xs"
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Collections Table */}
        <section className="rounded-3xl border border-cyan-600/40 bg-black/80 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-cyan-300">
              Collections ({totalRecords})
            </h2>
            <div className="text-sm text-cyan-300/70">
              Page {currentPage} of {totalPages || 1}
            </div>
          </div>

          {loading && !collections.length ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            </div>
          ) : collections.length === 0 ? (
            <div className="text-center py-12 text-cyan-300/50">
              No collections found.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-cyan-500/30">
                      <th className="text-left p-2 text-xs font-mono uppercase tracking-[0.2em] text-cyan-300 sticky left-0 bg-black/90 z-10">
                        Actions
                      </th>
                      {columns.map((column) => (
                        <th
                          key={column}
                          className="text-left p-2 text-xs font-mono uppercase tracking-[0.2em] text-cyan-300 cursor-pointer hover:bg-cyan-900/20"
                          onClick={() => handleSort(column)}
                        >
                          <div className="flex items-center gap-1">
                            {column}
                            {sortColumn === column && (
                              <ArrowUpDown className={`h-3 w-3 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map((collection) => {
                      const isEditing = editing === collection.id
                      return (
                        <tr
                          key={collection.id}
                          className="border-b border-cyan-500/10 hover:bg-cyan-900/10"
                        >
                          <td className="p-2 sticky left-0 bg-black/90 z-10">
                            <div className="flex items-center gap-1">
                              {isEditing ? (
                                <>
                                  <Button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="h-6 w-6 p-0 bg-green-600 hover:bg-green-700"
                                    title="Save"
                                  >
                                    {saving ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Save className="h-3 w-3" />
                                    )}
                                  </Button>
                                  <Button
                                    onClick={handleCancelEdit}
                                    disabled={saving}
                                    className="h-6 w-6 p-0 bg-transparent border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/30"
                                    title="Cancel"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    onClick={() => handleEdit(collection)}
                                    className="h-6 w-6 p-0 bg-transparent border border-blue-500/30 text-blue-300 hover:bg-blue-900/30"
                                    title="Edit"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    onClick={() => handleDelete(collection.id)}
                                    disabled={deleting === collection.id}
                                    className="h-6 w-6 p-0 bg-transparent border border-red-500/30 text-red-300 hover:bg-red-900/30"
                                    title="Delete"
                                  >
                                    {deleting === collection.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" />
                                    )}
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                          {columns.map((column) => {
                            const value = isEditing && editForm
                              ? editForm[column]
                              : collection[column as keyof Collection]
                            
                            return (
                              <td key={column} className="p-2 text-xs font-mono text-cyan-200">
                                {isEditing && editForm ? (
                                  <input
                                    type={typeof value === 'number' ? 'number' : 'text'}
                                    value={value ?? ''}
                                    onChange={(e) => {
                                      const newValue = typeof value === 'number' 
                                        ? (e.target.value === '' ? null : parseFloat(e.target.value))
                                        : e.target.value
                                      setEditForm({ ...editForm, [column]: newValue })
                                    }}
                                    className="w-full px-2 py-1 text-xs bg-black border border-cyan-500/30 rounded text-cyan-200"
                                  />
                                ) : (
                                  <div className="max-w-[200px] truncate" title={String(value ?? 'null')}>
                                    {value !== null && value !== undefined ? String(value) : <span className="text-gray-500">null</span>}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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
      </div>
    </div>
  )
}

