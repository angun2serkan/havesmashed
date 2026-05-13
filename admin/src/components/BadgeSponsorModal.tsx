// Badge sponsor management modal.
//
// Lets the operator attach, edit, or remove a brand sponsor on an
// existing badge. Brand name + click URL + logo URL are all required
// when activating a sponsorship; the backend rejects empty fields.
// Logo upload reuses the badge image upload endpoint.

import { useState, type ChangeEvent } from 'react'
import { X, Upload, Trash2 } from 'lucide-react'
import { adminApi, type BadgeRow } from '@/services/api'

export function BadgeSponsorModal({
  badge,
  onClose,
  onSaved,
}: {
  badge: BadgeRow
  onClose: () => void
  onSaved: () => void
}) {
  const [sponsorName, setSponsorName] = useState(badge.sponsor_name ?? '')
  const [clickUrl, setClickUrl] = useState(badge.sponsor_click_url ?? '')
  const [logoUrl, setLogoUrl] = useState(badge.sponsor_logo_url ?? '')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const r = await adminApi.uploadBadgeImage(file)
      setLogoUrl(r.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo yüklenemedi')
    } finally {
      setUploading(false)
    }
  }

  const onSave = async () => {
    setError(null)
    if (!sponsorName.trim()) {
      setError('Brand ismi zorunlu')
      return
    }
    if (!clickUrl.trim()) {
      setError('Click URL zorunlu')
      return
    }
    if (!logoUrl.trim()) {
      setError('Logo zorunlu — yükleyin veya URL girin')
      return
    }
    setSaving(true)
    try {
      await adminApi.setBadgeSponsor(badge.id, {
        sponsor_name: sponsorName.trim(),
        sponsor_click_url: clickUrl.trim(),
        sponsor_logo_url: logoUrl.trim(),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const onRemove = async () => {
    if (!confirm(`"${badge.name}" badge'inden ${badge.sponsor_name ?? 'sponsor'} kaldırılsın mı?`)) {
      return
    }
    setRemoving(true)
    setError(null)
    try {
      await adminApi.clearBadgeSponsor(badge.id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaldırılamadı')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div className="flex items-center gap-3">
            {badge.image_url ? (
              <img
                src={badge.image_url}
                alt={badge.name}
                className="w-10 h-10 rounded-lg object-contain"
              />
            ) : (
              <span className="text-2xl">{badge.icon}</span>
            )}
            <div>
              <h3 className="text-lg font-semibold">{badge.name}</h3>
              <p className="text-xs text-dark-400">
                {badge.is_sponsored ? 'Sponsorluğu düzenle' : 'Sponsor ekle'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Brand ismi" hint="Örn. Durex, Trojan, Nike">
            <input
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              maxLength={80}
              placeholder="Durex"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neon-500"
            />
          </Field>

          <Field
            label="Click URL"
            hint="Genelde affiliate link (örn. https://haveismash.com/go/durex-promo)"
          >
            <input
              value={clickUrl}
              onChange={(e) => setClickUrl(e.target.value)}
              placeholder="https://example.com/landing"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neon-500"
            />
          </Field>

          <Field label="Logo" hint="PNG/SVG önerilir. Badge altındaki şeritte gösterilir.">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <>
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    className="h-10 w-auto rounded border border-dark-700 bg-dark-950 p-1"
                  />
                  <button
                    type="button"
                    onClick={() => setLogoUrl('')}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Kaldır
                  </button>
                </>
              ) : (
                <span className="text-xs text-dark-500">Henüz logo yok</span>
              )}
              <label className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-xs cursor-pointer hover:bg-dark-700">
                <Upload size={12} />
                {uploading ? 'Yükleniyor…' : 'Logo yükle'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="veya logo URL'sini doğrudan yapıştırın"
              className="mt-2 w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-neon-500"
            />
          </Field>

          <Field label="Notlar (opsiyonel)" hint="Sadece operatör için, anywhere kaydedilmez.">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Kampanya bilgisi, deal süresi, içsel kontekst…"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neon-500"
            />
          </Field>

          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-5 border-t border-dark-700">
          {badge.is_sponsored ? (
            <button
              onClick={onRemove}
              disabled={removing || saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/20 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {removing ? 'Kaldırılıyor…' : 'Sponsoru kaldır'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-200 hover:bg-dark-700"
            >
              İptal
            </button>
            <button
              onClick={onSave}
              disabled={saving || removing}
              className="px-4 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : badge.is_sponsored ? 'Güncelle' : 'Sponsoru ekle'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs text-dark-400 mb-1.5 font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-dark-500 mt-1.5">{hint}</p>}
    </div>
  )
}
