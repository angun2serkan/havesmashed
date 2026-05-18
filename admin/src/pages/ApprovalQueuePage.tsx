import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { adminApi, type Campaign } from '@/services/api'
import StatusBadge from '@/components/StatusBadge'
import {
  PlacementPreview,
  type PreviewCreative,
} from '@/components/PlacementPreview'

export default function ApprovalQueuePage() {
  const [items, setItems] = useState<Campaign[] | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    setItems(null)
    adminApi
      .listPendingReview()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'))
  }
  useEffect(load, [])

  async function approve(id: string) {
    if (!confirm('Kampanyayı onayla ve yayına al?')) return
    try {
      await adminApi.approveCampaign(id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed')
    }
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="text-neon-500" />
          Approval Queue
        </h1>
        <p className="text-dark-400 text-sm mt-1">
          İnceleme bekleyen kampanyalar.
        </p>
      </header>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {items === null && (
        <div className="text-dark-400 text-sm">Yükleniyor…</div>
      )}
      {items?.length === 0 && (
        <div className="bg-dark-900 border border-dark-700 rounded-lg p-8 text-center text-dark-400">
          🎉 Bekleyen kampanya yok.
        </div>
      )}

      <div className="space-y-3">
        {items?.map((c) => (
          <ApprovalRow
            key={c.id}
            campaign={c}
            onApprove={() => approve(c.id)}
            onReject={() => setRejectingId(c.id)}
          />
        ))}
      </div>

      {rejectingId && (
        <RejectModal
          campaignId={rejectingId}
          onClose={() => setRejectingId(null)}
          onDone={() => {
            setRejectingId(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function ApprovalRow({
  campaign: c,
  onApprove,
  onReject,
}: {
  campaign: Campaign
  onApprove: () => void
  onReject: () => void
}) {
  const isBadgeSponsor = c.placement_key === 'badge_sponsor'
  const [showPreview, setShowPreview] = useState(isBadgeSponsor)

  return (
    <div className="bg-dark-900 border border-dark-700 rounded-lg p-4">
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-dark-500 font-mono">
              {c.brand_name}
            </span>
            <StatusBadge status={c.status} />
          </div>
          <h3 className="font-semibold text-white">
            {c.creative.title ?? c.click_url}
          </h3>
          <p className="text-xs text-dark-400 mt-1 truncate">
            {c.creative.body ?? c.click_url}
          </p>
          <div className="text-xs text-dark-500 mt-2 flex gap-4 flex-wrap">
            <span>
              Placement: <span className="text-dark-300">{c.placement_key}</span>
            </span>
            <span>
              {new Date(c.starts_at).toLocaleDateString('tr')} →{' '}
              {new Date(c.ends_at).toLocaleDateString('tr')}
            </span>
            {c.pricing_model && (
              <span>
                {c.pricing_model.toUpperCase()}
                {c.unit_price_cents && ` ${c.unit_price_cents}kr`}
                {c.total_budget_cents &&
                  ` · ${c.total_budget_cents.toLocaleString()}kr bütçe`}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Link
            to={`/ads/campaigns/${c.id}`}
            className="px-3 py-1 text-xs text-center text-dark-300 hover:text-white bg-dark-800 hover:bg-dark-700 rounded"
          >
            Detay
          </Link>
          {!isBadgeSponsor && (
            <button
              onClick={() => setShowPreview((v) => !v)}
              className="px-3 py-1 text-xs flex items-center gap-1 bg-dark-800 hover:bg-dark-700 text-dark-300 rounded"
            >
              {showPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Preview
            </button>
          )}
          <button
            onClick={onApprove}
            className="px-3 py-1 text-xs flex items-center gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded"
          >
            <Check size={12} /> Onayla
          </button>
          <button
            onClick={onReject}
            className="px-3 py-1 text-xs flex items-center gap-1 bg-red-500/15 hover:bg-red-500/25 text-red-300 rounded"
          >
            <X size={12} /> Reddet
          </button>
        </div>
      </div>

      {isBadgeSponsor && showPreview && (
        <BadgePreview campaignId={c.id} brandName={c.brand_name} />
      )}

      {!isBadgeSponsor && showPreview && (
        <div className="mt-4 pt-4 border-t border-dark-700">
          <PlacementPreview
            placementKey={c.placement_key}
            creative={c.creative as unknown as PreviewCreative}
          />
        </div>
      )}
    </div>
  )
}

const CATEGORY_LABELS: Record<string, string> = {
  dates: 'date sayısı',
  explore: 'şehir/ülke çeşitliliği',
  social: 'arkadaş sayısı',
  quality: 'ortalama puan',
}

function BadgePreview({
  campaignId,
  brandName,
}: {
  campaignId: string
  brandName: string
}) {
  type BadgeDto = Awaited<ReturnType<typeof adminApi.getCampaignBadge>>
  const [badge, setBadge] = useState<BadgeDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi
      .getCampaignBadge(campaignId)
      .then((b) => {
        if (!cancelled) setBadge(b)
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Badge bulunamadı')
      })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  if (error) {
    return (
      <div className="mt-4 pt-4 border-t border-dark-700 text-xs text-red-400">
        Badge yüklenemedi: {error}
      </div>
    )
  }
  if (!badge) {
    return (
      <div className="mt-4 pt-4 border-t border-dark-700 text-xs text-dark-400">
        Preview yükleniyor…
      </div>
    )
  }

  const unlockText = `${CATEGORY_LABELS[badge.category] ?? badge.category} ≥ ${badge.threshold}`

  return (
    <div className="mt-4 pt-4 border-t border-dark-700">
      <p className="text-xs text-dark-400 mb-3 font-medium uppercase tracking-wide">
        Badge önizleme — onaylarsan kullanıcı bunu görecek
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mock user-facing badge card — premium tier görünümü:
            magenta ring + glow, üstte PREMIUM chip. */}
        <div className="bg-linear-to-br from-dark-950 to-dark-900 border border-fuchsia-500/40 rounded-xl p-5 flex flex-col items-center text-center shadow-[0_0_24px_rgba(217,70,239,0.25)]">
          <span className="mb-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/40 text-[10px] uppercase tracking-widest font-semibold">
            ★ {badge.tier ?? 'premium'}
          </span>
          {badge.image_url ? (
            <img
              src={badge.image_url}
              alt={badge.name}
              className="w-20 h-20 object-contain rounded-full mb-3 ring-2 ring-fuchsia-500/60"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-fuchsia-500/10 ring-2 ring-fuchsia-500/40 flex items-center justify-center text-4xl mb-3">
              {badge.icon}
            </div>
          )}
          <h4 className="font-bold text-white text-base">{badge.name}</h4>
          <p className="text-xs text-dark-300 mt-1">{badge.description}</p>
          <p className="text-[11px] text-dark-500 mt-2">Unlock: {unlockText}</p>

          <div className="mt-4 pt-3 border-t border-dark-700 w-full">
            <p className="text-[10px] uppercase tracking-wider text-dark-500">
              Sponsored by
            </p>
            <p className="text-xs text-dark-200 mt-0.5">
              {badge.sponsor_name ?? brandName}
            </p>
          </div>
        </div>

        {/* Spec / metadata for reviewer */}
        <div className="text-xs space-y-2">
          <Row label="Ad" value={badge.name} />
          <Row label="İkon" value={badge.icon} />
          <Row
            label="Kategori"
            value={`${badge.category} (${CATEGORY_LABELS[badge.category] ?? '?'})`}
          />
          <Row label="Threshold" value={String(badge.threshold)} />
          <Row label="Gender" value={badge.gender} />
          <Row
            label="Sponsor click URL"
            value={badge.sponsor_click_url ?? '—'}
            mono
          />
          <Row label="Brand" value={brandName} />
          <Row label="Tier" value={badge.tier ?? 'premium'} />
          <Row label="Badge status" value={badge.status} />
          <div className="mt-3 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-[11px] text-yellow-200">
            <strong>Onay öncesi kontrol:</strong> threshold gerçekçi mi (çok
            düşük = k&lt;1000 segment riski)? Sponsor URL meşru affiliate link
            mi? Logo + ad sözleşmeyle uyumlu mu?
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-dark-500 w-32 shrink-0">{label}</span>
      <span
        className={`text-dark-200 break-all ${mono ? 'font-mono text-[11px]' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}

function RejectModal({
  campaignId,
  onClose,
  onDone,
}: {
  campaignId: string
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setLoading(true)
    setError('')
    try {
      await adminApi.rejectCampaign(campaignId, reason)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reject failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-2">Kampanyayı Reddet</h2>
        <p className="text-sm text-dark-400 mb-3">
          Brand_admin reddedilme sebebini görecek. Açıklayıcı yazın.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Reddedilme sebebi…"
          required
          className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white mb-3"
        />
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-dark-300">
            İptal
          </button>
          <button
            onClick={submit}
            disabled={loading || !reason.trim()}
            className="px-4 py-1.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Reddediliyor…' : 'Reddet'}
          </button>
        </div>
      </div>
    </div>
  )
}
