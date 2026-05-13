import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Building2, X } from 'lucide-react'
import { brandsApi, type Brand } from '@/services/api'

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState('')

  const reload = () => {
    setBrands(null)
    brandsApi
      .list(showInactive)
      .then(setBrands)
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'))
  }
  useEffect(reload, [showInactive])

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="text-neon-500" />
            Brands
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            Marka entity yönetimi + placement grant'ları.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-dark-300 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="accent-neon-500"
            />
            Pasif olanları göster
          </label>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 border border-neon-500/30 text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Yeni Brand
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="bg-dark-900 border border-dark-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-dark-800 text-dark-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Slug</th>
              <th className="text-left px-4 py-2.5">Display name</th>
              <th className="text-left px-4 py-2.5">Email</th>
              <th className="text-right px-4 py-2.5">Kampanya</th>
              <th className="text-left px-4 py-2.5">Durum</th>
              <th className="text-left px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {brands === null && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-dark-400">
                  Yükleniyor…
                </td>
              </tr>
            )}
            {brands?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-dark-400">
                  Henüz brand yok.
                </td>
              </tr>
            )}
            {brands?.map((b) => (
              <tr
                key={b.id}
                className="border-t border-dark-800 hover:bg-dark-800/50 transition-colors"
              >
                <td className="px-4 py-3 font-mono text-xs text-dark-300">
                  {b.slug}
                </td>
                <td className="px-4 py-3 font-medium text-white">
                  {b.display_name}
                </td>
                <td className="px-4 py-3 text-dark-400">
                  {b.contact_email ?? '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {b.campaigns_count}
                </td>
                <td className="px-4 py-3">
                  {b.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-400 uppercase tracking-wider">
                      active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-dark-700 text-dark-400 uppercase tracking-wider">
                      inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/brands/${b.id}`}
                    className="text-neon-500 hover:text-neon-400 text-xs font-medium"
                  >
                    Detay →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <CreateBrandModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function CreateBrandModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await brandsApi.create({
        slug: slug.trim().toLowerCase(),
        display_name: name.trim(),
        contact_email: email.trim() || null,
        contract_notes: notes.trim() || null,
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-xl">
        <div className="flex items-center justify-between p-4 border-b border-dark-800">
          <h2 className="font-bold text-white">Yeni Brand</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <Field label="Slug (lowercase + tire, 2-40 char)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="bumble"
              pattern="^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$"
              required
              className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded-lg text-sm text-white"
            />
          </Field>
          <Field label="Display name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bumble Inc."
              required
              maxLength={80}
              className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded-lg text-sm text-white"
            />
          </Field>
          <Field label="İletişim e-postası (opsiyonel)">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded-lg text-sm text-white"
            />
          </Field>
          <Field label="Sözleşme notları (opsiyonel)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded-lg text-sm text-white"
            />
          </Field>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-dark-300 hover:text-white"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 disabled:opacity-50"
            >
              {loading ? 'Oluşturuluyor…' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs text-dark-300 mb-1">{label}</span>
      {children}
    </label>
  )
}
