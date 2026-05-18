// Wallet mutation modal: top-up / adjust / refund tek bir bileşende.
// `kind` prop'u UI ve API çağrısını belirler.
//
//  - topup: amount > 0; "Bakiye Yükle".
//  - refund: amount > 0; opsiyonel campaign_id; "İade".
//  - adjust: signed amount (≠ 0); "Manuel Düzeltme".
//
// Tüm tutarlar 100 TL adımında. Input "TL" gösterir, backend'e cents
// gönderilir (× 100). Backend ayrıca CHECK constraint ile kat zorunlu.

import { useState } from 'react'
import { X } from 'lucide-react'
import { walletApi } from '@/services/api'
import { formatTRY } from '@/lib/formatTRY'

export type WalletActionKind = 'topup' | 'adjust' | 'refund'

const KIND_META: Record<WalletActionKind, {
  title: string
  saveLabel: string
  hint: string
  allowNegative: boolean
  saveColor: string
}> = {
  topup: {
    title: 'Bakiye Yükle',
    saveLabel: 'Yatır',
    hint: 'Brand bakiyesine eklemek istediğin tutar (100 TL katları).',
    allowNegative: false,
    saveColor: 'bg-accent-green/20 text-accent-green border-accent-green/30 hover:bg-accent-green/30',
  },
  adjust: {
    title: 'Manuel Düzeltme',
    saveLabel: 'Düzelt',
    hint: 'Pozitif: bakiyeye ekle. Negatif: bakiyeden düş. Açıklama zorunlu.',
    allowNegative: true,
    saveColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30',
  },
  refund: {
    title: 'İade',
    saveLabel: 'İade Et',
    hint: 'Brand bakiyesine geri yatırılacak tutar (banka iadesi değil).',
    allowNegative: false,
    saveColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30',
  },
}

export function WalletActionModal({
  brandId,
  brandName,
  currentBalanceCents,
  kind,
  onClose,
  onSaved,
}: {
  brandId: string
  brandName: string
  currentBalanceCents: number
  kind: WalletActionKind
  onClose: () => void
  onSaved: () => void
}) {
  const meta = KIND_META[kind]
  // Adjust için signed; topup/refund için pozitif. Input TL cinsinden integer.
  const [amountTry, setAmountTry] = useState<string>('')
  const [description, setDescription] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedTry = parseTRY(amountTry, meta.allowNegative)

  const onSave = async () => {
    setError(null)
    if (parsedTry == null || parsedTry === 0) {
      setError(meta.allowNegative ? 'Tutar boş veya sıfır olamaz' : 'Pozitif tutar girin')
      return
    }
    if (parsedTry % 100 !== 0) {
      setError('Tutar 100 TL katı olmalı')
      return
    }
    if (!description.trim()) {
      setError('Açıklama zorunlu')
      return
    }
    const cents = parsedTry * 100
    setSaving(true)
    try {
      if (kind === 'topup') await walletApi.topup(brandId, cents, description.trim())
      else if (kind === 'adjust') await walletApi.adjust(brandId, cents, description.trim())
      else
        await walletApi.refund(
          brandId,
          cents,
          description.trim(),
          campaignId.trim() || undefined,
        )
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Başarısız')
    } finally {
      setSaving(false)
    }
  }

  const newBalanceCents =
    parsedTry != null ? currentBalanceCents + parsedTry * 100 : currentBalanceCents

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div>
            <h3 className="text-lg font-semibold">{meta.title}</h3>
            <p className="text-xs text-dark-400 mt-0.5">{brandName}</p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="px-3 py-2.5 bg-dark-950 border border-dark-700 rounded-lg flex items-center justify-between text-sm">
            <span className="text-dark-400">Mevcut bakiye</span>
            <span className="font-mono text-white">
              {formatTRY(currentBalanceCents)}
            </span>
          </div>

          <Field label="Tutar (TL)" hint={meta.hint}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step={100}
                min={meta.allowNegative ? undefined : 100}
                value={amountTry}
                onChange={(e) => setAmountTry(e.target.value)}
                placeholder={meta.allowNegative ? '500 veya -300' : '500'}
                className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neon-500"
              />
              <span className="text-sm text-dark-400">TL</span>
            </div>
            {parsedTry != null && parsedTry !== 0 && parsedTry % 100 === 0 && (
              <p className="text-[11px] text-dark-500 mt-1.5">
                Yeni bakiye: {formatTRY(newBalanceCents)}
              </p>
            )}
          </Field>

          {kind === 'refund' && (
            <Field
              label="Kampanya ID (opsiyonel)"
              hint="İade belirli bir kampanyaya bağlıysa UUID'sini gir."
            >
              <input
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                placeholder="01958..."
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-neon-500"
              />
            </Field>
          )}

          <Field label="Açıklama" hint="Audit log'a yazılır; zorunlu.">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Banka transferi #12345 karşılığı"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neon-500"
            />
          </Field>

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
            disabled={saving}
            className={`px-4 py-2 border rounded-lg text-sm font-medium disabled:opacity-50 ${meta.saveColor}`}
          >
            {saving ? 'Kaydediliyor…' : meta.saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function parseTRY(s: string, allowNegative: boolean): number | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  if (!allowNegative && n < 0) return null
  return n
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
