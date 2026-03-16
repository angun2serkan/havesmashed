import { useEffect, useState, useMemo, useRef, type FormEvent, type ChangeEvent } from 'react'
import { Plus, Pencil, Trash2, X, Check, Upload, Filter, Smile } from 'lucide-react'
import { adminApi } from '@/services/api'
import EmojiPicker, { Theme } from 'emoji-picker-react'

interface BadgeRow {
  id: number
  name: string
  description: string
  icon: string
  category: string
  threshold: number
  image_url: string | null
  gender: 'male' | 'female' | 'lgbt' | 'both'
}

const categories = ['dates', 'explore', 'social', 'quality'] as const
const genderOptions = ['both', 'male', 'female', 'lgbt'] as const
type GenderFilter = 'all' | 'male' | 'female' | 'lgbt' | 'both'

const genderSymbol: Record<string, string> = {
  male: '\u2642',
  female: '\u2640',
  lgbt: '\uD83C\uDF08',
  both: '\u26A5',
}

const emptyForm = {
  name: '',
  description: '',
  icon: '',
  category: 'dates' as string,
  threshold: '',
  image_url: '',
  gender: 'both' as string,
}

export default function BadgesPage() {
  const [badges, setBadges] = useState<BadgeRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [editUploading, setEditUploading] = useState(false)
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false)
  const emojiRef = useRef<HTMLDivElement>(null)
  const editEmojiRef = useRef<HTMLDivElement>(null)

  // Close emoji picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmojiPicker(false)
      if (editEmojiRef.current && !editEmojiRef.current.contains(e.target as Node)) setShowEditEmojiPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function fetchBadges() {
    adminApi
      .getBadges()
      .then(setBadges)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    fetchBadges()
  }, [])

  const filteredBadges = useMemo(() => {
    if (genderFilter === 'all') return badges
    return badges.filter((b) => b.gender === genderFilter)
  }, [badges, genderFilter])

  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await adminApi.uploadBadgeImage(file)
      setForm({ ...form, image_url: result.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  async function handleEditImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setEditUploading(true)
    try {
      const result = await adminApi.uploadBadgeImage(file)
      setEditForm({ ...editForm, image_url: result.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image')
    } finally {
      setEditUploading(false)
    }
  }

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
        gender: form.gender,
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
      gender: badge.gender ?? 'both',
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
        gender: editForm.gender,
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

  const genderFilterOptions: { label: string; value: GenderFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'LGBT', value: 'lgbt' },
    { label: 'Both', value: 'both' },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Badges</h2>

      {/* Create Badge Form */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
          Create Badge
        </h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className={inputClass}
            />
            <div className="relative" ref={emojiRef}>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`${inputClass} w-full flex items-center gap-2 cursor-pointer`}
              >
                {form.icon ? (
                  <span className="text-xl">{form.icon}</span>
                ) : (
                  <>
                    <Smile size={16} className="text-dark-500" />
                    <span className="text-dark-500">Icon</span>
                  </>
                )}
              </button>
              {showEmojiPicker && (
                <div className="absolute top-full left-0 mt-1 z-50">
                  <EmojiPicker
                    theme={Theme.DARK}
                    onEmojiClick={(e) => { setForm({ ...form, icon: e.emoji }); setShowEmojiPicker(false); }}
                    width={320}
                    height={400}
                  />
                </div>
              )}
            </div>
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
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className={`${inputClass} appearance-none`}
            >
              {genderOptions.map((g) => (
                <option key={g} value={g}>
                  {g === 'male' ? '♂ Male (kadınla date)' : g === 'female' ? '♀ Female (erkekle date)' : g === 'lgbt' ? '🌈 LGBT (her iki cins)' : '⚥ General'}
                </option>
              ))}
            </select>
          </div>
          <input
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
            className={`${inputClass} w-full`}
          />
          <div className="flex gap-3 items-center">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-300 hover:bg-dark-600 hover:text-white transition-colors cursor-pointer text-sm">
                  <Upload size={16} />
                  {uploading ? 'Uploading...' : 'Upload Image'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
                {form.image_url && (
                  <div className="flex items-center gap-2">
                    <img
                      src={form.image_url}
                      alt="Preview"
                      className="w-8 h-8 rounded object-cover border border-dark-600"
                    />
                    <span className="text-xs text-dark-400 truncate max-w-[200px]">{form.image_url}</span>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, image_url: '' })}
                      className="p-1 rounded bg-dark-700 text-dark-400 hover:bg-dark-600 hover:text-white transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
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

      {/* Gender Filter */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={16} className="text-dark-400" />
        <span className="text-sm text-dark-400">Filter by gender:</span>
        <div className="flex gap-1">
          {genderFilterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGenderFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                genderFilter === opt.value
                  ? 'bg-neon-500/20 text-neon-400 border border-neon-500/30'
                  : 'bg-dark-800 text-dark-400 border border-dark-700 hover:bg-dark-700 hover:text-dark-300'
              }`}
            >
              {opt.value !== 'all' && <span className="mr-1">{genderSymbol[opt.value]}</span>}
              {opt.label}
            </button>
          ))}
        </div>
        {genderFilter !== 'all' && (
          <span className="text-xs text-dark-500">
            {filteredBadges.length} of {badges.length} badges
          </span>
        )}
      </div>

      {/* Badge Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBadges.map((badge) => (
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
                <div className="relative" ref={editEmojiRef}>
                  <button
                    type="button"
                    onClick={() => setShowEditEmojiPicker(!showEditEmojiPicker)}
                    className={`${inputClass} w-full flex items-center gap-2 cursor-pointer text-sm`}
                  >
                    {editForm.icon ? (
                      <span className="text-lg">{editForm.icon}</span>
                    ) : (
                      <>
                        <Smile size={14} className="text-dark-500" />
                        <span className="text-dark-500">Icon</span>
                      </>
                    )}
                  </button>
                  {showEditEmojiPicker && (
                    <div className="absolute top-full left-0 mt-1 z-50">
                      <EmojiPicker
                        theme={Theme.DARK}
                        onEmojiClick={(e) => { setEditForm({ ...editForm, icon: e.emoji }); setShowEditEmojiPicker(false); }}
                        width={300}
                        height={350}
                      />
                    </div>
                  )}
                </div>
                <input
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className={`${inputClass} w-full text-sm`}
                  placeholder="Description"
                />
                <div className="grid grid-cols-3 gap-2">
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
                  <select
                    value={editForm.gender}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                    className={`${inputClass} text-sm appearance-none`}
                  >
                    {genderOptions.map((g) => (
                      <option key={g} value={g}>
                        {g === 'male' ? '♂ Male' : g === 'female' ? '♀ Female' : g === 'lgbt' ? '🌈 LGBT' : '⚥ General'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-dark-300 hover:bg-dark-600 hover:text-white transition-colors cursor-pointer text-xs">
                    <Upload size={14} />
                    {editUploading ? 'Uploading...' : 'Upload Image'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleEditImageUpload}
                      className="hidden"
                      disabled={editUploading}
                    />
                  </label>
                  {editForm.image_url && (
                    <div className="flex items-center gap-1.5">
                      <img
                        src={editForm.image_url}
                        alt="Preview"
                        className="w-6 h-6 rounded object-cover border border-dark-600"
                      />
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, image_url: '' })}
                        className="p-0.5 rounded bg-dark-700 text-dark-400 hover:bg-dark-600 hover:text-white transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}
                </div>
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
                    {badge.image_url ? (
                      <img
                        src={badge.image_url}
                        alt={badge.name}
                        className="w-16 h-16 rounded-xl object-contain"
                      />
                    ) : (
                      <span className="text-4xl">{badge.icon}</span>
                    )}
                    <div>
                      <h4 className="font-semibold text-white">{badge.name}</h4>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-neon-400 bg-neon-500/10 px-2 py-0.5 rounded-full">
                          {badge.category}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          title={badge.gender}
                          style={{
                            backgroundColor:
                              badge.gender === 'male'
                                ? 'rgba(59, 130, 246, 0.15)'
                                : badge.gender === 'female'
                                ? 'rgba(236, 72, 153, 0.15)'
                                : badge.gender === 'lgbt'
                                ? 'rgba(168, 85, 247, 0.15)'
                                : 'rgba(168, 85, 247, 0.15)',
                            color:
                              badge.gender === 'male'
                                ? '#60a5fa'
                                : badge.gender === 'female'
                                ? '#f472b6'
                                : badge.gender === 'lgbt'
                                ? '#c084fc'
                                : '#c084fc',
                          }}
                        >
                          {genderSymbol[badge.gender] ?? '\u26A5'}
                        </span>
                      </div>
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
        {filteredBadges.length === 0 && (
          <div className="col-span-full text-center text-dark-500 py-8">
            No badges found
          </div>
        )}
      </div>
    </div>
  )
}
