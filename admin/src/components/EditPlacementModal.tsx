// Placement edit modal.
//
// Lets the operator change display rules (frequency caps, dwell
// thresholds), creative spec (image size + text limits), preview
// image, description, and which metrics are collected. The metric
// list is a checkbox group with a fixed catalog so admin can't
// invent untracked metric names.

import { useState } from 'react'
import { X, Upload } from 'lucide-react'
import { adminApi, type Placement } from '@/services/api'
import { PlacementPreview } from './PlacementPreview'

const KNOWN_METRICS = [
  'impression',
  'click',
  'dwell_ms',
  'scroll_past',
  'badge_claim',
  'comment',
  'sent',
  'delivered',
  'open',
] as const

export function EditPlacementModal({
  placement,
  onClose,
  onSaved,
}: {
  placement: Placement
  onClose: () => void
  onSaved: (next: Placement) => void
}) {
  const [displayName, setDisplayName] = useState(placement.display_name)
  const [description, setDescription] = useState(placement.description)
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    placement.preview_image_url ?? null,
  )
  const [creativeSpec, setCreativeSpec] = useState(
    JSON.stringify(placement.creative_spec, null, 2),
  )
  const [displayRules, setDisplayRules] = useState(
    JSON.stringify(placement.display_rules, null, 2),
  )
  const [metrics, setMetrics] = useState<Set<string>>(
    new Set(placement.metrics_collected),
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>('mobile')

  const toggleMetric = (m: string) => {
    setMetrics((s) => {
      const next = new Set(s)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  const onUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const r = await adminApi.uploadAdCreative(file)
      setPreviewUrl(r.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const onSave = async () => {
    setError(null)
    let parsedSpec: Record<string, unknown>
    let parsedRules: Record<string, unknown>
    try {
      parsedSpec = JSON.parse(creativeSpec)
      parsedRules = JSON.parse(displayRules)
    } catch (e) {
      setError(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`)
      return
    }

    setSaving(true)
    try {
      const next = await adminApi.updatePlacement(placement.key, {
        display_name: displayName,
        description,
        preview_image_url: previewUrl,
        creative_spec: parsedSpec,
        display_rules: parsedRules,
        metrics_collected: Array.from(metrics),
      })
      onSaved(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-5xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-dark-700 sticky top-0 bg-dark-900 z-10">
          <div>
            <h3 className="text-lg font-semibold">{placement.key}</h3>
            <p className="text-xs text-dark-400">Reklam türü ayarları</p>
          </div>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5">
          {/* Form */}
          <div className="space-y-4">
            <Field label="Display name">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </Field>

            <Field
              label="Preview image"
              hint="Admin sayfasında 'feed'de buraya giriyor' ekran görüntüsü"
            >
              <div className="flex items-center gap-3">
                {previewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt=""
                      className="h-16 rounded-lg border border-dark-700"
                    />
                    <button
                      onClick={() => setPreviewUrl(null)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Kaldır
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-dark-500">Henüz yok</span>
                )}
                <label className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-xs cursor-pointer hover:bg-dark-700">
                  <Upload size={12} />
                  {uploading ? 'Yükleniyor…' : 'Görsel yükle'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) onUpload(f)
                    }}
                  />
                </label>
              </div>
            </Field>

            <Field
              label="Creative spec (JSON)"
              hint="Bu placement'a yüklenen kampanya creative'inin spec'i. Örn. title_max, image_size."
            >
              <textarea
                value={creativeSpec}
                onChange={(e) => setCreativeSpec(e.target.value)}
                rows={6}
                spellCheck={false}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs font-mono"
              />
            </Field>

            <Field
              label="Display rules (JSON)"
              hint="frequency_cap_per_session, dwell_ms_for_impression, min_gap_minutes, vs."
            >
              {placement.key === 'gated_interstitial' && (
                <div className="mb-2 bg-dark-900 border border-neon-500/20 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-neon-400 mb-1.5 uppercase tracking-wider">
                    Gated interstitial alanları
                  </p>
                  <ul className="text-[11px] text-dark-300 leading-relaxed space-y-0.5 font-mono">
                    <li>
                      <span className="text-dark-100">min_view_seconds</span> —
                      kaç saniye zorunlu izleme (skip butonu erişilmez).
                    </li>
                    <li>
                      <span className="text-dark-100">skip_after_seconds</span> —
                      skip butonunun aktifleşme süresi.
                    </li>
                    <li>
                      <span className="text-dark-100">frequency_cap_per_day</span> —
                      günde max kaç kez gate tetiklenebilir.
                    </li>
                    <li>
                      <span className="text-dark-100">
                        frequency_cap_per_user_per_session
                      </span>{' '}
                      — oturum başına gate sayısı.
                    </li>
                    <li>
                      <span className="text-dark-100">new_user_grace_count</span> —
                      yeni kullanıcının ilk N date'inde gate atla.
                    </li>
                  </ul>
                </div>
              )}
              <textarea
                value={displayRules}
                onChange={(e) => setDisplayRules(e.target.value)}
                rows={6}
                spellCheck={false}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs font-mono"
              />
            </Field>

            <Field
              label="Metrics collected"
              hint="Bu placement hangi metrikleri kaydediyor"
            >
              <div className="grid grid-cols-2 gap-2 bg-dark-800 border border-dark-700 rounded-lg p-3">
                {KNOWN_METRICS.map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={metrics.has(m)}
                      onChange={() => toggleMetric(m)}
                      className="accent-neon-500"
                    />
                    <span className="text-dark-200 font-mono text-xs">{m}</span>
                  </label>
                ))}
              </div>
            </Field>
          </div>

          {/* Live preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Canlı önizleme</h4>
              <div className="inline-flex bg-dark-800 border border-dark-600 rounded-lg p-0.5">
                <button
                  onClick={() => setViewport('mobile')}
                  className={`px-2.5 py-1 text-xs rounded ${
                    viewport === 'mobile'
                      ? 'bg-neon-500/20 text-neon-400'
                      : 'text-dark-400'
                  }`}
                >
                  Mobile
                </button>
                <button
                  onClick={() => setViewport('desktop')}
                  className={`px-2.5 py-1 text-xs rounded ${
                    viewport === 'desktop'
                      ? 'bg-neon-500/20 text-neon-400'
                      : 'text-dark-400'
                  }`}
                >
                  Desktop
                </button>
              </div>
            </div>
            <div className="bg-dark-950 border border-dark-700 rounded-xl p-4">
              <PlacementPreview placementKey={placement.key} viewport={viewport} />
            </div>
            <p className="text-[10px] text-dark-500 leading-relaxed">
              Bu mock bir görselleştirmedir; gerçek `AdSlot` component'i Faz 4.6'da
              yerleşecek. Kampanya creative'i değiştirildiğinde bu preview günceli
              yansıtacak şekilde swap edilecek.
            </p>
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 p-5 border-t border-dark-700 sticky bottom-0 bg-dark-900">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-200 hover:bg-dark-700"
          >
            İptal
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
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
