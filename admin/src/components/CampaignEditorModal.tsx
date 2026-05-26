// Campaign create/edit modal.
//
// Form fields adapt to the selected placement: creative_spec keys
// drive which inputs render and how they're validated. Live preview
// on the right uses PlacementPreview so the operator sees the
// rendered ad as the form changes.

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Upload, MapPin, Plus, Smile } from 'lucide-react'
import EmojiPicker, { Theme } from 'emoji-picker-react'
import {
  adminApi,
  brandsApi,
  pricingApi,
  walletApi,
  DURATION_MONTH_OPTIONS,
  type ActivePricing,
  type BadgeCriteria,
  type Brand,
  type Campaign,
  type CampaignCreative,
  type CampaignCreateInput,
  type DurationMonths,
  type Placement,
  type TargetSegment,
} from '@/services/api'
import { effectiveRole, useAdminStore } from '@/stores/adminStore'
import { formatTRY } from '@/lib/formatTRY'
import { BadgeCriteriaBuilder } from './BadgeCriteriaBuilder'
import { PlacementPreview, type PreviewCreative } from './PlacementPreview'
import { UrlWithAffiliatePicker } from './UrlWithAffiliatePicker'

const DEFAULT_DURATION_MONTHS: DurationMonths = 1

/** starts_at + n ay; takvim-bilinçli (Date.setMonth month-end clamping). */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime())
  d.setMonth(d.getMonth() + months)
  return d
}

// 100 TL katına yukarı yuvarla (backend round_up_to_100_tl ile aynı).
function roundUpTo100TL(cents: number): number {
  if (cents <= 0) return 0
  const unit = 10_000
  return Math.ceil(cents / unit) * unit
}

// CEIL(target × cpm / 1000), backend ceil_div_1000 ile aynı.
function cpmCostCents(targetImpressions: number, unitPriceCents: number): number {
  if (targetImpressions <= 0 || unitPriceCents <= 0) return 0
  const raw = Math.ceil((targetImpressions * unitPriceCents) / 1000)
  return roundUpTo100TL(raw)
}

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

// Creative field için operatör-okur etiket + kısa açıklama. Backend
// alan adlarını ("cta", "title", "body"...) bu sözlük üzerinden
// Türkçe'ye çeviriyoruz; sözlükte olmayan alan adı için ham anahtar
// fallback gösterilir.
const CREATIVE_FIELD_LABELS: Record<string, { label: string; hint?: string }> = {
  title: {
    label: 'Başlık',
    hint: 'Kartın en üstündeki kalın yazı. Net ve dikkat çekici tut.',
  },
  body: {
    label: 'Açıklama',
    hint: 'Başlığın altında 1-2 satır görünür; teklif veya fayda detayı.',
  },
  cta: {
    label: 'Buton yazısı',
    hint: "Tıklama düğmesinde görünür kısa metin. Örn: 'Şimdi al', 'Detaylar', 'Kaydol'. Boş bırakırsan 'Keşfet' kullanılır.",
  },
  sponsor_name: {
    label: 'Sponsor adı',
    hint: 'Kartın üst şeridinde "Sponsorlu · X" şeklinde görünür.',
  },
  image_url: {
    label: 'Görsel',
  },
  video_url: {
    label: 'Video',
    hint: 'Opsiyonel — yüklerseniz reklam görsel yerine video oynatır. MP4/WebM, sessiz autoplay edilir.',
  },
  logo_url: {
    label: 'Logo',
  },
}

function labelForField(fieldName: string): string {
  return CREATIVE_FIELD_LABELS[fieldName]?.label ?? fieldName
}

function hintForField(fieldName: string): string | undefined {
  return CREATIVE_FIELD_LABELS[fieldName]?.hint
}

// Spec key → form field mapping. Image fields read *_size keys, text
// fields read *_max keys; everything else is treated as documentation.
// *_size_optional ile biten alanlar yüklemeye açıktır ama zorunlu değildir.
// *_max_seconds → opsiyonel video upload widget'ı; süre limiti client'da
//   <video>.duration ile doğrulanır.
type SpecField = {
  kind: 'text' | 'textarea' | 'image' | 'video'
  fieldName: keyof CampaignCreative
  maxLength?: number
  sizeHint?: string
  maxSeconds?: number
  optional?: boolean
}

function fieldsFromSpec(spec: Record<string, unknown>): SpecField[] {
  const out: SpecField[] = []
  for (const [k, v] of Object.entries(spec)) {
    if (k.endsWith('_max_seconds') && typeof v === 'number') {
      // 'video_max_seconds' → fieldName='video_url' (her zaman opsiyonel)
      const base = k.slice(0, -('_max_seconds'.length))
      const fieldName = `${base}_url` as keyof CampaignCreative
      out.push({ kind: 'video', fieldName, maxSeconds: v, optional: true })
    } else if (k.endsWith('_max') && typeof v === 'number') {
      const fieldName = k.slice(0, -4) as keyof CampaignCreative
      const kind = fieldName === 'body' ? 'textarea' : 'text'
      out.push({ kind, fieldName, maxLength: v })
    } else if (k.endsWith('_size_optional') && typeof v === 'string') {
      const base = k.slice(0, -('_size_optional'.length))
      const fieldName = `${base}_url` as keyof CampaignCreative
      out.push({ kind: 'image', fieldName, sizeHint: v, optional: true })
    } else if (k.endsWith('_size') && typeof v === 'string') {
      const base = k.slice(0, -5) // 'image_size' → 'image', 'logo_size' → 'logo'
      const fieldName = `${base}_url` as keyof CampaignCreative
      out.push({ kind: 'image', fieldName, sizeHint: v })
    }
  }
  // Stable order: images first, then videos, then short text, then textarea.
  out.sort((a, b) => {
    const order = { image: 0, video: 1, text: 2, textarea: 3 } as const
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

  // Paket tier'i: 1/3/6/12 ay. Süre, included impression ve CPM hep buradan.
  // Brand serbest impression girişi yapmaz — tier paketi seçer.
  const [durationMonths, setDurationMonths] = useState<DurationMonths>(
    (initial?.duration_months as DurationMonths | undefined) ?? DEFAULT_DURATION_MONTHS,
  )

  const [activePricing, setActivePricing] = useState<ActivePricing[]>([])
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null)

  // Load brands list once for super_admin selector.
  useEffect(() => {
    if (isSuper) {
      brandsApi.list(false).then(setBrands).catch(() => setBrands([]))
    }
  }, [isSuper])

  // Aktif CPM fiyat listesi (form değişiminde re-fetch gerekmez; modal
  // ömrü boyunca tek seferlik). Backend her placement için tek satır döndürür.
  useEffect(() => {
    pricingApi
      .listActive()
      .then(setActivePricing)
      .catch(() => setActivePricing([]))
  }, [])
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
      addMonths(new Date(), DEFAULT_DURATION_MONTHS).toISOString().slice(0, 16),
  )

  // Cüzdan bakiyesi: brand seçili olduğunda fetch et. Edit'te yine
  // göstermek için load ederiz; submit edit modunda balance check yapmaz
  // (target/budget kilitli).
  const effectiveBrandIdForFetch = isEdit
    ? initial?.brand_id ?? null
    : isSuper
      ? brandId || null
      : me?.brand?.id ?? me?.impersonating_brand?.id ?? null
  useEffect(() => {
    if (!effectiveBrandIdForFetch) {
      setWalletBalanceCents(null)
      return
    }
    walletApi
      .get(effectiveBrandIdForFetch)
      .then((w) => setWalletBalanceCents(w.balance_cents))
      .catch(() => setWalletBalanceCents(null))
  }, [effectiveBrandIdForFetch])
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
  // forum_thread artık gerçek bir forum_topics satırı oluşturur; kullanıcı
  // click_url'e değil topic detayına gider. Click URL gizli; submit'te
  // forum index URL'i otomatik doldurulur (schema NOT NULL).
  const isForumThread = placementKey === 'forum_thread'
  // gated_interstitial: dış link yok, click tracking yok. Click URL
  // anlamsız → form'da gizli, schema NOT NULL için '/' placeholder gönderilir.
  const isGatedInterstitial = placementKey === 'gated_interstitial'
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
  const [showBadgeEmojiPicker, setShowBadgeEmojiPicker] = useState(false)
  const badgeEmojiRef = useRef<HTMLDivElement>(null)
  // Sponsored badge için opsiyonel zengin kriter spec'i.
  const [badgeCriteria, setBadgeCriteria] = useState<BadgeCriteria | null>(null)

  const placement = useMemo(
    () => placements.find((p) => p.key === placementKey),
    [placementKey, placements],
  )

  const fields = useMemo(
    () => (placement ? fieldsFromSpec(placement.creative_spec) : []),
    [placement],
  )

  // Süre chip değiştiyse ends_at otomatik hesaplanır (starts_at + N ay).
  useEffect(() => {
    if (isEdit) return
    const start = new Date(startsAt)
    if (Number.isNaN(start.getTime())) return
    setEndsAt(addMonths(start, durationMonths).toISOString().slice(0, 16))
  }, [durationMonths, startsAt, isEdit])

  // Seçilen placement için tüm tier paketleri (chip render'ında kullanılır).
  const placementTiers = useMemo(
    () => activePricing.filter((p) => p.placement_key === placementKey),
    [activePricing, placementKey],
  )

  // (placement, durationMonths) tier paketi: CPM + included impressions.
  const activeTier = useMemo(
    () => placementTiers.find((p) => p.duration_months === durationMonths) ?? null,
    [placementTiers, durationMonths],
  )

  // Paket toplam fiyatı = included × CPM / 1000, 100 TL'ye yuvarla.
  const costPreviewCents = useMemo(() => {
    if (activeTier == null) return null
    return cpmCostCents(activeTier.included_impressions, activeTier.unit_price_cents)
  }, [activeTier])

  const insufficientBalance =
    !isEdit &&
    walletBalanceCents != null &&
    costPreviewCents != null &&
    costPreviewCents > 0 &&
    costPreviewCents > walletBalanceCents

  // Emoji picker dışına tıklayınca kapat.
  useEffect(() => {
    if (!showBadgeEmojiPicker) return
    function handleClick(e: MouseEvent) {
      if (
        badgeEmojiRef.current &&
        !badgeEmojiRef.current.contains(e.target as Node)
      ) {
        setShowBadgeEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showBadgeEmojiPicker])

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
    // forum_thread için kullanıcı click URL girmez (thread detayına gider);
    // schema NOT NULL olduğu için placeholder dolduruyoruz.
    const effectiveClickUrl = isForumThread
      ? clickUrl.trim() || '/forum'
      : isGatedInterstitial
        ? clickUrl.trim() || '/'
        : clickUrl.trim()
    if (!isForumThread && !isGatedInterstitial && !effectiveClickUrl)
      return setError('Click URL gerekli')
    const start = new Date(startsAt)
    const end = new Date(endsAt)
    if (end <= start) return setError('Bitiş başlangıçtan sonra olmalı')

    // Per-spec text-length checks (mirrors backend validate_creative).
    // Upload hâlâ devam ediyorsa submit'i bloklayalım — eski bug: kullanıcı
     // "Yükleniyor…" devam ederken Oluştur'a basıp image_url'siz kampanya
     // kaydediyordu.
    if (uploadingField || badgeImageUploading) {
      return setError('Görsel yüklemesi tamamlanmadan kaydedilemez')
    }

    for (const f of fields) {
      const val = (creative[f.fieldName] as string | undefined) ?? ''
      if (f.kind === 'image' || f.kind === 'video') {
        // Placement spec'inde *_size varsa görsel zorunlu (placement
        // kart tasarımı görsel olmadan kırık görünür). *_size_optional
        // ve *_max_seconds (video) ise yüklemeye izin verir ama
        // zorunluluk koymaz.
        if (!val && !f.optional) {
          return setError(`${labelForField(f.fieldName as string)} zorunlu — lütfen yükleyin`)
        }
        continue
      }
      if (f.maxLength && [...val].length > f.maxLength) {
        return setError(
          `${labelForField(f.fieldName as string)} en fazla ${f.maxLength} karakter olmalı`,
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

    const w = isBadgeSponsor ? 1 : parseInt(weight, 10) || 1
    const dryRun = isBadgeSponsor ? false : isDryRun

    // Create modunda tier paketi server tarafında zorunlu; brand impression
    // girmez, tier seçimiyle paket büyüklüğü belirlenir.
    if (!isEdit) {
      if (activeTier == null) {
        return setError('Bu tier için aktif paket yok')
      }
      if (insufficientBalance) {
        return setError('Brand bakiyesi yetersiz')
      }
    }

    setSaving(true)
    try {
      if (isEdit && initial) {
        // click_url is locked at creation — backend ignores it on update.
        // Sending it would be silently dropped; we omit it for clarity.
        await adminApi.updateCampaign(initial.id, {
          creative,
          target_segment,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          weight: w,
          is_dry_run: dryRun,
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
          click_url: effectiveClickUrl,
          target_segment,
          starts_at: new Date(startsAt).toISOString(),
          weight: w,
          is_dry_run: dryRun,
          duration_months: durationMonths,
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
                  ...(badgeCriteria ? { criteria: badgeCriteria } : {}),
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
            <div className={`grid ${isSuper ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              {isSuper && (
                <Field label="Brand">
                  {!isEdit ? (
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
                      value={initial?.brand_name ?? ''}
                      disabled
                      className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm opacity-60"
                    />
                  )}
                </Field>
              )}
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

            {/* Paket: ay-tier + hedef impression. Maliyet (placement,
                duration) tier fiyatından hesaplanır, 100 TL katına yuvarlanır,
                brand bakiyesinden anlık düşer. Edit modunda read-only — paket
                kilitli, "Uzat" ile değişir. */}
            {isEdit ? (
              <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 text-xs text-dark-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-dark-400">Paket süresi</span>
                  <span className="font-mono text-white">
                    {initial?.duration_months != null
                      ? `${initial.duration_months} ay`
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Hedef impression</span>
                  <span className="font-mono text-white">
                    {initial?.target_impressions != null
                      ? initial.target_impressions.toLocaleString()
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Ödenen tutar</span>
                  <span className="font-mono text-white">
                    {initial?.total_budget_cents != null
                      ? formatTRY(initial.total_budget_cents)
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Birim fiyat (kayıt anı)</span>
                  <span className="font-mono text-white">
                    {initial?.unit_price_cents != null
                      ? `${formatTRY(initial.unit_price_cents)} / 1k`
                      : '—'}
                  </span>
                </div>
                <p className="text-dark-500 text-[11px] pt-1">
                  Paketteki süre/hedef değiştirilemez. Eklemek için detay
                  sayfasındaki <strong>Uzat</strong> butonunu kullanın.
                </p>
              </div>
            ) : (
              <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 space-y-3">
                <div className="text-xs text-dark-400 font-medium">
                  Paket seçimi
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {DURATION_MONTH_OPTIONS.map((m) => {
                    const tier = placementTiers.find(
                      (p) => p.duration_months === m,
                    )
                    const tierTotal = tier
                      ? cpmCostCents(tier.included_impressions, tier.unit_price_cents)
                      : null
                    const selected = durationMonths === m
                    const disabled = tier == null
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={disabled}
                        onClick={() => setDurationMonths(m)}
                        className={`text-left rounded-lg border p-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          selected
                            ? 'bg-neon-500/15 border-neon-500/40'
                            : 'bg-dark-900 border-dark-700 hover:border-dark-500'
                        }`}
                      >
                        <div className="text-[11px] uppercase tracking-wider text-dark-400">
                          {m} ay paketi
                        </div>
                        {tier ? (
                          <>
                            <div className="text-lg font-bold text-white font-mono mt-1">
                              {tierTotal != null ? formatTRY(tierTotal) : '—'}
                            </div>
                            <div className="text-[10px] text-dark-400 font-mono">
                              {tier.included_impressions.toLocaleString()} imp
                            </div>
                            <div className="text-[10px] text-dark-500 font-mono">
                              CPM {formatTRY(tier.unit_price_cents)} / 1k
                            </div>
                          </>
                        ) : (
                          <div className="text-[10px] text-dark-500 mt-1">
                            Paket tanımsız
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className="border-t border-dark-700 pt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-dark-400">Paket toplam fiyatı</span>
                    <span className="font-mono text-white">
                      {costPreviewCents != null
                        ? formatTRY(costPreviewCents)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-dark-400">Brand bakiyesi</span>
                    <span
                      className={`font-mono ${
                        insufficientBalance ? 'text-red-400' : 'text-white'
                      }`}
                    >
                      {walletBalanceCents != null
                        ? formatTRY(walletBalanceCents)
                        : '—'}
                    </span>
                  </div>
                  {insufficientBalance && walletBalanceCents != null && costPreviewCents != null && (
                    <p className="text-[11px] text-red-400">
                      ⚠ Yetersiz bakiye —{' '}
                      {formatTRY(costPreviewCents - walletBalanceCents)} daha gerek.
                      {!isSuper && ' Platform operatörüyle iletişime geçin.'}
                    </p>
                  )}
                  {activeTier == null && (
                    <p className="text-[11px] text-yellow-400">
                      ⚠ Bu tier için paket tanımlı değil. Super_admin Placements
                      → Fiyatlandırma'dan ekleyebilir.
                    </p>
                  )}
                  <p className="text-[10px] text-dark-500 pt-1">
                    Brand tier paketini satın alır. İhtiyaç fazlası gelirse "Uzat"
                    ile aynı CPM oranından ek impression eklenebilir.
                  </p>
                </div>
              </div>
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
                        <div className="relative" ref={badgeEmojiRef}>
                          <button
                            type="button"
                            onClick={() =>
                              setShowBadgeEmojiPicker((v) => !v)
                            }
                            className="w-24 h-12 bg-dark-900 border border-dark-600 rounded-lg flex items-center justify-center gap-2 cursor-pointer hover:bg-dark-800"
                          >
                            {badgeIcon ? (
                              <span className="text-2xl">{badgeIcon}</span>
                            ) : (
                              <>
                                <Smile size={16} className="text-dark-500" />
                                <span className="text-xs text-dark-500">
                                  Seç
                                </span>
                              </>
                            )}
                          </button>
                          {showBadgeEmojiPicker && (
                            <div className="absolute top-full left-0 mt-1 z-50">
                              <EmojiPicker
                                theme={Theme.DARK}
                                onEmojiClick={(e) => {
                                  setBadgeIcon(e.emoji)
                                  setShowBadgeEmojiPicker(false)
                                }}
                                width={320}
                                height={400}
                              />
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-dark-500">
                          Emoji picker'dan seç veya yapıştır (≤10 karakter).
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        {badgeImageUrl ? (
                          <img
                            src={badgeImageUrl}
                            alt="Badge görseli"
                            className="w-16 h-16 rounded-full object-contain bg-dark-900 ring-2 ring-neon-500/30"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-dark-900 border border-dark-700 flex items-center justify-center text-dark-600 text-[10px] text-center px-1">
                            önizleme
                          </div>
                        )}
                        <div className="flex-1">
                          <label className="inline-flex items-center gap-2 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-200 hover:bg-dark-600 transition-colors cursor-pointer text-xs font-medium">
                            <Upload size={14} />
                            {badgeImageUploading
                              ? 'Yükleniyor…'
                              : badgeImageUrl
                                ? 'Değiştir'
                                : 'PNG seç'}
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
                                  e.target.value = ''
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                          <p className="text-[11px] text-dark-500 mt-1.5">
                            Önerilen 256×256, kare PNG / JPG / WebP.
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

                  {/* Zengin kriterler (opsiyonel). Verilirse unlock evaluator
                      bu spec'i değerlendirir; legacy category/threshold yolu
                      yedek kalır. */}
                  <BadgeCriteriaBuilder
                    value={badgeCriteria}
                    onChange={setBadgeCriteria}
                  />
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

            {/* forum_thread için click URL anlamsız — kullanıcı thread
                detayına gider. gated_interstitial için de tıklama yok —
                gate yalnızca date submit'i ilerletir. Diğer placement'lar
                için affiliate-aware URL input.

                Edit modunda click URL kilitli — oluşturma anında verilir,
                sonradan değiştirilemez (badge sponsor URL'i ile divergence
                ve in-flight kampanyanın sessizce başka landing'e yönlenme
                riskini önler). */}
            {!isForumThread && !isGatedInterstitial && (
              <Field
                label="Click URL"
                hint={
                  isEdit
                    ? 'Click URL kampanya oluşturulurken kilitlenir, sonradan değiştirilemez.'
                    : "Elle URL girin veya sağdaki butonla affiliate link'lerinizden seçin."
                }
              >
                {isEdit ? (
                  <input
                    type="url"
                    value={clickUrl}
                    readOnly
                    disabled
                    className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-400 cursor-not-allowed"
                  />
                ) : (
                  <UrlWithAffiliatePicker
                    value={clickUrl}
                    onChange={setClickUrl}
                    placeholder="https://brand.com/landing"
                  />
                )}
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Başlangıç">
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm scheme-dark"
                />
              </Field>
              <Field
                label="Bitiş"
                hint={
                  !isEdit
                    ? `Başlangıç + ${durationMonths} ay otomatik hesaplandı`
                    : undefined
                }
              >
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  disabled={!isEdit}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm scheme-dark disabled:opacity-60"
                />
              </Field>
            </div>

            {/* Weight: aynı placement'ta birden fazla aktif kampanya
                varsa rotasyon ağırlığı. badge_sponsor'da rotation yok. */}
            {!isBadgeSponsor && (
              <Field label="Weight" hint="Aynı placement içinde rotasyon ağırlığı">
                <input
                  type="number"
                  min={1}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
                />
              </Field>
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
                creative={
                  // badge_sponsor için badge state'ini PreviewCreative'e
                  // çeviriyoruz — `creative` JSON'u boş, gerçek görsel
                  // alanları ayrı state'te tutuluyor.
                  isBadgeSponsor
                    ? ({
                        title: badgeName || initial?.brand_name,
                        body: badgeDescription,
                        icon:
                          badgeVisualMode === 'icon'
                            ? badgeIcon
                            : undefined,
                        image_url:
                          badgeVisualMode === 'image' && badgeImageUrl
                            ? badgeImageUrl
                            : undefined,
                        sponsor_name:
                          initial?.brand_name ??
                          brands.find((b) => b.id === brandId)?.display_name ??
                          me?.brand?.display_name ??
                          me?.impersonating_brand?.display_name,
                      } satisfies PreviewCreative)
                    : (creative as PreviewCreative)
                }
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
            disabled={
              saving ||
              uploadingField !== null ||
              badgeImageUploading ||
              (!isEdit && insufficientBalance)
            }
            title={
              uploadingField || badgeImageUploading
                ? 'Görsel yüklenirken kaydedilemez'
                : undefined
            }
            className="px-4 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? 'Kaydediliyor…'
              : uploadingField || badgeImageUploading
                ? 'Görsel yükleniyor…'
                : isEdit
                  ? 'Kaydet'
                  : 'Oluştur'}
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
  const fieldKey = field.fieldName as string
  const label = labelForField(fieldKey)
  const description = hintForField(fieldKey)
  const [durationError, setDurationError] = useState<string | null>(null)
  const meta =
    field.kind === 'image'
      ? `Önerilen boyut: ${field.sizeHint}${field.optional ? ' · opsiyonel' : ''}`
      : field.kind === 'video'
        ? `Maks ${field.maxSeconds}s${field.optional ? ' · opsiyonel' : ''}`
        : field.maxLength
          ? `${[...value].length}/${field.maxLength} karakter`
          : undefined

  // Video upload: süreyi <video>.duration üzerinden kontrol et,
  // limit aşılırsa hiç yüklemeye gitme.
  const handleVideoFile = (file: File) => {
    setDurationError(null)
    const maxSec = field.maxSeconds ?? 0
    if (maxSec <= 0) {
      onUpload(file)
      return
    }
    const url = URL.createObjectURL(file)
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      const seconds = probe.duration
      URL.revokeObjectURL(url)
      if (!Number.isFinite(seconds)) {
        setDurationError('Video süresi okunamadı — dosyayı kontrol edin')
        return
      }
      if (seconds > maxSec + 0.5) {
        setDurationError(
          `Video ${seconds.toFixed(1)}s — maksimum ${maxSec}s olabilir`,
        )
        return
      }
      onUpload(file)
    }
    probe.onerror = () => {
      URL.revokeObjectURL(url)
      setDurationError('Video açılamadı — desteklenen format MP4/WebM')
    }
    probe.src = url
  }

  if (field.kind === 'video') {
    return (
      <div>
        <div className="flex items-center justify-between text-[11px] text-dark-400 mb-1.5">
          <span className="font-medium">{label}</span>
          <span>{meta}</span>
        </div>
        <div className="flex items-center gap-3">
          {value ? (
            <>
              <video
                src={value}
                className="h-16 rounded border border-dark-700 bg-dark-950"
                muted
                playsInline
                controls
              />
              <button
                onClick={() => {
                  onChange('')
                  setDurationError(null)
                }}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Kaldır
              </button>
            </>
          ) : (
            <span className="text-xs text-dark-500">Henüz video yok</span>
          )}
          <label className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-xs cursor-pointer hover:bg-dark-600">
            <Upload size={12} />
            {uploading ? 'Yükleniyor…' : 'Yükle'}
            <input
              type="file"
              accept="video/mp4,video/webm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) handleVideoFile(f)
              }}
            />
          </label>
        </div>
        {durationError && (
          <p className="text-[10px] text-red-400 mt-1">{durationError}</p>
        )}
        {description && !durationError && (
          <p className="text-[10px] text-dark-500 mt-1">{description}</p>
        )}
      </div>
    )
  }

  if (field.kind === 'image') {
    return (
      <div>
        <div className="flex items-center justify-between text-[11px] text-dark-400 mb-1.5">
          <span className="font-medium">{label}</span>
          <span>{meta}</span>
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
        <span className="font-medium">{label}</span>
        <span
          className={
            field.maxLength && [...value].length > field.maxLength
              ? 'text-red-400'
              : ''
          }
        >
          {meta}
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
      {description && (
        <p className="text-[10px] text-dark-500 mt-1">{description}</p>
      )}
    </div>
  )
}
