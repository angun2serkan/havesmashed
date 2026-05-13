// Per-placement analytics dashboard.
//
// Answers two questions in one view:
//   1. "Bu placement'tan ne data topluyoruz?" — listed via the
//      placement's `metrics_collected` config, with current values
//      pulled from the JSONB `extra` aggregate.
//   2. "Ne kadar performans gösteriyor?" — headline cards (impressions,
//      clicks, CTR, avg dwell), daily impressions+clicks line chart,
//      and a table of campaigns currently running on this placement.
//
// Operator actions live in the header: globalde aç/kapat, edit
// (display rules / creative spec / preview image — reuses
// EditPlacementModal), refresh.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  Power,
  RefreshCw,
  Layers,
  Activity,
  MousePointerClick,
  Percent,
  Clock,
  Megaphone,
  Smartphone,
  Monitor,
  AlertTriangle,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { adminApi, type Placement, type PlacementDetail } from '@/services/api'
import { EditPlacementModal } from '@/components/EditPlacementModal'
import { PlacementPreview } from '@/components/PlacementPreview'

// What each `metrics_collected` value means in operator-facing Turkish.
// Values resolve from the metric_aggregates blob (see formatMetricValue).
const METRIC_DEFINITIONS: Record<string, string> = {
  impression:
    'Reklam bir kullanıcının ekranında render oldu (frequency cap sayacı bunu kullanır).',
  click:
    'Kullanıcı reklam üzerine tıklayıp click_url\'e yönlendirildi.',
  dwell_ms:
    'Reklam ekranda kaldığı süre (ms). Avg = sum / count. Engagement proxy.',
  scroll_past:
    'Kullanıcı reklamı görüp altına kaydırdı — impression doğrulamak için.',
  badge_claim:
    'Sponsored badge\'in unlock anında oluşan event. Sponsored badge placement\'ı için marker.',
  view_complete:
    'Gated/zorunlu reklamın tam izlendiği marker — min_view_seconds tamamlandığında ateşlenir.',
  skip:
    'Gated/zorunlu reklamın skip\'lendiği marker (skip_after_seconds geçtiğinde butona basıldı).',
  comment:
    'Forum native ad altına comment bırakıldı (engagement signal).',
  open:
    'Push notification reklamı açıldı.',
  delivered:
    'Push notification cihaza ulaştı (open\'dan önceki adım).',
  sent:
    'Push notification kuyruğa alındı (delivery rate hesabı için).',
}

function formatMetricValue(
  metric: string,
  agg: Record<string, number>,
): string {
  const count = agg[`${metric}_count`] ?? 0
  const sum = agg[`${metric}_sum`] ?? 0
  if (metric === 'impression' || metric === 'click') {
    // Top-level columns; not in extra. Show "—" hint for clarity.
    return 'Üst başlıkta görünür'
  }
  if (metric === 'dwell_ms') {
    if (count === 0) return 'Henüz veri yok'
    const avg = sum / count
    return `ort. ${(avg / 1000).toFixed(2)}s · ${count.toLocaleString()} örnek · toplam ${(sum / 1000).toFixed(0)}s`
  }
  // Default: presence-only count
  if (count === 0) return 'Henüz veri yok'
  return `${count.toLocaleString()} olay${sum > 0 ? ` · sum ${sum.toLocaleString()}` : ''}`
}

export default function AdPlacementDetailPage() {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<PlacementDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>('mobile')

  const load = async () => {
    if (!key) return
    setLoading(true)
    setError(null)
    try {
      const d = await adminApi.getPlacementDetail(key, days)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, days])

  const filledSeries = useMemo(() => {
    if (!data) return []
    // Backfill missing days so the chart renders flat zeros instead of
    // gaps. The backend deliberately omits zero days to keep payload small.
    const map = new Map(data.daily_series.map((d) => [d.date, d]))
    const out: Array<{ date: string; impressions: number; clicks: number }> = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = data.window_days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      const row = map.get(iso)
      out.push({
        date: iso,
        impressions: row?.impressions ?? 0,
        clicks: row?.clicks ?? 0,
      })
    }
    return out
  }, [data])

  const onToggleEnabled = async () => {
    if (!data) return
    setBusy(true)
    try {
      const action = data.placement.is_globally_enabled
        ? adminApi.disablePlacement
        : adminApi.enablePlacement
      await action(data.placement.key)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusy(false)
    }
  }

  const onEditSaved = (next: Placement) => {
    setEditing(false)
    setData((prev) => (prev ? { ...prev, placement: { ...prev.placement, ...next } } : prev))
  }

  if (!key) {
    return (
      <div className="text-center text-dark-500 py-12">Placement key eksik.</div>
    )
  }

  if (loading && !data) {
    return <div className="text-center text-dark-500 py-12">Yükleniyor…</div>
  }

  if (error && !data) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      </div>
    )
  }

  if (!data) return null

  const p = data.placement
  const t = data.totals

  return (
    <div>
      <BackLink />

      {/* Header */}
      <div className="mt-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Layers size={16} className="text-neon-500" />
            <span className="text-xs font-mono text-dark-500">{p.key}</span>
            <span
              className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                p.is_globally_enabled
                  ? 'bg-accent-green/20 text-accent-green'
                  : 'bg-dark-700 text-dark-400'
              }`}
            >
              {p.is_globally_enabled ? 'Aktif' : 'Kapalı'}
            </span>
            {p.requires_auth && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-dark-700 text-dark-400">
                auth gerekli
              </span>
            )}
          </div>
          <h2 className="text-2xl font-bold">{p.display_name}</h2>
          <p className="text-sm text-dark-400 mt-1 max-w-3xl">{p.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DaysSelector value={days} onChange={setDays} />
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-200 hover:bg-dark-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onToggleEnabled}
            disabled={busy}
            title={p.is_globally_enabled ? 'Globalde kapat' : 'Globalde aç'}
            className={`px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 text-sm ${
              p.is_globally_enabled
                ? 'bg-accent-green/10 border-accent-green/30 text-accent-green hover:bg-accent-green/20'
                : 'bg-dark-700 border-dark-600 text-dark-400 hover:bg-dark-600'
            }`}
          >
            <Power size={14} />
            {p.is_globally_enabled ? 'Kapat' : 'Aç'}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 inline-flex items-center gap-1.5"
          >
            <Pencil size={14} /> Düzenle
          </button>
        </div>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-6">
        <HeadlineCard
          icon={<Activity size={16} />}
          label={`Impressions (son ${days}g)`}
          value={t.impressions.toLocaleString()}
        />
        <HeadlineCard
          icon={<MousePointerClick size={16} />}
          label={`Clicks (son ${days}g)`}
          value={t.clicks.toLocaleString()}
        />
        <HeadlineCard
          icon={<Percent size={16} />}
          label="CTR"
          value={`${(t.ctr * 100).toFixed(2)}%`}
        />
        <HeadlineCard
          icon={<Clock size={16} />}
          label="Ortalama dwell"
          value={
            t.avg_dwell_ms === null
              ? '—'
              : `${(t.avg_dwell_ms / 1000).toFixed(2)}s`
          }
        />
      </div>

      {/* Chart */}
      <div className="mt-6 bg-dark-800 border border-dark-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">
            Günlük impression + click
          </h3>
          <span className="text-[10px] text-dark-500 uppercase tracking-wider">
            ad_placement_metrics
          </span>
        </div>
        {filledSeries.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-dark-500">
            Henüz veri yok.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={filledSeries} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                stroke="#71717a"
                fontSize={10}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis stroke="#71717a" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="impressions"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                name="Impressions"
              />
              <Line
                type="monotone"
                dataKey="clicks"
                stroke="#f472b6"
                strokeWidth={2}
                dot={false}
                name="Clicks"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two-col: Active campaigns + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
        {/* Active campaigns */}
        <div className="lg:col-span-2 bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-dark-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Megaphone size={14} className="text-neon-500" />
              Aktif kampanyalar ({data.active_campaigns.length})
            </h3>
            <Link
              to={`/ads/campaigns`}
              className="text-xs text-neon-400 hover:text-neon-300"
            >
              Hepsini gör →
            </Link>
          </div>
          {data.active_campaigns.length === 0 ? (
            <div className="p-6 text-sm text-dark-500 text-center">
              Bu placement'ta şu an çalışan kampanya yok.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-dark-900 text-dark-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Brand</th>
                  <th className="text-right px-4 py-2 font-medium">Weight</th>
                  <th className="text-right px-4 py-2 font-medium">Imp</th>
                  <th className="text-right px-4 py-2 font-medium">Click</th>
                  <th className="text-right px-4 py-2 font-medium">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {data.active_campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-dark-850">
                    <td className="px-4 py-2">
                      <div className="font-medium text-white">{c.brand_name}</div>
                      <div className="text-[10px] text-dark-500">
                        {new Date(c.starts_at).toLocaleDateString()} →{' '}
                        {new Date(c.ends_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-dark-300 tabular-nums">
                      {c.weight}
                    </td>
                    <td className="px-4 py-2 text-right text-white tabular-nums">
                      {c.impressions_total.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-white tabular-nums">
                      {c.clicks_total.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-dark-300 tabular-nums">
                      {(c.ctr * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Preview */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Nasıl görünür</h3>
            <div className="inline-flex bg-dark-900 border border-dark-700 rounded-lg p-0.5">
              <button
                onClick={() => setViewport('mobile')}
                className={`px-2 py-1 rounded inline-flex items-center gap-1 text-[10px] ${
                  viewport === 'mobile'
                    ? 'bg-neon-500/20 text-neon-400'
                    : 'text-dark-400'
                }`}
              >
                <Smartphone size={10} /> Mobile
              </button>
              <button
                onClick={() => setViewport('desktop')}
                className={`px-2 py-1 rounded inline-flex items-center gap-1 text-[10px] ${
                  viewport === 'desktop'
                    ? 'bg-neon-500/20 text-neon-400'
                    : 'text-dark-400'
                }`}
              >
                <Monitor size={10} /> Desktop
              </button>
            </div>
          </div>
          <div className="bg-dark-950 rounded-lg p-3">
            <PlacementPreview placementKey={p.key} viewport={viewport} />
          </div>
          <p className="text-[10px] text-dark-500 mt-2 leading-relaxed">
            Mock görsel. Gerçek render Faz 4.6'daki AdSlot component'i ile yapılır.
          </p>
        </div>
      </div>

      {/* Metrics collected — definition + current value */}
      <div className="mt-6 bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-dark-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Toplanan veri ({p.metrics_collected.length})
          </h3>
          <span className="text-[10px] text-dark-500 uppercase tracking-wider">
            metrics_collected · son {days}g
          </span>
        </div>
        {p.metrics_collected.length === 0 ? (
          <div className="p-6 text-sm text-dark-500 text-center">
            Bu placement metrik toplamıyor.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-dark-900 text-dark-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium w-[180px]">Metrik</th>
                <th className="text-left px-4 py-2 font-medium">Tanım</th>
                <th className="text-right px-4 py-2 font-medium w-[280px]">Güncel değer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {p.metrics_collected.map((m) => {
                const known = METRIC_DEFINITIONS[m]
                return (
                  <tr key={m} className="hover:bg-dark-850">
                    <td className="px-4 py-2">
                      <code className="text-xs text-neon-400 bg-neon-500/10 px-2 py-0.5 rounded">
                        {m}
                      </code>
                    </td>
                    <td className="px-4 py-2 text-dark-300 text-xs">
                      {known ?? (
                        <span className="text-dark-500 italic inline-flex items-center gap-1">
                          <AlertTriangle size={10} />
                          Tanım yok — METRIC_DEFINITIONS'a ekle
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-dark-200 text-xs tabular-nums">
                      {m === 'impression'
                        ? t.impressions.toLocaleString()
                        : m === 'click'
                        ? t.clicks.toLocaleString()
                        : formatMetricValue(m, t.metric_aggregates)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Config blobs (collapsible-ish — just compact rendering) */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ConfigBlock title="display_rules" data={p.display_rules} />
        <ConfigBlock title="creative_spec" data={p.creative_spec} />
      </div>

      {editing && (
        <EditPlacementModal
          placement={p}
          onClose={() => setEditing(false)}
          onSaved={onEditSaved}
        />
      )}

      {error && data && (
        <div className="mt-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  )

  // ── inline helpers ────────────────────────────────────────
  function BackLink() {
    return (
      <button
        onClick={() => navigate('/ads/placements')}
        className="inline-flex items-center gap-1.5 text-xs text-dark-400 hover:text-white"
      >
        <ArrowLeft size={12} /> Reklam türleri
      </button>
    )
  }
}

function DaysSelector({
  value,
  onChange,
}: {
  value: 7 | 30 | 90
  onChange: (v: 7 | 30 | 90) => void
}) {
  const opts: Array<7 | 30 | 90> = [7, 30, 90]
  return (
    <div className="inline-flex bg-dark-900 border border-dark-700 rounded-lg p-0.5">
      {opts.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-2.5 py-1 text-xs rounded ${
            value === d ? 'bg-neon-500/20 text-neon-400' : 'text-dark-400'
          }`}
        >
          {d}g
        </button>
      ))}
    </div>
  )
}

function HeadlineCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-dark-400 text-[10px] uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-white mt-1.5 tabular-nums">{value}</div>
    </div>
  )
}

function ConfigBlock({
  title,
  data,
}: {
  title: string
  data: Record<string, unknown>
}) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl">
      <div className="px-4 py-3 border-b border-dark-700">
        <h4 className="text-xs font-mono text-dark-400 uppercase tracking-wider">
          {title}
        </h4>
      </div>
      <pre className="p-4 text-[11px] font-mono text-dark-200 leading-relaxed overflow-auto max-h-64">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}
