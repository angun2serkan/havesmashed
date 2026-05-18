// Placement CPM birim fiyat güncelleme modal'ı.
//
// Yeni fiyat girişi: backend eski satırın effective_to'sunu NOW yapıp
// yeni satır insert eder. Açık kampanyalar etkilenmez — onların birim
// fiyatı `ad_campaigns.unit_price_cents`'te kilitli.

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { pricingApi, type DurationMonths } from '@/services/api'
import { formatTRY } from '@/lib/formatTRY'

function roundUpTo100TL(cents: number): number {
  if (cents <= 0) return 0
  const unit = 10_000
  return Math.ceil(cents / unit) * unit
}

export function UpdatePricingModal({
  placementKey,
  placementName,
  durationMonths,
  currentUnitPriceCents,
  currentIncludedImpressions,
  onClose,
  onSaved,
}: {
  placementKey: string
  placementName: string
  durationMonths: DurationMonths
  currentUnitPriceCents: number | null
  currentIncludedImpressions: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [priceTry, setPriceTry] = useState(
    currentUnitPriceCents != null
      ? Math.floor(currentUnitPriceCents / 100).toString()
      : '',
  )
  const [includedImpressions, setIncludedImpressions] = useState(
    currentIncludedImpressions != null
      ? currentIncludedImpressions.toString()
      : '',
  )
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedPrice = Number(priceTry)
  const validPrice = Number.isInteger(parsedPrice) && parsedPrice > 0
  const parsedIncluded = parseInt(includedImpressions, 10)
  const validIncluded =
    Number.isFinite(parsedIncluded) && parsedIncluded > 0

  // Paket toplam fiyatı önizleme: CPM × bundle / 1000, 100 TL'ye yuvarla.
  const totalCostCents = useMemo(() => {
    if (!validPrice || !validIncluded) return null
    const cpmCents = parsedPrice * 100
    const raw = Math.ceil((parsedIncluded * cpmCents) / 1000)
    return roundUpTo100TL(raw)
  }, [validPrice, validIncluded, parsedPrice, parsedIncluded])

  async function onSave() {
    setError(null)
    if (!validPrice) {
      setError('Pozitif tam sayı TL girin')
      return
    }
    if (!validIncluded) {
      setError('Pozitif impression sayısı girin')
      return
    }
    setSaving(true)
    try {
      await pricingApi.update(
        placementKey,
        parsedPrice * 100,
        durationMonths,
        parsedIncluded,
        notes.trim() || undefined,
      )
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div>
            <h3 className="text-lg font-semibold">
              Fiyatı Güncelle — {durationMonths} ay tier
            </h3>
            <p className="text-xs text-dark-400 mt-0.5">
              {placementName} <span className="font-mono">({placementKey})</span>
            </p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="px-3 py-2.5 bg-dark-950 border border-dark-700 rounded-lg text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-dark-400">Mevcut fiyat (1.000 imp)</span>
              <span className="font-mono text-white">
                {currentUnitPriceCents != null
                  ? formatTRY(currentUnitPriceCents)
                  : 'Tanımlı değil'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-400">Mevcut paket impression</span>
              <span className="font-mono text-white">
                {currentIncludedImpressions != null
                  ? currentIncludedImpressions.toLocaleString()
                  : 'Tanımlı değil'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-dark-400 mb-1.5 font-medium">
              Birim fiyat (TL / 1.000 impression)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                step={1}
                value={priceTry}
                onChange={(e) => setPriceTry(e.target.value)}
                placeholder="50"
                className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neon-500"
              />
              <span className="text-sm text-dark-400">TL</span>
            </div>
            <p className="text-[10px] text-dark-500 mt-1.5">
              CPM oranı. Brand uzatmada bu orandan ek impression alır.
            </p>
          </div>

          <div>
            <label className="block text-xs text-dark-400 mb-1.5 font-medium">
              Paket impression sayısı
            </label>
            <input
              type="number"
              min={1000}
              step={1000}
              value={includedImpressions}
              onChange={(e) => setIncludedImpressions(e.target.value)}
              placeholder="100000"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neon-500"
            />
            <p className="text-[10px] text-dark-500 mt-1.5">
              Brand bu tier'i seçince bu kadar impression hakkı alır. Toplam
              paket fiyatı = CPM × impression / 1.000 (100 TL'ye yuvarlanır).
            </p>
          </div>

          {totalCostCents != null && (
            <div className="px-3 py-2 bg-neon-500/5 border border-neon-500/20 rounded-lg text-xs flex items-center justify-between">
              <span className="text-dark-300">Paket toplam fiyatı</span>
              <span className="font-mono text-neon-400">
                {formatTRY(totalCostCents)}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs text-dark-400 mb-1.5 font-medium">
              Notlar (opsiyonel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Q2 fiyat zammı"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neon-500"
            />
          </div>

          <p className="text-[10px] text-dark-500">
            Açık kampanyalar etkilenmez; yeni değerler sadece yeni
            kampanya/uzatma'da uygulanır.
          </p>

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
            disabled={saving || !validPrice || !validIncluded}
            className="px-4 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-neon-500/30"
          >
            {saving ? 'Kaydediliyor…' : 'Güncelle'}
          </button>
        </div>
      </div>
    </div>
  )
}
