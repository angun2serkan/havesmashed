// Brand_admin'in kendi cüzdanını gördüğü read-only sayfa.
// Top-up / adjust / refund butonları YOK — bunlar super_admin'de.
// Backend `effectiveBrandId` üzerinden brand_scope guard zaten uyguluyor.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import {
  walletApi,
  type WalletTransaction,
} from '@/services/api'
import { effectiveBrandId, useAdminStore } from '@/stores/adminStore'
import { formatTRY, formatTRYSigned } from '@/lib/formatTRY'

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Hepsi' },
  { value: 'topup', label: 'Top-up' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'extend', label: 'Extend' },
  { value: 'refund', label: 'Refund' },
  { value: 'adjust', label: 'Adjust' },
]

const PAGE_SIZE = 50

export default function BrandWalletPortalPage() {
  const me = useAdminStore((s) => s.me)
  const brandId = effectiveBrandId(me)
  const [balance, setBalance] = useState<number | null>(null)
  const [items, setItems] = useState<WalletTransaction[]>([])
  const [kind, setKind] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!brandId) return
    setLoading(true)
    setError('')
    Promise.all([
      walletApi.get(brandId),
      walletApi.listTransactions(brandId, {
        kind: kind || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    ])
      .then(([w, tx]) => {
        setBalance(w.balance_cents)
        setItems(tx.items)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'))
      .finally(() => setLoading(false))
  }, [brandId, kind, offset])

  if (!brandId) {
    return (
      <div className="text-dark-400">
        Brand kapsamı bulunamadı. Super_admin lütfen "Brand olarak davran" ile bir
        brand seçin.
      </div>
    )
  }

  const hasMore = items.length === PAGE_SIZE

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Wallet size={20} className="text-neon-500" />
          <div>
            <h1 className="text-2xl font-bold text-white">Cüzdan</h1>
            <p className="text-xs text-dark-400 mt-1">
              Bakiyeniz ve son işlemleriniz. Yeni bakiye yüklemek için platform
              operatörüne ulaşın.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-dark-500">
            Bakiye
          </p>
          <p className="text-2xl font-bold text-white font-mono">
            {balance != null ? formatTRY(balance) : '—'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-dark-400">Tip:</label>
        <select
          value={kind}
          onChange={(e) => {
            setOffset(0)
            setKind(e.target.value)
          }}
          className="px-3 py-1.5 bg-dark-900 border border-dark-700 rounded text-sm text-white"
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {loading && <span className="text-xs text-dark-500 ml-2">Yükleniyor…</span>}
      </div>

      <div className="bg-dark-900 border border-dark-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-dark-400 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Tip</th>
              <th className="text-right px-4 py-2">Tutar</th>
              <th className="text-right px-4 py-2">Sonraki Bakiye</th>
              <th className="text-left px-4 py-2">Açıklama</th>
              <th className="text-left px-4 py-2">Ref</th>
              <th className="text-right px-4 py-2">Zaman</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-dark-400">
                  İşlem bulunamadı.
                </td>
              </tr>
            )}
            {items.map((tx) => {
              const signed = formatTRYSigned(tx.amount_cents)
              return (
                <tr key={tx.id} className="border-t border-dark-800">
                  <td className="px-4 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-dark-800 text-[10px] uppercase font-mono">
                      {tx.kind}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-mono ${
                      signed.sign === '+'
                        ? 'text-accent-green'
                        : signed.sign === '-'
                          ? 'text-red-400'
                          : 'text-dark-300'
                    }`}
                  >
                    {signed.text}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-dark-300">
                    {formatTRY(tx.balance_after_cents)}
                  </td>
                  <td className="px-4 py-2 text-dark-400 text-xs max-w-md truncate">
                    {tx.description ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-dark-500 text-xs font-mono">
                    {tx.ref_kind === 'campaign' && tx.ref_id ? (
                      <Link
                        to={`/ads/campaigns/${tx.ref_id}`}
                        className="text-neon-400 hover:underline"
                      >
                        campaign
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-dark-500 text-xs whitespace-nowrap">
                    {new Date(tx.created_at).toLocaleString('tr-TR')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-dark-400">
        <span>
          {items.length === 0
            ? '—'
            : `${offset + 1}–${offset + items.length} arası`}
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-3 py-1 bg-dark-800 border border-dark-700 rounded disabled:opacity-30"
          >
            Önceki
          </button>
          <button
            disabled={!hasMore || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-3 py-1 bg-dark-800 border border-dark-700 rounded disabled:opacity-30"
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  )
}
