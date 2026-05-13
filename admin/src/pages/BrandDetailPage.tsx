import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import {
  adminApi,
  brandsApi,
  type Brand,
  type BrandGrant,
  type Placement,
} from '@/services/api'

export default function BrandDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [grants, setGrants] = useState<BrandGrant[] | null>(null)
  const [placements, setPlacements] = useState<Placement[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [grantOpen, setGrantOpen] = useState(false)
  const [error, setError] = useState('')

  function load() {
    if (!id) return
    Promise.all([
      brandsApi.get(id),
      brandsApi.listGrants(id),
      adminApi.listPlacements(),
    ])
      .then(([b, g, p]) => {
        setBrand(b)
        setGrants(g)
        setPlacements(p)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'))
  }
  useEffect(load, [id])

  if (!id) return null

  return (
    <div>
      <Link
        to="/brands"
        className="inline-flex items-center gap-1 text-sm text-dark-400 hover:text-white mb-4"
      >
        <ArrowLeft size={14} /> Brands
      </Link>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {brand === null ? (
        <div className="text-dark-400 text-sm">Yükleniyor…</div>
      ) : (
        <>
          <div className="bg-dark-900 border border-dark-700 rounded-lg p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-dark-500 mb-1">{brand.slug}</div>
                <h1 className="text-2xl font-bold text-white">
                  {brand.display_name}
                </h1>
                <div className="text-sm text-dark-400 mt-1">
                  {brand.contact_email ?? 'Henüz iletişim e-postası yok'}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                    brand.is_active
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-dark-700 text-dark-400'
                  }`}
                >
                  {brand.is_active ? 'active' : 'inactive'}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(true)}
                    className="px-3 py-1 rounded bg-dark-800 hover:bg-dark-700 text-xs"
                  >
                    Düzenle
                  </button>
                  {brand.is_active && (
                    <button
                      onClick={async () => {
                        if (!confirm('Brand pasifleştirilsin mi?')) return
                        try {
                          await brandsApi.deactivate(brand.id)
                          load()
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : 'deactivate failed',
                          )
                        }
                      }}
                      className="px-3 py-1 rounded bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs"
                    >
                      Pasifleştir
                    </button>
                  )}
                </div>
              </div>
            </div>
            {brand.contract_notes && (
              <div className="mt-4 p-3 bg-dark-950 border border-dark-800 rounded text-sm text-dark-300 whitespace-pre-wrap">
                {brand.contract_notes}
              </div>
            )}
          </div>

          <section className="bg-dark-900 border border-dark-700 rounded-lg">
            <div className="flex items-center justify-between p-4 border-b border-dark-800">
              <div>
                <h2 className="font-semibold text-white">Placement Grants</h2>
                <p className="text-xs text-dark-400">
                  Bu marka hangi placement'larda kampanya açabilir + limitler.
                </p>
              </div>
              <button
                onClick={() => setGrantOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 border border-neon-500/30 text-xs font-medium"
              >
                <Plus size={14} /> Grant Ekle
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-dark-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Placement</th>
                  <th className="text-right px-4 py-2">Max Concurrent</th>
                  <th className="text-right px-4 py-2">Monthly Imp Cap</th>
                  <th className="text-left px-4 py-2">Notlar</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {grants === null && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center text-dark-400">
                      Yükleniyor…
                    </td>
                  </tr>
                )}
                {grants?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center text-dark-400">
                      Henüz grant verilmedi.
                    </td>
                  </tr>
                )}
                {grants?.map((g) => (
                  <tr key={g.placement_key} className="border-t border-dark-800">
                    <td className="px-4 py-2 font-mono text-xs text-neon-400">
                      {g.placement_key}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {g.max_concurrent ?? '∞'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {g.monthly_impression_cap?.toLocaleString() ?? '∞'}
                    </td>
                    <td className="px-4 py-2 text-dark-400 text-xs">
                      {g.notes ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={async () => {
                          if (!confirm(`'${g.placement_key}' grant kaldırılsın mı?`))
                            return
                          await brandsApi.removeGrant(brand.id, g.placement_key)
                          load()
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {editing && (
            <EditBrandModal
              brand={brand}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false)
                load()
              }}
            />
          )}
          {grantOpen && (
            <GrantModal
              brandId={brand.id}
              placements={placements ?? []}
              existing={grants ?? []}
              onClose={() => setGrantOpen(false)}
              onSaved={() => {
                setGrantOpen(false)
                load()
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

function EditBrandModal({
  brand,
  onClose,
  onSaved,
}: {
  brand: Brand
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(brand.display_name)
  const [email, setEmail] = useState(brand.contact_email ?? '')
  const [notes, setNotes] = useState(brand.contract_notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await brandsApi.update(brand.id, {
        display_name: name.trim(),
        contact_email: email.trim() || null,
        contract_notes: notes.trim() || null,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={save}
        className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-3"
      >
        <h2 className="font-bold text-white">Brand Düzenle</h2>
        <label className="block">
          <span className="block text-xs text-dark-300 mb-1">Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-dark-300 mb-1">E-posta</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-dark-300 mb-1">Notlar</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
          />
        </label>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1 text-sm text-dark-300">
            İptal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-1 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  )
}

function GrantModal({
  brandId,
  placements,
  existing,
  onClose,
  onSaved,
}: {
  brandId: string
  placements: Placement[]
  existing: BrandGrant[]
  onClose: () => void
  onSaved: () => void
}) {
  const available = placements.filter(
    (p) => !existing.some((g) => g.placement_key === p.key),
  )
  const [placementKey, setPlacementKey] = useState(available[0]?.key ?? '')
  const [maxConcurrent, setMaxConcurrent] = useState('')
  const [monthlyCap, setMonthlyCap] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await brandsApi.upsertGrant(brandId, {
        placement_key: placementKey,
        max_concurrent: maxConcurrent ? Number(maxConcurrent) : null,
        monthly_impression_cap: monthlyCap ? Number(monthlyCap) : null,
        notes: notes.trim() || null,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={save}
        className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-3"
      >
        <h2 className="font-bold text-white">Yeni Placement Grant</h2>
        <label className="block">
          <span className="block text-xs text-dark-300 mb-1">Placement</span>
          <select
            value={placementKey}
            onChange={(e) => setPlacementKey(e.target.value)}
            required
            className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
          >
            {available.length === 0 ? (
              <option value="">Tüm placement'lara grant verildi</option>
            ) : (
              available.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.display_name} ({p.key})
                </option>
              ))
            )}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-dark-300 mb-1">
            Max concurrent (boş = sınırsız)
          </span>
          <input
            type="number"
            min="1"
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(e.target.value)}
            className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-dark-300 mb-1">
            Monthly impression cap (boş = sınırsız)
          </span>
          <input
            type="number"
            min="1"
            value={monthlyCap}
            onChange={(e) => setMonthlyCap(e.target.value)}
            className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-dark-300 mb-1">Notlar</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
          />
        </label>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1 text-sm text-dark-300">
            İptal
          </button>
          <button
            type="submit"
            disabled={loading || !placementKey}
            className="px-4 py-1 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  )
}
