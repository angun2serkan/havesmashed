import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { adminApi } from '@/services/api'

interface BadgeRow {
  id: number
  name: string
  description: string
  icon: string
  category: string
  threshold: number
  image_url: string | null
}

const categories = ['dates', 'explore', 'social', 'quality'] as const

const emptyForm = {
  name: '',
  description: '',
  icon: '',
  category: 'dates' as string,
  threshold: '',
  image_url: '',
}

export default function BadgesPage() {
  const [badges, setBadges] = useState<BadgeRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)

  function fetchBadges() {
    adminApi
      .getBadges()
      .then(setBadges)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    fetchBadges()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await adminApi.createBadge({
        name: form.name,
        description: form.description,
        icon: form.icon,
        category: form.category,
        threshold: parseInt(form.threshold),
        ...(form.image_url ? { image_url: form.image_url } : {}),
      })
      setForm(emptyForm)
      fetchBadges()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create badge')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this badge?')) return
    try {
      await adminApi.deleteBadge(id)
      fetchBadges()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete badge')
    }
  }

  function startEdit(badge: BadgeRow) {
    setEditId(badge.id)
    setEditForm({
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      category: badge.category,
      threshold: String(badge.threshold),
      image_url: badge.image_url ?? '',
    })
  }

  async function handleEditSave(id: number) {
    try {
      await adminApi.updateBadge(id, {
        name: editForm.name,
        description: editForm.description,
        icon: editForm.icon,
        category: editForm.category,
        threshold: parseInt(editForm.threshold),
        ...(editForm.image_url ? { image_url: editForm.image_url } : {}),
      })
      setEditId(null)
      fetchBadges()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update badge')
    }
  }

  const inputClass =
    'px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors'

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Badges</h2>

      {/* Create Badge Form */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
          Create Badge
        </h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className={inputClass}
            />
            <input
              placeholder="Icon (emoji)"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              required
              className={inputClass}
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={`${inputClass} appearance-none`}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <input
              placeholder="Threshold"
              type="number"
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: e.target.value })}
              required
              className={inputClass}
            />
          </div>
          <input
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
            className={`${inputClass} w-full`}
          />
          <div className="flex gap-3">
            <input
              placeholder="Image URL (optional)"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              className={`${inputClass} flex-1`}
            />
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg font-medium hover:bg-neon-500/30 transition-colors disabled:opacity-50"
            >
              <Plus size={16} />
              Create
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Badge Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {badges.map((badge) => (
          <div
            key={badge.id}
            className="bg-dark-800 border border-dark-700 rounded-xl p-5"
          >
            {editId === badge.id ? (
              <div className="space-y-2">
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={`${inputClass} w-full text-sm`}
                  placeholder="Name"
                />
                <input
                  value={editForm.icon}
                  onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                  className={`${inputClass} w-full text-sm`}
                  placeholder="Icon"
                />
                <input
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className={`${inputClass} w-full text-sm`}
                  placeholder="Description"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className={`${inputClass} text-sm appearance-none`}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={editForm.threshold}
                    onChange={(e) => setEditForm({ ...editForm, threshold: e.target.value })}
                    type="number"
                    className={`${inputClass} text-sm`}
                    placeholder="Threshold"
                  />
                </div>
                <input
                  value={editForm.image_url}
                  onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                  className={`${inputClass} w-full text-sm`}
                  placeholder="Image URL (optional)"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleEditSave(badge.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30 transition-colors"
                  >
                    <Check size={14} /> Save
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-dark-700 text-dark-400 text-sm hover:bg-dark-600 transition-colors"
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{badge.icon}</span>
                    <div>
                      <h4 className="font-semibold text-white">{badge.name}</h4>
                      <span className="text-xs text-neon-400 bg-neon-500/10 px-2 py-0.5 rounded-full">
                        {badge.category}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(badge)}
                      className="p-1.5 rounded bg-neon-500/20 text-neon-400 hover:bg-neon-500/30 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(badge.id)}
                      className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-dark-300 mb-2">{badge.description}</p>
                <p className="text-xs text-dark-500">
                  Threshold: <span className="text-dark-300">{badge.threshold}</span>
                </p>
              </>
            )}
          </div>
        ))}
        {badges.length === 0 && (
          <div className="col-span-full text-center text-dark-500 py-8">
            No badges found
          </div>
        )}
      </div>
    </div>
  )
}
