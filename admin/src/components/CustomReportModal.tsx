// Custom report wizard.
//
// Lets the operator tailor a media kit before export:
//   * Brand name → goes onto the cover slide / page
//   * Date window
//   * Segment filter (only include checked segment_keys)
//   * Free-text notes appended as a final slide
//   * Format choice (PDF / PPTX / CSV)
//
// Renders inline above any settings, so changes preview immediately
// before the export call fires.

import { useState } from 'react'
import { X, FileDown, FileText } from 'lucide-react'
import type { MediaKitOptions } from '@/lib/mediaKit'

const SEGMENT_LABELS: Record<string, string> = {
  single_proxy: 'Single (proxy)',
  active_dater_30d: 'Active Dater (30g)',
  high_frequency_30d: 'High Frequency (5+/30g)',
  partner_gender_majority: 'Partner Cinsiyet Çoğunluğu',
  partner_age_range: 'Partner Yaş Aralığı',
  top_city_dates: 'Top Şehirler',
  tag_category: 'Tag Kategorisi',
}

const PRESETS: Record<string, { brand: string; segments: string[]; notes: string }> = {
  bumble: {
    brand: 'Bumble',
    segments: [
      'single_proxy',
      'active_dater_30d',
      'high_frequency_30d',
      'top_city_dates',
      'partner_age_range',
      'partner_gender_majority',
    ],
    notes:
      'Focus segments: single proxy + active dater (recently single, high-LTV dating-app target). City breakdown for geo-tier ad spend.',
  },
  durex: {
    brand: 'Durex',
    segments: [
      'active_dater_30d',
      'high_frequency_30d',
      'top_city_dates',
      'partner_age_range',
      'partner_gender_majority',
    ],
    notes:
      'Focus: sexually-active proxy via 30-day frequency cohorts. City heatmap for retail/billboard. Age + gender mix for targeting.',
  },
  sextoy: {
    brand: '',
    segments: [
      'active_dater_30d',
      'partner_gender_majority',
      'partner_age_range',
      'tag_category',
      'top_city_dates',
    ],
    notes:
      'Focus: female-share via partner_gender_majority, adventurous via tag_category mix, frequency for engagement.',
  },
}

export function CustomReportModal({
  defaultDays,
  availableSegments,
  onClose,
  onExport,
}: {
  defaultDays: number
  availableSegments: string[]
  onClose: () => void
  onExport: (
    kind: 'pdf' | 'pptx' | 'csv',
    opts: Partial<MediaKitOptions>,
  ) => void | Promise<void>
}) {
  const [brand, setBrand] = useState('')
  const [days, setDays] = useState(defaultDays)
  const [picked, setPicked] = useState<Set<string>>(new Set(availableSegments))
  const [notes, setNotes] = useState('')

  const togglePick = (key: string) => {
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const applyPreset = (k: keyof typeof PRESETS) => {
    const p = PRESETS[k]
    setBrand(p.brand)
    setNotes(p.notes)
    setPicked(new Set(p.segments.filter((s) => availableSegments.includes(s))))
  }

  const fire = (kind: 'pdf' | 'pptx' | 'csv') =>
    onExport(kind, {
      brandName: brand.trim() || null,
      notes: notes.trim() || null,
      segmentKeys: Array.from(picked),
      days,
    })

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-dark-700 sticky top-0 bg-dark-900">
          <h3 className="text-lg font-semibold">Custom Report</h3>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Presets */}
          <div>
            <label className="block text-xs text-dark-400 mb-2">Hızlı şablon</label>
            <div className="flex flex-wrap gap-2">
              {Object.keys(PRESETS).map((k) => (
                <button
                  key={k}
                  onClick={() => applyPreset(k as keyof typeof PRESETS)}
                  className="px-3 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-xs hover:bg-dark-700"
                >
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Brand */}
          <div>
            <label className="block text-xs text-dark-400 mb-2">
              Brand ismi (kapakta görünür)
            </label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Durex, Bumble, …"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Window */}
          <div>
            <label className="block text-xs text-dark-400 mb-2">Veri penceresi</label>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
            >
              <option value={7}>Son 7 gün</option>
              <option value={30}>Son 30 gün</option>
              <option value={90}>Son 90 gün</option>
              <option value={180}>Son 180 gün</option>
              <option value={365}>Son 1 yıl</option>
            </select>
          </div>

          {/* Segments */}
          <div>
            <label className="block text-xs text-dark-400 mb-2">
              Dahil edilecek segmentler
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-dark-800 border border-dark-700 rounded-lg p-3">
              {availableSegments.length === 0 && (
                <p className="text-xs text-dark-500">Henüz aggregate veri yok.</p>
              )}
              {availableSegments.map((k) => (
                <label
                  key={k}
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(k)}
                    onChange={() => togglePick(k)}
                    className="accent-neon-500"
                  />
                  <span className="text-dark-200">{SEGMENT_LABELS[k] ?? k}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-dark-500 mt-1">
              İşaretli olmayan segmentler raporda görünmez. Pitch'e zorla rahatsız eden
              segmentleri çıkarmak için kullan.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-dark-400 mb-2">
              Notlar (raporun son sayfasında)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Pitch için özel mesaj, fiyat aralığı, vs."
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="border-t border-dark-700 p-5 flex items-center justify-end gap-2 sticky bottom-0 bg-dark-900">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-200 hover:bg-dark-700"
          >
            İptal
          </button>
          <button
            onClick={() => fire('csv')}
            disabled={picked.size === 0}
            className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-dark-100 border border-dark-600 rounded-lg text-sm hover:bg-dark-600 disabled:opacity-50"
          >
            <FileDown size={14} />
            CSV
          </button>
          <button
            onClick={() => fire('pptx')}
            disabled={picked.size === 0}
            className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-dark-100 border border-dark-600 rounded-lg text-sm hover:bg-dark-600 disabled:opacity-50"
          >
            <FileText size={14} />
            PPTX
          </button>
          <button
            onClick={() => fire('pdf')}
            disabled={picked.size === 0}
            className="flex items-center gap-2 px-4 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 disabled:opacity-50"
          >
            <FileDown size={14} />
            PDF Üret
          </button>
        </div>
      </div>
    </div>
  )
}
