// Kampanya impression-only uzatma modal'ı.
//
// "Tier = commitment rate" modeli: kampanya açılırken seçilen ay-tier'in
// CPM'i `unit_price_cents` snapshot'ı olarak kilitlenir. Uzatma yalnız ek
// impression ekler; brand zaten ödediği takvim hakkına tekrar para vermez.
//
// BRAND_BALANCE_PLAN.md §5.3 — brand_admin (own) + super_admin yetkili.
// `paused_reason='impression_cap_reached'` durumunda backend uzatmayı
// resume olarak işler (status='active', paused_reason=NULL).

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import {
  campaignExtendApi,
  walletApi,
  type Campaign,
} from '@/services/api'
import { formatTRY } from '@/lib/formatTRY'

function roundUpTo100TL(cents: number): number {
  if (cents <= 0) return 0
  const unit = 10_000
  return Math.ceil(cents / unit) * unit
}

function cpmCostCents(extraImpressions: number, unitPriceCents: number): number {
  if (extraImpressions <= 0 || unitPriceCents <= 0) return 0
  const raw = Math.ceil((extraImpressions * unitPriceCents) / 1000)
  return roundUpTo100TL(raw)
}

export function ExtendCampaignModal({
  campaign,
  currentImpressionsTotal,
  onClose,
  onExtended,
}: {
  campaign: Campaign
  currentImpressionsTotal: number
  onClose: () => void
  onExtended: () => void
}) {
  const [extraImpressions, setExtraImpressions] = useState<string>('50000')
  const [description, setDescription] = useState('')
  const [balanceCents, setBalanceCents] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    walletApi
      .get(campaign.brand_id)
      .then((w) => setBalanceCents(w.balance_cents))
      .catch(() => setBalanceCents(null))
  }, [campaign.brand_id])

  // Kampanyanın orijinal tier CPM'i — uzatma bunu kullanır.
  const unitPriceCents = campaign.unit_price_cents

  const extraImpressionsNum = useMemo(() => {
    const n = parseInt(extraImpressions, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }, [extraImpressions])

  const extraCostCents = useMemo(() => {
    if (unitPriceCents == null) return null
    return cpmCostCents(extraImpressionsNum, unitPriceCents)
  }, [extraImpressionsNum, unitPriceCents])

  const insufficient =
    balanceCents != null &&
    extraCostCents != null &&
    extraCostCents > 0 &&
    extraCostCents > balanceCents

  const newTargetImpressions =
    (campaign.target_impressions ?? 0) + extraImpressionsNum

  const onSave = async () => {
    setError(null)
    if (extraImpressionsNum <= 0) return setError('Ek impression > 0 olmalı')
    if (unitPriceCents == null) {
      return setError('Bu kampanyanın kilitli tier fiyatı yok (legacy)')
    }
    if (insufficient) return setError('Brand bakiyesi yetersiz')

    setSaving(true)
    try {
      await campaignExtendApi.extend(
        campaign.id,
        extraImpressionsNum,
        description.trim() || undefined,
      )
      onExtended()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uzatma başarısız')
    } finally {
      setSaving(false)
    }
  }

  const progressPct =
    campaign.target_impressions && campaign.target_impressions > 0
      ? Math.min(100, (currentImpressionsTotal / campaign.target_impressions) * 100)
      : null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div>
            <h3 className="text-lg font-semibold">İmpression Ekle</h3>
            <p className="text-xs text-dark-400 mt-0.5">
              {campaign.brand_name} · {campaign.placement_key}
            </p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-dark-950 border border-dark-700 rounded-lg p-3 text-xs space-y-1">
            <Row
              label="Paket bitişi"
              value={`${new Date(campaign.ends_at).toLocaleDateString('tr-TR')} (değişmiyor)`}
            />
            <Row
              label="Mevcut hedef"
              value={
                campaign.target_impressions != null
                  ? `${campaign.target_impressions.toLocaleString()} impression`
                  : '—'
              }
            />
            <Row
              label="Mevcut gösterim"
              value={`${currentImpressionsTotal.toLocaleString()}${
                progressPct != null ? ` (%${progressPct.toFixed(1)})` : ''
              }`}
            />
            <Row
              label="Kilitli tier"
              value={
                campaign.duration_months != null && unitPriceCents != null
                  ? `${campaign.duration_months} ay · ${formatTRY(unitPriceCents)} / 1.000 imp`
                  : unitPriceCents != null
                    ? `${formatTRY(unitPriceCents)} / 1.000 imp`
                    : '—'
              }
            />
          </div>

          <Field
            label="Ek impression"
            hint={`Yeni hedef: ${newTargetImpressions.toLocaleString()}. Süre değişmez.`}
          >
            <input
              type="number"
              min={1000}
              step={1000}
              value={extraImpressions}
              onChange={(e) => setExtraImpressions(e.target.value)}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </Field>

          <Field label="Açıklama (opsiyonel)" hint="Audit log'a yazılır.">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ör. Kasım kampanyası ek envanter"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
            />
          </Field>

          <div className="border-t border-dark-700 pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-dark-400">Ek maliyet</span>
              <span className="font-mono text-white">
                {extraCostCents != null ? formatTRY(extraCostCents) : '—'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-dark-400">Brand bakiyesi</span>
              <span
                className={`font-mono ${insufficient ? 'text-red-400' : 'text-white'}`}
              >
                {balanceCents != null ? formatTRY(balanceCents) : '—'}
              </span>
            </div>
            {insufficient && balanceCents != null && extraCostCents != null && (
              <p className="text-[11px] text-red-400">
                ⚠ Yetersiz bakiye —{' '}
                {formatTRY(extraCostCents - balanceCents)} daha gerek.
              </p>
            )}
          </div>

          {campaign.paused_reason === 'impression_cap_reached' && (
            <div className="px-3 py-2 bg-neon-500/10 border border-neon-500/30 rounded text-[11px] text-neon-300">
              Bu kampanya hedef gösterime ulaştığı için duraklatıldı. Ek
              impression başarılı olursa otomatik olarak <strong>devam</strong> eder.
            </div>
          )}

          <div className="px-3 py-2 bg-dark-800/60 border border-dark-700 rounded text-[11px] text-dark-400 leading-relaxed">
            Yeni bir süre lazımsa <strong>Yeni Kampanya</strong> ile o anki tier
            fiyatından fresh paket aç — uzatma yalnız bu kampanyanın kilitli
            tier oranıyla ek envanter satışıdır.
          </div>

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
            onClick={onSave}
            disabled={saving || insufficient || extraCostCents == null}
            className="px-4 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Ekleniyor…' : 'İmpression Ekle'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-dark-400">{label}</span>
      <span className="font-mono text-white">{value}</span>
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
      <label className="block text-xs text-dark-400 mb-1.5 font-medium">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-dark-500 mt-1.5">{hint}</p>}
    </div>
  )
}
