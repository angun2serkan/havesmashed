import { useEffect, useState, useMemo, useRef, type FormEvent, type ChangeEvent } from 'react'
import { Plus, Pencil, Trash2, X, Check, Upload, Filter, Smile, Sparkles, Award, MousePointerClick } from 'lucide-react'
import { adminApi, type BadgeRow, type BadgeCriteria } from '@/services/api'
import { BadgeSponsorModal } from '@/components/BadgeSponsorModal'
import { BadgeCriteriaBuilder } from '@/components/BadgeCriteriaBuilder'
import EmojiPicker, { Theme } from 'emoji-picker-react'

type SponsorStat = {
  badge_id: number
  name: string
  sponsor_name: string | null
  total_unlocks: number
  sponsor_click_count: number
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
  const [sponsorStats, setSponsorStats] = useState<Record<number, SponsorStat>>({})
  const [sponsorEditId, setSponsorEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [criteria, setCriteria] = useState<BadgeCriteria | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [editCriteria, setEditCriteria] = useState<BadgeCriteria | null>(null)
  const [editUploading, setEditUploading] = useState(false)
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all')
  const [onlySponsored, setOnlySponsored] = useState(false)
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
    adminApi
      .getSponsoredBadgeStats()
      .then((rows) => {
        const map: Record<number, SponsorStat> = {}
        for (const r of rows) map[r.badge_id] = r
        setSponsorStats(map)
      })
      .catch(() => {
        // Stats are decorative — don't surface fetch errors to the operator.
      })
  }

  useEffect(() => {
    fetchBadges()
  }, [])

  const filteredBadges = useMemo(() => {
    return badges.filter((b) => {
      if (genderFilter !== 'all' && b.gender !== genderFilter) return false
      if (onlySponsored && !b.is_sponsored) return false
      return true
    })
  }, [badges, genderFilter, onlySponsored])

  const sponsorEditingBadge = useMemo(
    () => badges.find((b) => b.id === sponsorEditId) ?? null,
    [badges, sponsorEditId],
  )

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
        // Criteria boşsa hiç gönderme (backend optional). Spec varsa legacy
        // category/threshold yerine evaluator bu spec'i değerlendirir.
        ...(criteria && criteria.conditions.length > 0 ? { criteria } : {}),
      })
      setForm(emptyForm)
      setCriteria(null)
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
    setEditCriteria(badge.criteria ?? null)
  }

  async function handleEditSave(id: number) {
    try {
      // criteria three-state: builder boş döndüyse (null veya boş conditions)
      // backend'e `null` gönderip legacy moda dönmesini sağlıyoruz; aksi
      // halde spec'i yazıyoruz. Hep gönderiyoruz çünkü builder, kullanıcı
      // criteria'yı temizleyince null'a düşüyor.
      const criteriaToSend =
        editCriteria && editCriteria.conditions.length > 0 ? editCriteria : null
      await adminApi.updateBadge(id, {
        name: editForm.name,
        description: editForm.description,
        icon: editForm.icon,
        category: editForm.category,
        threshold: parseInt(editForm.threshold),
        gender: editForm.gender,
        ...(editForm.image_url ? { image_url: editForm.image_url } : {}),
        criteria: criteriaToSend,
      })
      setEditId(null)
      setEditCriteria(null)
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
          <BadgeCriteriaBuilder value={criteria} onChange={setCriteria} />
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
                      className="w-8 h-8 rounded object-contain bg-dark-900 border border-dark-600"
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
        <button
          onClick={() => setOnlySponsored((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
            onlySponsored
              ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
              : 'bg-dark-800 text-dark-400 border border-dark-700 hover:bg-dark-700 hover:text-dark-300'
          }`}
        >
          <Sparkles size={14} />
          Sponsored only
        </button>
        {(genderFilter !== 'all' || onlySponsored) && (
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
            className={`bg-dark-800 rounded-xl p-5 border ${
              badge.is_sponsored
                ? 'border-yellow-500/40 shadow-[0_0_0_1px_rgba(234,179,8,0.15)]'
                : 'border-dark-700'
            }`}
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
                        className="w-6 h-6 rounded object-contain bg-dark-900 border border-dark-600"
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
                <BadgeCriteriaBuilder value={editCriteria} onChange={setEditCriteria} />
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
                      <div className="flex items-center gap-1.5">
                        {badge.is_sponsored && (
                          <span
                            className="text-yellow-300"
                            title={`Sponsored${badge.sponsor_name ? ` by ${badge.sponsor_name}` : ''}`}
                          >
                            \u2726
                          </span>
                        )}
                        <h4 className="font-semibold text-white">{badge.name}</h4>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
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
                      onClick={() => setSponsorEditId(badge.id)}
                      title={badge.is_sponsored ? 'Edit sponsor' : 'Add sponsor'}
                      className={`p-1.5 rounded transition-colors ${
                        badge.is_sponsored
                          ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                          : 'bg-dark-700 text-dark-400 hover:bg-dark-600 hover:text-yellow-300'
                      }`}
                    >
                      <Sparkles size={14} />
                    </button>
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
                {badge.is_sponsored && (
                  <div className="mt-3 pt-3 border-t border-yellow-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {badge.sponsor_logo_url && (
                          <img
                            src={badge.sponsor_logo_url}
                            alt={badge.sponsor_name ?? ''}
                            className="h-4 w-auto rounded bg-dark-950 p-0.5"
                          />
                        )}
                        <span className="text-xs text-yellow-300 font-medium">
                          Presented by {badge.sponsor_name ?? '—'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-dark-900/60 border border-dark-700 rounded-lg px-2 py-1.5">
                        <div className="flex items-center gap-1 text-[10px] text-dark-400 uppercase tracking-wider">
                          <Award size={10} /> Unlocks
                        </div>
                        <div className="text-sm font-semibold text-white mt-0.5">
                          {sponsorStats[badge.id]?.total_unlocks ?? 0}
                        </div>
                      </div>
                      <div className="bg-dark-900/60 border border-dark-700 rounded-lg px-2 py-1.5">
                        <div className="flex items-center gap-1 text-[10px] text-dark-400 uppercase tracking-wider">
                          <MousePointerClick size={10} /> Brand clicks
                        </div>
                        <div className="text-sm font-semibold text-white mt-0.5">
                          {sponsorStats[badge.id]?.sponsor_click_count ?? badge.sponsor_click_count}
                        </div>
                      </div>
                    </div>
                    {badge.sponsor_click_url && (
                      <p className="mt-2 text-[10px] text-dark-500 truncate" title={badge.sponsor_click_url}>
                        → {badge.sponsor_click_url}
                      </p>
                    )}
                  </div>
                )}
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

      {sponsorEditingBadge && (
        <BadgeSponsorModal
          badge={sponsorEditingBadge}
          onClose={() => setSponsorEditId(null)}
          onSaved={() => {
            setSponsorEditId(null)
            fetchBadges()
          }}
        />
      )}
    </div>
  )
}
