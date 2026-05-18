// Affiliate links manager.
//
// Surfaces every slug under /go/<slug>, the brand it points at, the
// 30-day click count, and a tiny sparkline of daily clicks. Operator
// can create new slugs, edit existing ones (slug locked), copy the
// public URL with one tap, or soft-deactivate a slug to make /go
// return 404 without losing the historical click counts.

import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  RefreshCw,
  Pencil,
  Copy,
  Check,
  Trash2,
  Link as LinkIcon,
  ExternalLink,
} from 'lucide-react'
import { adminApi, type AffiliateLink } from '@/services/api'
import { AffiliateLinkEditorModal } from '@/components/AffiliateLinkEditorModal'

// In production, /go is served from the main site (e.g. haveismash.com),
// not the admin subdomain. VITE_PUBLIC_BASE_URL lets us point at the
// right host; falls back to current origin for local dev where the
// admin Vite proxy forwards everything to localhost:3000.
const PUBLIC_BASE_URL =
  (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined) ||
  (typeof window !== 'undefined' ? window.location.origin : '')

function publicUrl(slug: string): string {
  return `${PUBLIC_BASE_URL.replace(/\/$/, '')}/go/${slug}`
}

export default function AffiliateLinksPage() {
  const [items, setItems] = useState<AffiliateLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AffiliateLink | null>(null)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await adminApi.listAffiliate()
      setItems(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste alınamadı')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (!showInactive && !it.is_active) return false
      if (!q) return true
      return (
        it.slug.toLowerCase().includes(q) ||
        (it.name?.toLowerCase().includes(q) ?? false) ||
        it.brand_name.toLowerCase().includes(q) ||
        it.target_url.toLowerCase().includes(q)
      )
    })
  }, [items, search, showInactive])

  const onCopy = async (link: AffiliateLink) => {
    const url = publicUrl(link.slug)
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(link.id)
      setTimeout(() => setCopiedId((c) => (c === link.id ? null : c)), 1500)
    } catch {
      // Clipboard API may be blocked in non-HTTPS contexts; fall back
      // to a manual prompt so the operator can copy by hand.
      window.prompt('Kopyalamak için Cmd/Ctrl+C kullan:', url)
    }
  }

  const onDeactivate = async (link: AffiliateLink) => {
    if (
      !confirm(
        `"${link.slug}" deaktive edilsin mi? /go/${link.slug} 404 dönecek. Click geçmişi korunur.`,
      )
    ) {
      return
    }
    try {
      await adminApi.deactivateAffiliate(link.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deaktive edilemedi')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <LinkIcon size={22} /> Affiliate Links
          </h2>
          <p className="text-xs text-dark-400 mt-1">
            <code className="text-dark-300">/go/&lt;slug&gt;</code> üzerinden brand'ın
            landing sayfasına Referer-strip + UTM-injected redirect.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-200 hover:bg-dark-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Yenile
          </button>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30"
          >
            <Plus size={14} /> Yeni link
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="isim, slug, brand veya URL ara…"
          className="flex-1 max-w-md bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neon-500"
        />
        <label className="inline-flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-neon-500"
          />
          Deaktive olanları göster
        </label>
        <span className="text-xs text-dark-500">
          {filtered.length} / {items.length}
        </span>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="text-center text-dark-500 py-12">Yükleniyor…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-dark-500 py-12 bg-dark-800 border border-dark-700 rounded-xl">
          {items.length === 0
            ? 'Henüz affiliate link yok. "Yeni link" ile oluştur.'
            : 'Filtreye uyan link yok.'}
        </div>
      ) : (
        <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-dark-900 text-dark-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">İsim & Slug</th>
                <th className="text-left px-4 py-3 font-medium">Target URL</th>
                <th className="text-left px-4 py-3 font-medium">Durum</th>
                <th className="text-right px-4 py-3 font-medium">30g click</th>
                <th className="text-left px-4 py-3 font-medium w-[140px]">Trend (30g)</th>
                <th className="text-right px-4 py-3 font-medium">Aksiyonlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {filtered.map((link) => (
                <tr
                  key={link.id}
                  className={`hover:bg-dark-850 ${!link.is_active ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">
                      {link.name ?? <span className="text-dark-500 italic">İsimsiz</span>}
                    </div>
                    <div className="font-mono text-neon-400 text-xs mt-0.5">/go/{link.slug}</div>
                    <div className="text-[10px] text-dark-500 mt-0.5">{link.brand_name}</div>
                    {link.utm_campaign && (
                      <div className="text-[10px] text-dark-500 mt-0.5 font-mono">
                        utm_campaign={link.utm_campaign}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <a
                      href={link.target_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-dark-300 hover:text-neon-400 truncate"
                      title={link.target_url}
                    >
                      <span className="truncate">{link.target_url}</span>
                      <ExternalLink size={10} className="flex-shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {link.is_active ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/15 text-green-400 border border-green-500/30">
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-dark-700 text-dark-400 border border-dark-600">
                        Deaktif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-white font-semibold">
                      {link.clicks_30d.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-dark-500">
                      total: {link.clicks_total.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Sparkline data={link.daily_clicks} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onCopy(link)}
                        title={`Kopyala: ${publicUrl(link.slug)}`}
                        className={`p-1.5 rounded transition-colors ${
                          copiedId === link.id
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-dark-700 text-dark-300 hover:bg-dark-600 hover:text-white'
                        }`}
                      >
                        {copiedId === link.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <button
                        onClick={() => setEditing(link)}
                        title="Düzenle"
                        className="p-1.5 rounded bg-neon-500/20 text-neon-400 hover:bg-neon-500/30 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      {link.is_active && (
                        <button
                          onClick={() => onDeactivate(link)}
                          title="Deaktive et"
                          className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <AffiliateLinkEditorModal
          link={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function Sparkline({ data }: { data: Array<{ date: string; count: number }> }) {
  // 30 daily points → polyline. Width is fixed; height scales to peak.
  // When everything is zero, show a flat baseline so the row doesn't
  // jitter as new slugs gain their first clicks.
  const W = 120
  const H = 28
  const max = Math.max(1, ...data.map((d) => d.count))
  const last = data[data.length - 1]?.count ?? 0
  const total = data.reduce((s, d) => s + d.count, 0)

  if (data.length < 2) {
    return <div className="text-[10px] text-dark-500">—</div>
  }

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * W
      const y = H - (d.count / max) * (H - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <div className="flex items-center gap-2">
      <svg width={W} height={H} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={total === 0 ? '#3f3f46' : '#22d3ee'}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {total > 0 && (
          <circle
            cx={W}
            cy={H - (last / max) * (H - 4) - 2}
            r={2}
            fill="#22d3ee"
          />
        )}
      </svg>
      <span className="text-[10px] text-dark-500 tabular-nums">{last}</span>
    </div>
  )
}
