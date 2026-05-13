// Affiliate link create/edit modal.
//
// Slug is locked once the link exists — changing it would break any
// channel where the old /go/<slug> was already shared. Brand name,
// target URL, UTM campaign and notes are all editable. is_active
// toggles soft-deactivation without losing historical click counts.

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  adminApi,
  brandsApi,
  type AffiliateLink,
  type AffiliateCreateInput,
  type AffiliateUpdateInput,
  type Brand,
} from '@/services/api'
import { effectiveRole, useAdminStore } from '@/stores/adminStore'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
const UTM_RE = /^[A-Za-z0-9._-]{1,80}$/

export function AffiliateLinkEditorModal({
  link,
  onClose,
  onSaved,
}: {
  link: AffiliateLink | null // null = create mode
  onClose: () => void
  onSaved: () => void
}) {
  const isCreate = link === null
  const me = useAdminStore((s) => s.me)
  const role = effectiveRole(me)
  const isSuper = role === 'super_admin'

  const [slug, setSlug] = useState(link?.slug ?? '')
  const [brandId, setBrandId] = useState(link?.brand_id ?? '')
  const [brands, setBrands] = useState<Brand[]>([])
  const [targetUrl, setTargetUrl] = useState(link?.target_url ?? '')
  const [utm, setUtm] = useState(link?.utm_campaign ?? '')
  const [notes, setNotes] = useState(link?.notes ?? '')
  const [isActive, setIsActive] = useState(link?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isSuper && isCreate) {
      brandsApi.list(false).then(setBrands).catch(() => setBrands([]))
    }
  }, [isSuper, isCreate])

  const validate = (): string | null => {
    if (isCreate && !SLUG_RE.test(slug.trim())) {
      return 'Slug 3-40 karakter, lowercase alphanumeric ve dash; uçlar alphanumeric olmalı'
    }
    const url = targetUrl.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return 'Target URL http:// veya https:// ile başlamalı'
    }
    if (url.length > 2048 || /\s/.test(url)) {
      return 'Target URL geçerli değil'
    }
    if (utm.trim() && !UTM_RE.test(utm.trim())) {
      return 'UTM campaign sadece alphanumeric, dash, underscore, dot içerebilir'
    }
    return null
  }

  const onSubmit = async () => {
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isCreate) {
        const body: AffiliateCreateInput = {
          slug: slug.trim().toLowerCase(),
          brand_id: isSuper ? brandId || null : undefined,
          target_url: targetUrl.trim(),
          utm_campaign: utm.trim() || null,
          notes: notes.trim() || null,
        }
        await adminApi.createAffiliate(body)
      } else {
        const body: AffiliateUpdateInput = {
          target_url: targetUrl.trim(),
          utm_campaign: utm.trim() || null,
          notes: notes.trim() || null,
          is_active: isActive,
        }
        await adminApi.updateAffiliate(link.id, body)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div>
            <h3 className="text-lg font-semibold">
              {isCreate ? 'Yeni affiliate link' : `Düzenle: ${link.slug}`}
            </h3>
            <p className="text-xs text-dark-400">
              {isCreate
                ? 'Slug bir kez kaydedilince değişmez — paylaşılan linkler bozulmasın diye.'
                : 'Slug değiştirilemez. Diğer alanlar serbestçe güncellenebilir.'}
            </p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Slug" hint="URL'in son kısmı: haveismash.com/go/<slug>">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={!isCreate}
              maxLength={40}
              placeholder="durex-promo"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neon-500 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </Field>

          <Field label="Brand">
            {isCreate && isSuper ? (
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neon-500"
              >
                <option value="">— (organik / brand entity yok)</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.display_name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={link?.brand_name ?? 'Kendi brand’iniz'}
                disabled
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm opacity-60"
              />
            )}
          </Field>

          <Field label="Target URL" hint="Brand'in landing sayfası">
            <input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com/landing"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neon-500"
            />
          </Field>

          <Field label="UTM campaign (opsiyonel)" hint="Hedef URL'e ?utm_campaign=… olarak eklenir">
            <input
              value={utm}
              onChange={(e) => setUtm(e.target.value)}
              maxLength={80}
              placeholder="q1-2026"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neon-500"
            />
          </Field>

          <Field label="Notlar (opsiyonel)" hint="Sadece operatör için">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Kampanya bilgisi, deal süresi, vs."
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neon-500"
            />
          </Field>

          {!isCreate && (
            <Field label="Durum">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="accent-neon-500"
                />
                <span className="text-sm text-dark-200">
                  Aktif {isActive ? '(ziyaretçilere yönlendirir)' : '(404 dönecek)'}
                </span>
              </label>
            </Field>
          )}

          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-dark-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-200 hover:bg-dark-700"
          >
            İptal
          </button>
          <button
            onClick={onSubmit}
            disabled={saving}
            className="px-4 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor…' : isCreate ? 'Oluştur' : 'Güncelle'}
          </button>
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
