// Campaign create/edit modal.
//
// Form fields adapt to the selected placement: creative_spec keys
// drive which inputs render and how they're validated. Live preview
// on the right uses PlacementPreview so the operator sees the
// rendered ad as the form changes.

import { useEffect, useMemo, useState } from 'react'
import { X, Upload, MapPin, Plus } from 'lucide-react'
import {
  adminApi,
  brandsApi,
  type Brand,
  type Campaign,
  type CampaignCreative,
  type CampaignCreateInput,
  type Placement,
  type TargetSegment,
} from '@/services/api'
import { effectiveRole, useAdminStore } from '@/stores/adminStore'
import { PlacementPreview, type PreviewCreative } from './PlacementPreview'

const AGE_RANGES = ['18-22', '23-27', '28-32', '33-37', '38-42', '43-47', '48+']

const BEHAVIORS: Array<{ key: string; label: string; desc: string }> = [
  {
    key: 'active_dater_30d',
    label: 'Active Dater',
    desc: 'Son 30 günde 3+ date logu',
  },
  {
    key: 'high_frequency_30d',
    label: 'High Frequency',
    desc: 'Son 30 günde 5+ date logu',
  },
  {
    key: 'single_proxy',
    label: 'Single proxy',
    desc: 'Aktif partner kaydı yok',
  },
]

// Spec key → form field mapping. Image fields read *_size keys, text
// fields read *_max keys; everything else is treated as documentation.
type SpecField = {
  kind: 'text' | 'textarea' | 'image'
  fieldName: keyof CampaignCreative
  maxLength?: number
  sizeHint?: string
}

function fieldsFromSpec(spec: Record<string, unknown>): SpecField[] {
  const out: SpecField[] = []
  for (const [k, v] of Object.entries(spec)) {
    if (k.endsWith('_max') && typeof v === 'number') {
      const fieldName = k.slice(0, -4) as keyof CampaignCreative
      const kind = fieldName === 'body' ? 'textarea' : 'text'
      out.push({ kind, fieldName, maxLength: v })
    } else if (k.endsWith('_size') && typeof v === 'string') {
      const base = k.slice(0, -5) // 'image_size' → 'image', 'logo_size' → 'logo'
      const fieldName = `${base}_url` as keyof CampaignCreative
      out.push({ kind: 'image', fieldName, sizeHint: v })
    }
  }
  // Stable order: images first, then short text, then textarea.
  out.sort((a, b) => {
    const order = { image: 0, text: 1, textarea: 2 } as const
    return order[a.kind] - order[b.kind]
  })
  return out
}

type CityOption = { id: number; name: string; country_code: string }

export function CampaignEditorModal({
  initial,
  placements,
  onClose,
  onSaved,
}: {
  initial: Campaign | null
  placements: Placement[]
  onClose: () => void
  onSaved: () => void
}) {
  // Edit when initial has a real id; an initial with empty id is a
  // duplicate-source clone and should hit the create path.
  const isEdit = !!initial?.id
  const me = useAdminStore((s) => s.me)
  const role = effectiveRole(me)
  const isSuper = role === 'super_admin'

  // ── Form state ──
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState(initial?.brand_id ?? '')
  const [placementKey, setPlacementKey] = useState(
    initial?.placement_key ?? placements[0]?.key ?? '',
  )

  // T0.4 — pricing / budget fields (super-only visible/editable)
  const [pricingModel, setPricingModel] = useState<'cpm' | 'cpc' | 'flat' | ''>(
    initial?.pricing_model ?? '',
  )
  const [unitPriceCents, setUnitPriceCents] = useState<string>(
    initial?.unit_price_cents?.toString() ?? '',
  )
  const [totalBudgetCents, setTotalBudgetCents] = useState<string>(
    initial?.total_budget_cents?.toString() ?? '',
  )

  // Load brands list once for super_admin selector.
  useEffect(() => {
    if (isSuper) {
      brandsApi.list(false).then(setBrands).catch(() => setBrands([]))
    }
  }, [isSuper])
  const [creative, setCreative] = useState<CampaignCreative>(
    initial?.creative ?? {},
  )
  const [clickUrl, setClickUrl] = useState(initial?.click_url ?? '')
  const [startsAt, setStartsAt] = useState(
    initial?.starts_at?.slice(0, 16) ??
      new Date().toISOString().slice(0, 16),
  )
  const [endsAt, setEndsAt] = useState(
    initial?.ends_at?.slice(0, 16) ??
      new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 16),
  )
  const [dailyCap, setDailyCap] = useState<string>(
    initial?.daily_cap?.toString() ?? '',
  )
  const [weight, setWeight] = useState<string>(initial?.weight?.toString() ?? '1')
  const [isDryRun, setIsDryRun] = useState(initial?.is_dry_run ?? false)

  // Targeting
  const [cityIds, setCityIds] = useState<Set<number>>(
    new Set(initial?.target_segment?.city_ids ?? []),
  )
  const [ageRanges, setAgeRanges] = useState<Set<string>>(
    new Set(initial?.target_segment?.age_ranges ?? []),
  )
  const [behaviors, setBehaviors] = useState<Set<string>>(
    new Set(initial?.target_segment?.behaviors ?? []),
  )

  // City lookup
  const [cityQuery, setCityQuery] = useState('')
  const [cityOptions, setCityOptions] = useState<CityOption[]>([])
  const [showCitySearch, setShowCitySearch] = useState(false)
  const [cityNamesById, setCityNamesById] = useState<Record<number, string>>({})

  const [viewport, setViewport] = useState<'mobile' | 'desktop'>('mobile')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingField, setUploadingField] = useState<string | null>(null)

  // badge_sponsor için brand kendi badge'ini tasarlar. Form state'i
  // create modunda zorunlu, edit modunda değişiklik bu sürümde
  // desteklenmiyor (badge satırı zaten kampanyaya bağlı).
  const isBadgeSponsor = placementKey === 'badge_sponsor'
  const [badgeName, setBadgeName] = useState('')
  const [badgeDescription, setBadgeDescription] = useState('')
  const [badgeIcon, setBadgeIcon] = useState('🏆')
  const [badgeCategory, setBadgeCategory] =
    useState<'dates' | 'explore' | 'social' | 'quality'>('dates')
  const [badgeThreshold, setBadgeThreshold] = useState<string>('5')
  const [badgeGender, setBadgeGender] = useState<'male' | 'female' | 'both'>('both')
  // Badge'in görsel kimliği — icon (emoji) ya da yüklenmiş resim. İkisi
  // birden olmaz; radio toggle ile seçim yapılır.
  const [badgeVisualMode, setBadgeVisualMode] = useState<'icon' | 'image'>('icon')
  const [badgeImageUrl, setBadgeImageUrl] = useState('')
  const [badgeImageUploading, setBadgeImageUploading] = useState(false)

  const placement = useMemo(
    () => placements.find((p) => p.key === placementKey),
    [placementKey, placements],
  )

  const fields = useMemo(
    () => (placement ? fieldsFromSpec(placement.creative_spec) : []),
    [placement],
  )

  // Resolve names for already-selected cities (edit case)
  useEffect(() => {
    if (cityIds.size === 0) return
    let cancelled = false
    adminApi.getCities().then((all) => {
      if (cancelled) return
      const map: Record<number, string> = {}
      for (const c of all) map[c.id] = `${c.name}, ${c.country_code}`
      setCityNamesById(map)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // City autocomplete — load all then filter client-side
  useEffect(() => {
    if (!showCitySearch) return
    let cancelled = false
    adminApi.getCities().then((all) => {
      if (cancelled) return
      setCityOptions(all)
    })
    return () => {
      cancelled = true
    }
  }, [showCitySearch])

  // ── Helpers ──
  const setCField = (k: keyof CampaignCreative, v: string) => {
    setCreative((c) => ({ ...c, [k]: v }))
  }

  const onUpload = async (fieldName: keyof CampaignCreative, file: File) => {
    setUploadingField(fieldName)
    setError(null)
    try {
      const r = await adminApi.uploadAdCreative(file)
      setCField(fieldName, r.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploadingField(null)
    }
  }

  const toggleSet = <T,>(set: Set<T>, item: T): Set<T> => {
    const next = new Set(set)
    if (next.has(item)) next.delete(item)
    else next.add(item)
    return next
  }

  const cityResults = useMemo(() => {
    const q = cityQuery.trim().toLowerCase()
    if (!q) return cityOptions.slice(0, 30)
    return cityOptions
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.country_code.toLowerCase().includes(q),
      )
      .slice(0, 30)
  }, [cityQuery, cityOptions])

  // ── Submit ──
  const onSave = async () => {
    setError(null)
    // Brand_admin & impersonating super → server overrides from JWT ctx;
    // super_admin without impersonation must explicitly pick.
    if (isSuper && !brandId && !isEdit) return setError('Brand seçilmeli')
    if (!placementKey) return setError('Placement seçilmeli')
    if (!clickUrl.trim()) return setError('Click URL gerekli')
    const start = new Date(startsAt)
    const end = new Date(endsAt)
    if (end <= start) return setError('Bitiş başlangıçtan sonra olmalı')

    // Per-spec text-length checks (mirrors backend validate_creative).
    for (const f of fields) {
      if (f.kind === 'image') continue
      const val = (creative[f.fieldName] as string | undefined) ?? ''
      if (f.maxLength && [...val].length > f.maxLength) {
        return setError(
          `creative.${f.fieldName} en fazla ${f.maxLength} karakter olmalı`,
        )
      }
    }

    // badge_sponsor: targeting/cap/weight/dry-run yok — herkese servis
    // edilir, rotation tetiklenmez, impression cap kavramı uygulanmaz.
    const target_segment: TargetSegment | null = isBadgeSponsor
      ? null
      : cityIds.size === 0 && ageRanges.size === 0 && behaviors.size === 0
      ? null
      : {
          ...(cityIds.size > 0 ? { city_ids: Array.from(cityIds) } : {}),
          ...(ageRanges.size > 0
            ? { age_ranges: Array.from(ageRanges) }
            : {}),
          ...(behaviors.size > 0 ? { behaviors: Array.from(behaviors) } : {}),
        }

    const dc = isBadgeSponsor
      ? null
      : dailyCap.trim()
      ? parseInt(dailyCap, 10)
      : null
    const w = isBadgeSponsor ? 1 : parseInt(weight, 10) || 1
    const dryRun = isBadgeSponsor ? false : isDryRun

    // T0.4 — pricing payload is super-only; brand_admin fields are
    // ignored server-side anyway, but we don't even send them.
    const pricingPayload = isSuper
      ? {
          pricing_model: pricingModel || null,
          unit_price_cents: unitPriceCents
            ? parseInt(unitPriceCents, 10)
            : null,
          total_budget_cents: totalBudgetCents
            ? parseInt(totalBudgetCents, 10)
            : null,
        }
      : {}

    setSaving(true)
    try {
      if (isEdit && initial) {
        await adminApi.updateCampaign(initial.id, {
          creative,
          click_url: clickUrl,
          target_segment,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          daily_cap: dc,
          weight: w,
          is_dry_run: dryRun,
          ...pricingPayload,
        })
      } else {
        if (isBadgeSponsor) {
          const thresholdNum = parseInt(badgeThreshold, 10)
          if (!badgeName.trim()) return setError('Badge adı gerekli')
          if (!badgeDescription.trim())
            return setError('Badge açıklaması gerekli')
          if (badgeVisualMode === 'icon' && !badgeIcon.trim())
            return setError('Emoji ikon seçildi ama alan boş')
          if (badgeVisualMode === 'image' && !badgeImageUrl)
            return setError('Görsel modu seçildi ama henüz dosya yüklenmedi')
          if (!thresholdNum || thresholdNum < 1)
            return setError('Threshold >= 1 olmalı')
        }
        // Backend badges.icon NOT NULL — image modundayken bile bir
        // placeholder gönderilmek zorunda; user-facing tarafta `image_url`
        // varsa zaten icon yerine bu kullanılır.
        const effectiveIcon =
          badgeVisualMode === 'icon'
            ? badgeIcon.trim()
            : badgeIcon.trim() || '🏆'
        const effectiveImageUrl =
          badgeVisualMode === 'image' ? badgeImageUrl : null

        const body: CampaignCreateInput = {
          brand_id: isSuper ? brandId : undefined,
          placement_key: placementKey,
          creative,
          click_url: clickUrl,
          target_segment,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          daily_cap: dc,
          weight: w,
          is_dry_run: dryRun,
          ...pricingPayload,
          ...(isBadgeSponsor
            ? {
                badge_spec: {
                  name: badgeName.trim(),
                  description: badgeDescription.trim(),
                  icon: effectiveIcon,
                  category: badgeCategory,
                  threshold: parseInt(badgeThreshold, 10),
                  image_url: effectiveImageUrl,
                  gender: badgeGender,
                },
              }
            : {}),
        }
        await adminApi.createCampaign(body)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-6xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-dark-700 sticky top-0 bg-dark-900 z-10">
          <div>
            <h3 className="text-lg font-semibold">
              {isEdit ? 'Kampanyayı Düzenle' : 'Yeni Kampanya'}
            </h3>
            <p className="text-xs text-dark-400">
              {isEdit
                ? "Değişiklikler audit log'a yazılır"
                : 'Dry-run açıkken canlıya çıkmaz'}
            </p>
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand">
                {isSuper && !isEdit ? (
                  <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Seç…</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.display_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={initial?.brand_name ?? 'Kendi brandiniz'}
                    disabled
                    className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm opacity-60"
                  />
                )}
              </Field>
              <Field label="Placement">
                <select
                  value={placementKey}
                  onChange={(e) => setPlacementKey(e.target.value)}
                  disabled={isEdit}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                >
                  {placements.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.display_name} ({p.key})
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* T0.4 — pricing/budget (super only). brand_admin sees
                read-only summary if values are set, else nothing. */}
            {isSuper ? (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Pricing model">
                  <select
                    value={pricingModel}
                    onChange={(e) =>
                      setPricingModel(
                        e.target.value as 'cpm' | 'cpc' | 'flat' | '',
                      )
                    }
                    className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">— (sözleşme dışı)</option>
                    <option value="cpm">CPM</option>
                    <option value="cpc">CPC</option>
                    <option value="flat">Flat fee</option>
                  </select>
                </Field>
                <Field
                  label="Unit price (kr)"
                  hint={pricingModel === 'flat' ? 'flat için boş' : 'cpm/cpc zorunlu'}
                >
                  <input
                    type="number"
                    min={0}
                    value={unitPriceCents}
                    onChange={(e) => setUnitPriceCents(e.target.value)}
                    disabled={pricingModel === 'flat' || pricingModel === ''}
                    className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                  />
                </Field>
                <Field
                  label="Total budget (kr)"
                  hint="cpm/cpc için zorunlu"
                >
                  <input
                    type="number"
                    min={0}
                    value={totalBudgetCents}
                    onChange={(e) => setTotalBudgetCents(e.target.value)}
                    disabled={pricingModel === 'flat' || pricingModel === ''}
                    className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                  />
                </Field>
              </div>
            ) : (
              initial?.pricing_model && (
                <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 text-xs text-dark-300">
                  Pricing: <strong>{initial.pricing_model.toUpperCase()}</strong>
                  {initial.unit_price_cents !== null &&
                    ` · ${initial.unit_price_cents}kr`}
                  {initial.total_budget_cents !== null &&
                    ` · bütçe ${initial.total_budget_cents.toLocaleString()}kr`}
                  <div className="text-dark-500 mt-1 text-[11px]">
                    Bu alanlar sözleşme alanıdır; sadece super_admin
                    güncelleyebilir.
                  </div>
                </div>
              )
            )}

            {placement && !placement.is_globally_enabled && (
              <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                Bu placement globalde KAPALI. Kampanya oluşturulabilir ama
                placement açılana kadar gösterilmez.
              </div>
            )}

            {/* badge_sponsor: brand kendi badge'ini tasarlar.
                Onaylandığında badges tablosuna yazılır, kullanıcılar
                threshold'u sağladığında unlock'lar. */}
            {isBadgeSponsor && !isEdit && (
              <div>
                <p className="text-xs text-dark-400 mb-2 font-medium">
                  Badge tasarımı
                </p>
                <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Ad" hint="≤100 karakter, platformda benzersiz">
                      <input
                        value={badgeName}
                        onChange={(e) => setBadgeName(e.target.value)}
                        maxLength={100}
                        placeholder="ör. Bumble Date Sayacı"
                        className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Gender">
                      <select
                        value={badgeGender}
                        onChange={(e) =>
                          setBadgeGender(
                            e.target.value as 'male' | 'female' | 'both',
                          )
                        }
                        className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="both">Both</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </Field>
                  </div>

                  <Field label="Açıklama" hint="≤255 karakter, kullanıcıya gösterilir">
                    <textarea
                      value={badgeDescription}
                      onChange={(e) => setBadgeDescription(e.target.value)}
                      maxLength={255}
                      rows={2}
                      placeholder="ör. Bumble ile 10 date'e çık"
                      className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Kategori" hint="Unlock'u hangi metriğin tetikleyeceği">
                      <select
                        value={badgeCategory}
                        onChange={(e) =>
                          setBadgeCategory(
                            e.target.value as
                              | 'dates'
                              | 'explore'
                              | 'social'
                              | 'quality',
                          )
                        }
                        className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="dates">Date sayısı</option>
                        <option value="explore">Şehir/ülke çeşitliliği</option>
                        <option value="social">Arkadaş sayısı</option>
                        <option value="quality">
                          Ortalama puan (min 5 date)
                        </option>
                      </select>
                    </Field>
                    <Field label="Threshold" hint="Bu kategoride kaç adet/skor">
                      <input
                        type="number"
                        min={1}
                        value={badgeThreshold}
                        onChange={(e) => setBadgeThreshold(e.target.value)}
                        className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm"
                      />
                    </Field>
                  </div>

                  {/* Görsel kimlik: ikon (emoji) VEYA yüklenmiş badge görseli.
                      Radio ile biri seçilince diğer panel devre dışı. */}
                  <div>
                    <p className="text-xs text-dark-400 mb-2 font-medium">
                      Badge görseli
                    </p>
                    <div className="flex gap-4 text-xs mb-2">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="badge-visual-mode"
                          checked={badgeVisualMode === 'icon'}
                          onChange={() => setBadgeVisualMode('icon')}
                          className="accent-neon-500"
                        />
                        <span
                          className={
                            badgeVisualMode === 'icon'
                              ? 'text-dark-100'
                              : 'text-dark-400'
                          }
                        >
                          Emoji ikon
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="badge-visual-mode"
                          checked={badgeVisualMode === 'image'}
                          onChange={() => setBadgeVisualMode('image')}
                          className="accent-neon-500"
                        />
                        <span
                          className={
                            badgeVisualMode === 'image'
                              ? 'text-dark-100'
                              : 'text-dark-400'
                          }
                        >
                          Görsel yükle (PNG)
                        </span>
                      </label>
                    </div>

                    {badgeVisualMode === 'icon' ? (
                      <div className="flex items-center gap-3">
                        <input
                          value={badgeIcon}
                          onChange={(e) => setBadgeIcon(e.target.value)}
                          maxLength={10}
                          placeholder="🐝"
                          className="w-24 bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-center text-lg"
                        />
                        <span className="text-xs text-dark-500">
                          Tek emoji veya kısa unicode (≤10 karakter).
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        {badgeImageUrl ? (
                          <img
                            src={badgeImageUrl}
                            alt="Badge görseli"
                            className="w-16 h-16 rounded-full object-cover ring-2 ring-neon-500/30"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-dark-900 border border-dark-700 flex items-center justify-center text-dark-600 text-xs">
                            önizleme
                          </div>
                        )}
                        <div className="flex-1">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            disabled={badgeImageUploading}
                            onChange={async (e) => {
                              const f = e.target.files?.[0]
                              if (!f) return
                              setBadgeImageUploading(true)
                              setError(null)
                              try {
                                const r = await adminApi.uploadAdCreative(f)
                                setBadgeImageUrl(r.url)
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Upload failed',
                                )
                              } finally {
                                setBadgeImageUploading(false)
                                // Reset input so same file can be reselected
                                e.target.value = ''
                              }
                            }}
                            className="text-xs"
                          />
                          <p className="text-[11px] text-dark-500 mt-1">
                            Önerilen 256×256, kare PNG.{' '}
                            {badgeImageUploading && 'Yükleniyor…'}
                          </p>
                          {badgeImageUrl && (
                            <button
                              type="button"
                              onClick={() => setBadgeImageUrl('')}
                              className="text-[11px] text-red-400 hover:text-red-300 mt-1"
                            >
                              Kaldır
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Creative fields rendered from spec */}
            <div>
              <p className="text-xs text-dark-400 mb-2 font-medium">Creative</p>
              <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 space-y-3">
                {fields.length === 0 ? (
                  <p className="text-xs text-dark-500">
                    Bu placement için creative_spec tanımlı değil.
                  </p>
                ) : (
                  fields.map((f) => (
                    <CreativeFieldInput
                      key={f.fieldName}
                      field={f}
                      value={(creative[f.fieldName] as string | undefined) ?? ''}
                      onChange={(v) => setCField(f.fieldName, v)}
                      onUpload={(file) => onUpload(f.fieldName, file)}
                      uploading={uploadingField === f.fieldName}
                    />
                  ))
                )}
              </div>
            </div>

            <Field label="Click URL">
              <input
                type="url"
                value={clickUrl}
                onChange={(e) => setClickUrl(e.target.value)}
                placeholder="https://brand.com/landing"
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Başlangıç">
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm scheme-dark"
                />
              </Field>
              <Field label="Bitiş">
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm scheme-dark"
                />
              </Field>
            </div>

            {/* daily_cap + weight: rotation-bazlı placement'larda anlamlı.
                badge_sponsor'da impression/rotation yok — kafa karışıklığını
                önlemek için form'dan tamamen gizli. */}
            {!isBadgeSponsor && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Daily cap" hint="Günlük impression limiti, boş = sınırsız">
                  <input
                    type="number"
                    min={1}
                    value={dailyCap}
                    onChange={(e) => setDailyCap(e.target.value)}
                    placeholder="örn. 5000"
                    className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Weight" hint="Aynı placement içinde rotasyon ağırlığı">
                  <input
                    type="number"
                    min={1}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
                  />
                </Field>
              </div>
            )}

            {/* Targeting: badge unlock hedeflenmez (threshold'u sağlayan
                herkese verilir) — badge_sponsor'da bu blok gizli. */}
            {!isBadgeSponsor && (
            <div>
              <p className="text-xs text-dark-400 mb-2 font-medium">
                Targeting (boş = herkese)
              </p>
              <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 space-y-3">
                {/* Cities */}
                <div>
                  <p className="text-[11px] text-dark-400 mb-2 flex items-center gap-1">
                    <MapPin size={11} /> Şehir
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {Array.from(cityIds).map((id) => (
                      <span
                        key={id}
                        className="text-[11px] bg-neon-500/15 text-neon-300 border border-neon-500/30 rounded-full px-2 py-0.5 inline-flex items-center gap-1"
                      >
                        {cityNamesById[id] ?? `#${id}`}
                        <button
                          onClick={() =>
                            setCityIds((s) => {
                              const n = new Set(s)
                              n.delete(id)
                              return n
                            })
                          }
                          className="hover:text-red-400"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => setShowCitySearch((v) => !v)}
                      className="text-[11px] bg-dark-700 border border-dark-600 rounded-full px-2 py-0.5 hover:bg-dark-600 inline-flex items-center gap-1"
                    >
                      <Plus size={10} /> Ekle
                    </button>
                  </div>
                  {showCitySearch && (
                    <div className="space-y-2">
                      <input
                        value={cityQuery}
                        onChange={(e) => setCityQuery(e.target.value)}
                        placeholder="Şehir ara…"
                        className="w-full bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs"
                      />
                      <div className="max-h-32 overflow-y-auto bg-dark-900 border border-dark-700 rounded">
                        {cityResults.length === 0 ? (
                          <p className="text-[11px] text-dark-500 p-2">Yok</p>
                        ) : (
                          cityResults.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setCityIds((s) => {
                                  const n = new Set(s)
                                  n.add(c.id)
                                  return n
                                })
                                setCityNamesById((m) => ({
                                  ...m,
                                  [c.id]: `${c.name}, ${c.country_code}`,
                                }))
                              }}
                              disabled={cityIds.has(c.id)}
                              className="w-full text-left text-xs px-2 py-1 hover:bg-dark-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {c.name}, {c.country_code}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Age ranges */}
                <div>
                  <p className="text-[11px] text-dark-400 mb-2">
                    Partner yaş aralığı
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {AGE_RANGES.map((a) => (
                      <button
                        key={a}
                        onClick={() => setAgeRanges((s) => toggleSet(s, a))}
                        className={`text-[11px] rounded-full px-2.5 py-0.5 border ${
                          ageRanges.has(a)
                            ? 'bg-neon-500/15 text-neon-300 border-neon-500/30'
                            : 'bg-dark-700 text-dark-400 border-dark-600'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Behaviors */}
                <div>
                  <p className="text-[11px] text-dark-400 mb-2">Davranış</p>
                  <div className="space-y-1.5">
                    {BEHAVIORS.map((b) => (
                      <label
                        key={b.key}
                        className="flex items-start gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={behaviors.has(b.key)}
                          onChange={() =>
                            setBehaviors((s) => toggleSet(s, b.key))
                          }
                          className="mt-0.5 accent-neon-500"
                        />
                        <div>
                          <div className="text-xs text-dark-200">{b.label}</div>
                          <div className="text-[10px] text-dark-500">
                            {b.desc}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Dry run: rotation/serving olmayan placement'larda gizli. */}
            {!isBadgeSponsor && (
            <label className="flex items-start gap-2 bg-dark-800 border border-dark-700 rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isDryRun}
                onChange={(e) => setIsDryRun(e.target.checked)}
                className="mt-0.5 accent-yellow-500"
              />
              <div>
                <div className="text-sm font-medium text-yellow-400">
                  Dry run modu
                </div>
                <div className="text-[11px] text-dark-400">
                  Açıkken kampanya gerçek kullanıcılara gösterilmez. Önce
                  preview ile kontrol et, ardından kapat.
                </div>
              </div>
            </label>
            )}
          </div>

          {/* Live preview */}
          <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
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
              <PlacementPreview
                placementKey={placementKey}
                creative={creative as PreviewCreative}
                viewport={viewport}
              />
            </div>
            {placement && (
              <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 text-[11px] text-dark-400 space-y-1">
                <p>
                  <strong className="text-white">{placement.display_name}</strong>{' '}
                  · {placement.description}
                </p>
                <p className="font-mono">
                  spec: {JSON.stringify(placement.creative_spec)}
                </p>
              </div>
            )}
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
            {saving ? 'Kaydediliyor…' : isEdit ? 'Kaydet' : 'Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

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
      {hint && <p className="text-[10px] text-dark-500 mt-1">{hint}</p>}
    </div>
  )
}

function CreativeFieldInput({
  field,
  value,
  onChange,
  onUpload,
  uploading,
}: {
  field: SpecField
  value: string
  onChange: (v: string) => void
  onUpload: (file: File) => void
  uploading: boolean
}) {
  const label = field.fieldName as string
  const hint =
    field.kind === 'image'
      ? `Önerilen boyut: ${field.sizeHint}`
      : field.maxLength
        ? `${[...value].length}/${field.maxLength} karakter`
        : undefined

  if (field.kind === 'image') {
    return (
      <div>
        <div className="flex items-center justify-between text-[11px] text-dark-400 mb-1.5">
          <span className="font-mono">{label}</span>
          <span>{hint}</span>
        </div>
        <div className="flex items-center gap-3">
          {value ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt=""
                className="h-16 rounded border border-dark-700"
              />
              <button
                onClick={() => onChange('')}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Kaldır
              </button>
            </>
          ) : (
            <span className="text-xs text-dark-500">Henüz görsel yok</span>
          )}
          <label className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-xs cursor-pointer hover:bg-dark-600">
            <Upload size={12} />
            {uploading ? 'Yükleniyor…' : 'Yükle'}
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
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-dark-400 mb-1.5">
        <span className="font-mono">{label}</span>
        <span
          className={
            field.maxLength && [...value].length > field.maxLength
              ? 'text-red-400'
              : ''
          }
        >
          {hint}
        </span>
      </div>
      {field.kind === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.maxLength ?? 1000}
          rows={3}
          className="w-full bg-dark-900 border border-dark-600 rounded px-2 py-1.5 text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.maxLength ?? 200}
          className="w-full bg-dark-900 border border-dark-600 rounded px-2 py-1.5 text-sm"
        />
      )}
    </div>
  )
}
