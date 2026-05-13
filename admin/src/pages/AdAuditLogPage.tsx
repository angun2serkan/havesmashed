// Audit log viewer.
//
// One row per mutation in `ad_audit_log`. Filters narrow by date
// range, action, and target_kind. Each row collapses to a one-line
// summary; clicking expands the JSONB diff so the operator can see
// the before/after state for placement/campaign/badge/affiliate
// edits.
//
// The action + target_kind option lists are hardcoded against the
// audit calls in backend/src/handlers (admin_ads.rs, admin.rs,
// affiliate.rs). When new audit actions are added, append them here.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  History,
  RefreshCw,
  Filter,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  X,
} from 'lucide-react'
import { adminApi, type AuditLogEntry } from '@/services/api'

type TargetKind = 'placement' | 'campaign' | 'badge' | 'affiliate'

const ACTION_OPTIONS: Array<{ value: string; label: string; kind: TargetKind | null }> = [
  { value: 'placement_update', label: 'Placement güncellendi', kind: 'placement' },
  { value: 'placement_enable', label: 'Placement açıldı', kind: 'placement' },
  { value: 'placement_disable', label: 'Placement kapatıldı', kind: 'placement' },
  { value: 'campaign_create', label: 'Kampanya oluşturuldu', kind: 'campaign' },
  { value: 'campaign_update', label: 'Kampanya güncellendi', kind: 'campaign' },
  { value: 'campaign_delete', label: 'Kampanya silindi', kind: 'campaign' },
  { value: 'campaign_pause', label: 'Kampanya duraklatıldı', kind: 'campaign' },
  { value: 'campaign_activate', label: 'Kampanya etkinleştirildi', kind: 'campaign' },
  { value: 'badge_sponsor_set', label: 'Badge sponsoru atandı', kind: 'badge' },
  { value: 'badge_sponsor_clear', label: 'Badge sponsoru kaldırıldı', kind: 'badge' },
  { value: 'affiliate_create', label: 'Affiliate link oluşturuldu', kind: 'affiliate' },
  { value: 'affiliate_update', label: 'Affiliate link güncellendi', kind: 'affiliate' },
  { value: 'affiliate_deactivate', label: 'Affiliate link deaktive edildi', kind: 'affiliate' },
]

const TARGET_KIND_OPTIONS: Array<{ value: TargetKind; label: string }> = [
  { value: 'placement', label: 'Placement' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'badge', label: 'Badge' },
  { value: 'affiliate', label: 'Affiliate' },
]

type DateShortcut = '7d' | '30d' | '90d' | 'custom'

function shortcutToRange(s: DateShortcut): { since?: string; until?: string } {
  if (s === 'custom') return {}
  const days = s === '7d' ? 7 : s === '30d' ? 30 : 90
  const now = new Date()
  const since = new Date(now)
  since.setDate(now.getDate() - days)
  return { since: since.toISOString() }
}

export default function AdAuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shortcut, setShortcut] = useState<DateShortcut>('7d')
  const [customSince, setCustomSince] = useState<string>('')
  const [customUntil, setCustomUntil] = useState<string>('')
  const [action, setAction] = useState<string>('')
  const [targetKind, setTargetKind] = useState<string>('')
  const [limit, setLimit] = useState<number>(100)

  const effectiveRange = useMemo(() => {
    if (shortcut !== 'custom') return shortcutToRange(shortcut)
    return {
      since: customSince ? new Date(customSince).toISOString() : undefined,
      until: customUntil ? new Date(customUntil).toISOString() : undefined,
    }
  }, [shortcut, customSince, customUntil])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await adminApi.listAuditLog({
        action: action || undefined,
        target_kind: targetKind || undefined,
        since: effectiveRange.since,
        until: effectiveRange.until,
        limit,
      })
      setEntries(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcut, customSince, customUntil, action, targetKind, limit])

  const clearFilters = () => {
    setShortcut('7d')
    setCustomSince('')
    setCustomUntil('')
    setAction('')
    setTargetKind('')
    setLimit(100)
  }

  // When the operator picks an action, narrow the target_kind filter
  // automatically — saves them from picking inconsistent combos.
  const onActionChange = (next: string) => {
    setAction(next)
    if (next) {
      const match = ACTION_OPTIONS.find((o) => o.value === next)
      if (match?.kind) setTargetKind(match.kind)
    }
  }

  const hasActiveFilter =
    shortcut !== '7d' || action !== '' || targetKind !== '' || limit !== 100

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <History size={22} className="text-neon-500" />
            Audit Log
          </h2>
          <p className="text-xs text-dark-400 mt-1">
            Reklam envanterine yapılan tüm mutation'lar (placement, kampanya, badge sponsor, affiliate). Her satır before/after diff'iyle birlikte saklanır.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-200 hover:bg-dark-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Yenile
        </button>
      </div>

      {/* Filters */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-dark-400" />
          <span className="text-xs uppercase tracking-wider text-dark-400">Filtreler</span>
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="ml-auto text-[11px] text-dark-400 hover:text-white inline-flex items-center gap-1"
            >
              <X size={10} /> Temizle
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] text-dark-500 uppercase tracking-wider mb-1">
              Tarih aralığı
            </label>
            <div className="inline-flex bg-dark-900 border border-dark-700 rounded-lg p-0.5 w-full">
              {(['7d', '30d', '90d', 'custom'] as DateShortcut[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setShortcut(s)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded ${
                    shortcut === s ? 'bg-neon-500/20 text-neon-400' : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  {s === 'custom' ? 'Özel' : s.replace('d', ' gün')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-dark-500 uppercase tracking-wider mb-1">
              Action
            </label>
            <select
              value={action}
              onChange={(e) => onActionChange(e.target.value)}
              className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-neon-500"
            >
              <option value="">Tümü</option>
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-dark-500 uppercase tracking-wider mb-1">
              Target türü
            </label>
            <select
              value={targetKind}
              onChange={(e) => setTargetKind(e.target.value)}
              className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-neon-500"
            >
              <option value="">Tümü</option>
              {TARGET_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-dark-500 uppercase tracking-wider mb-1">
              Limit (max 500)
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-neon-500"
            >
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>
                  {n} satır
                </option>
              ))}
            </select>
          </div>
        </div>

        {shortcut === 'custom' && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-[10px] text-dark-500 uppercase tracking-wider mb-1">
                Since
              </label>
              <input
                type="datetime-local"
                value={customSince}
                onChange={(e) => setCustomSince(e.target.value)}
                className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-neon-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-dark-500 uppercase tracking-wider mb-1">
                Until
              </label>
              <input
                type="datetime-local"
                value={customUntil}
                onChange={(e) => setCustomUntil(e.target.value)}
                className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-neon-500"
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="text-xs text-dark-500 mb-2">
        {loading ? 'Yükleniyor…' : `${entries.length} kayıt`}
      </div>

      {/* Entries */}
      {!loading && entries.length === 0 ? (
        <div className="text-center text-dark-500 py-12 bg-dark-800 border border-dark-700 rounded-xl">
          Bu filtrelerde kayıt yok.
        </div>
      ) : (
        <ul className="bg-dark-800 border border-dark-700 rounded-xl divide-y divide-dark-700 overflow-hidden">
          {entries.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  )
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false)
  const at = new Date(entry.created_at)
  const targetLink = targetLinkFor(entry)

  return (
    <li className="hover:bg-dark-850 transition-colors">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        <span className="text-dark-500 shrink-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <code className="text-[11px] text-neon-400 bg-neon-500/10 px-2 py-0.5 rounded shrink-0 font-mono">
          {entry.action}
        </code>
        {entry.target_kind && (
          <span className="text-[10px] uppercase tracking-wider text-dark-400 shrink-0">
            {entry.target_kind}
          </span>
        )}
        <span className="text-xs text-dark-300 truncate min-w-0 flex-1">
          {entry.target_id ? (
            <code className="font-mono text-dark-400">
              {entry.target_id.slice(0, 8)}…
            </code>
          ) : (
            <span className="text-dark-500 italic">no target id</span>
          )}
          <span className="mx-2 text-dark-600">·</span>
          actor: {entry.actor}
        </span>
        <span className="text-[10px] text-dark-500 tabular-nums shrink-0">
          {at.toLocaleString()}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0">
          {targetLink && (
            <div className="mb-2">
              <Link
                to={targetLink.to}
                className="inline-flex items-center gap-1 text-xs text-neon-400 hover:text-neon-300"
              >
                <ExternalLink size={11} /> {targetLink.label}
              </Link>
            </div>
          )}
          {entry.diff ? (
            <pre className="text-[11px] font-mono text-dark-200 leading-relaxed bg-dark-900 border border-dark-700 rounded-lg p-3 overflow-auto max-h-96">
              {JSON.stringify(entry.diff, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-dark-500 italic">Bu kayıtta diff yok.</p>
          )}
        </div>
      )}
    </li>
  )
}

function targetLinkFor(
  entry: AuditLogEntry,
): { to: string; label: string } | null {
  if (!entry.target_id || !entry.target_kind) return null
  switch (entry.target_kind) {
    case 'campaign':
      return {
        to: `/ads/campaigns/${entry.target_id}`,
        label: 'Kampanya detayını aç',
      }
    case 'placement':
      // Placement audit rows store target_id=NULL (key is in diff),
      // so this branch usually doesn't fire. Kept for completeness.
      return null
    case 'affiliate':
      return { to: `/ads/affiliate`, label: 'Affiliate listesini aç' }
    case 'badge':
      return { to: `/badges`, label: 'Badge sayfasını aç' }
    default:
      return null
  }
}
