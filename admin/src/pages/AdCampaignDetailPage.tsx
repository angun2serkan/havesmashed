// Per-campaign performance dashboard.
//
// Single-screen view that answers "how is this campaign doing right
// now and what can we share with the brand?" Sections:
//   - Header + actions: Pause/Activate, Edit, Duplicate, Export PDF
//   - Campaign summary card (placement, dates, weight, dry-run, target)
//   - Headline cards: imp, click, CTR, daily cap usage
//   - Daily impressions+clicks chart with secondary CTR sparkline
//   - Per-segment cohort sizes (k≥1000 enforced at write time)
//   - Placement-specific metrics from extra blob
//   - Audit log scoped to this campaign
//
// Brand Report PDF reuses the mediaKit jsPDF helpers to keep the
// header/footer/anonymity-disclaimer styling consistent across the
// platform-wide and per-campaign reports.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Pause,
  Play,
  Pencil,
  Copy as CopyIcon,
  FileDown,
  RefreshCw,
  Activity,
  MousePointerClick,
  Percent,
  Clock,
  AlertTriangle,
  Layers,
  ListChecks,
  History,
  Users,
  Eye,
  Target,
  CalendarPlus,
} from 'lucide-react'
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  ComposedChart,
} from 'recharts'
import {
  adminApi,
  type Campaign,
  type CampaignDetail,
  type Placement,
} from '@/services/api'
import { CampaignEditorModal } from '@/components/CampaignEditorModal'
import { ExtendCampaignModal } from '@/components/ExtendCampaignModal'
import {
  PlacementPreview,
  type PreviewCreative,
} from '@/components/PlacementPreview'
import { exportCampaignBrandReportPdf } from '@/lib/mediaKit'

// k=1000 is enforced by segment_metrics CHECK; surface that here so
// the PDF anonymity-contract page reflects what the brand will see.
const K_THRESHOLD = 1000

// Mirrors backend handlers/admin.rs METRIC_DEFINITIONS — duplicated
// because the PDF + UI both render value text and the backend doesn't
// ship descriptions. Keep in sync if catalogue grows.
const METRIC_DEFINITIONS: Record<string, string> = {
  impression: 'Reklam render edildi.',
  click: 'Click edilip click_url\'e gidildi.',
  dwell_ms: 'Reklam ekranda kaldığı süre (ms). Avg = sum / count.',
  scroll_past: 'Kullanıcı reklamı görüp altına kaydırdı.',
  badge_claim: 'Sponsored badge unlock anında oluşan event.',
  view_complete: 'Gated reklamın tam izlendiği marker.',
  comment: 'Forum native ad altına comment.',
}

function formatMetricValue(metric: string, agg: Record<string, number>): string {
  if (metric === 'impression' || metric === 'click') {
    return 'Üst başlıkta'
  }
  const count = agg[`${metric}_count`] ?? 0
  const sum = agg[`${metric}_sum`] ?? 0
  if (metric === 'dwell_ms') {
    if (count === 0) return 'Henüz veri yok'
    return `ort. ${(sum / count / 1000).toFixed(2)}s · ${count.toLocaleString()} örnek`
  }
  if (count === 0) return 'Henüz veri yok'
  return `${count.toLocaleString()} olay${sum > 0 ? ` · sum ${sum.toLocaleString()}` : ''}`
}

const SEGMENT_KEY_LABELS: Record<string, string> = {
  top_city_dates: 'Top Cities',
  partner_age_range: 'Partner Age Range',
  active_dater_30d: 'Active Dater (30d)',
  high_frequency_30d: 'High Frequency (5+/30d)',
  single_proxy: 'Single Proxy',
}

export default function AdCampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<CampaignDetail | null>(null)
  const [placements, setPlacements] = useState<Placement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [editing, setEditing] = useState(false)
  const [extending, setExtending] = useState(false)
  const [duplicating, setDuplicating] = useState<Campaign | null>(null)
  const [exporting, setExporting] = useState(false)
  type CampaignBadge = Awaited<ReturnType<typeof adminApi.getCampaignBadge>>
  const [campaignBadge, setCampaignBadge] = useState<CampaignBadge | null>(
    null,
  )

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [d, ps] = await Promise.all([
        adminApi.getCampaignDetail(id, days),
        adminApi.listPlacements(),
      ])
      setData(d)
      setPlacements(ps)
      // badge_sponsor placement'ı için preview, kampanyaya bağlı badge'in
      // gerçek emoji/görselini göstersin diye ayrıca fetch ediyoruz.
      if (d.campaign.placement_key === 'badge_sponsor') {
        try {
          const b = await adminApi.getCampaignBadge(d.campaign.id)
          setCampaignBadge(b)
        } catch {
          setCampaignBadge(null)
        }
      } else {
        setCampaignBadge(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, days])

  const filledSeries = useMemo(() => {
    if (!data) return []
    // Backfill missing days with zeros so the chart line is continuous.
    // Backend omits zero days to keep payloads small.
    const map = new Map(data.daily_series.map((d) => [d.date, d]))
    const out: Array<{
      date: string
      impressions: number
      clicks: number
      ctr: number
    }> = []
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
        // ctr is shown as percentage in the chart secondary line
        ctr: row ? row.ctr * 100 : 0,
      })
    }
    return out
  }, [data])

  const onTogglePause = async () => {
    if (!data) return
    setBusy(true)
    try {
      const action = data.campaign.is_active
        ? adminApi.pauseCampaign
        : adminApi.activateCampaign
      await action(data.campaign.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusy(false)
    }
  }

  const onExportPdf = async () => {
    if (!data) return
    setExporting(true)
    try {
      await exportCampaignBrandReportPdf({
        campaign: {
          id: data.campaign.id,
          brand_name: data.campaign.brand_name,
          placement_key: data.campaign.placement_key,
          starts_at: data.campaign.starts_at,
          ends_at: data.campaign.ends_at,
          is_active: data.campaign.is_active,
          is_dry_run: data.campaign.is_dry_run,
          weight: data.campaign.weight,
          target_segment: (data.campaign.target_segment as Record<string, unknown> | null) ?? null,
          creative: data.campaign.creative as unknown as Record<string, unknown>,
        },
        window_days: data.window_days,
        totals: data.totals,
        daily_series: data.daily_series,
        segment_breakdown: data.segment_breakdown,
        k_threshold: K_THRESHOLD,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF üretilemedi')
    } finally {
      setExporting(false)
    }
  }

  if (!id) {
    return <div className="text-center text-dark-500 py-12">Campaign id eksik.</div>
  }
  if (loading && !data) {
    return <div className="text-center text-dark-500 py-12">Yükleniyor…</div>
  }
  if (error && !data) {
    return (
      <div>
        <BackLink onClick={() => navigate('/ads/campaigns')} />
        <div className="mt-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      </div>
    )
  }
  if (!data) return null

  const c = data.campaign
  const t = data.totals
  const placement = placements.find((p) => p.key === c.placement_key)
  const start = new Date(c.starts_at).toISOString().slice(0, 10)
  const end = new Date(c.ends_at).toISOString().slice(0, 10)

  return (
    <div>
      <BackLink onClick={() => navigate('/ads/campaigns')} />

      {/* Header */}
      <div className="mt-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono text-dark-500">{c.id.slice(0, 8)}</span>
            <StatusPill active={c.is_active} dry={c.is_dry_run} />
            {placement && !placement.is_globally_enabled && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 inline-flex items-center gap-1">
                <AlertTriangle size={10} /> placement KAPALI
              </span>
            )}
          </div>
          <h2 className="text-2xl font-bold">{c.brand_name}</h2>
          <p className="text-sm text-dark-400 mt-1 inline-flex items-center gap-1.5">
            <Layers size={12} />
            {placement?.display_name ?? c.placement_key}
            <span className="mx-1">·</span>
            {start} → {end}
            <span className="mx-1">·</span>
            weight {c.weight}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <DaysSelector value={days} onChange={setDays} />
          <button
            onClick={load}
            disabled={loading}
            className="p-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-300 hover:bg-dark-700 disabled:opacity-50"
            title="Yenile"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onTogglePause}
            disabled={busy}
            className={`px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 text-sm ${
              c.is_active
                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/20'
                : 'bg-accent-green/10 border-accent-green/30 text-accent-green hover:bg-accent-green/20'
            }`}
          >
            {c.is_active ? <Pause size={14} /> : <Play size={14} />}
            {c.is_active ? 'Duraklat' : 'Etkinleştir'}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 inline-flex items-center gap-1.5"
          >
            <Pencil size={14} /> Düzenle
          </button>
          {/* İmpression ekle: kampanyanın kilitli tier CPM'inden ek envanter
              satın al. Süre değişmez. cap_reached durumunda backend otomatik
              resume eder. */}
          {!['rejected', 'completed'].includes(c.status) && (
            <button
              onClick={() => setExtending(true)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border inline-flex items-center gap-1.5 ${
                c.paused_reason === 'impression_cap_reached'
                  ? 'bg-neon-500/25 text-neon-300 border-neon-500/40 hover:bg-neon-500/35'
                  : 'bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25'
              }`}
              title={
                c.paused_reason === 'impression_cap_reached'
                  ? 'Hedef gösterime ulaştı — ek impression eklenince devam eder'
                  : 'Kilitli tier CPM\'inden ek impression satın al (süre değişmez)'
              }
            >
              <CalendarPlus size={14} />
              {c.paused_reason === 'impression_cap_reached'
                ? 'İmpression ekle & devam et'
                : 'İmpression ekle'}
            </button>
          )}
          <button
            onClick={() => setDuplicating(c)}
            className="px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-300 hover:bg-dark-700 inline-flex items-center gap-1.5 text-sm"
          >
            <CopyIcon size={14} /> Klonla
          </button>
          <button
            onClick={onExportPdf}
            disabled={exporting}
            className="px-3 py-2 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-sm font-medium hover:bg-purple-500/30 disabled:opacity-50 inline-flex items-center gap-1.5"
            title="Brand'a gönderilebilir PDF üret"
          >
            <FileDown size={14} /> {exporting ? 'PDF…' : 'Brand PDF'}
          </button>
        </div>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-6">
        <HeadlineCard
          icon={<Activity size={16} />}
          label={`Impressions (${days}g)`}
          value={t.impressions.toLocaleString()}
        />
        <HeadlineCard
          icon={<MousePointerClick size={16} />}
          label={`Clicks (${days}g)`}
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

      {/* Combined chart: imp+click bars/lines + CTR sparkline */}
      <div className="mt-6 bg-dark-800 border border-dark-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">
            Günlük performans (impression / click + CTR)
          </h3>
          <span className="text-[10px] text-dark-500 uppercase tracking-wider">
            ad_metrics
          </span>
        </div>
        {filledSeries.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-dark-500">
            Henüz veri yok.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={filledSeries} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                stroke="#71717a"
                fontSize={10}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis yAxisId="left" stroke="#71717a" fontSize={10} />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#a78bfa"
                fontSize={10}
                tickFormatter={(v) => `${v.toFixed(1)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value, name) => {
                  const num = typeof value === 'number' ? value : Number(value ?? 0)
                  if (name === 'CTR') return [`${num.toFixed(2)}%`, name]
                  return [num.toLocaleString(), name]
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="impressions"
                stroke="#22d3ee"
                fill="#22d3ee"
                fillOpacity={0.18}
                strokeWidth={2}
                name="Impressions"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="clicks"
                stroke="#f472b6"
                strokeWidth={2}
                dot={false}
                name="Clicks"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="ctr"
                stroke="#a78bfa"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                name="CTR"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Creative preview — kullanıcının kampanyayı göreceği biçim. */}
      <div className="mt-6 bg-dark-800 border border-dark-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
          <Eye size={14} className="text-neon-500" />
          Reklam önizlemesi
        </h3>
        <PlacementPreview
          placementKey={c.placement_key}
          creative={
            // badge_sponsor: campaign.creative boştur, gerçek badge alanları
            // ayrı bir badges satırında. Fetch edilen badge'i preview'a
            // çeviriyoruz; image_url öncelikli, yoksa emoji icon.
            c.placement_key === 'badge_sponsor' && campaignBadge
              ? ({
                  title: campaignBadge.name,
                  body: campaignBadge.description,
                  icon: campaignBadge.icon,
                  image_url: campaignBadge.image_url ?? undefined,
                  sponsor_name:
                    campaignBadge.sponsor_name ?? c.brand_name,
                } satisfies PreviewCreative)
              : (c.creative as unknown as PreviewCreative)
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
        {/* Campaign summary */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
            <Target size={14} className="text-neon-500" /> Kampanya özeti
          </h3>
          <SummaryRow label="Brand" value={c.brand_name} />
          <SummaryRow label="Placement" value={c.placement_key} mono />
          <SummaryRow label="Tarih aralığı" value={`${start} → ${end}`} />
          <SummaryRow label="Weight" value={String(c.weight)} />
          <SummaryRow
            label="Click URL"
            value={
              <a
                href={c.click_url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-neon-400 hover:text-neon-300 break-all"
              >
                {c.click_url}
              </a>
            }
          />
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wide text-dark-500 mb-1.5">
              target_segment
            </div>
            <pre className="text-[11px] font-mono text-dark-200 leading-relaxed bg-dark-900 border border-dark-700 rounded-lg p-3 overflow-auto max-h-40">
              {c.target_segment === null
                ? '// hedefleme yok — herkes'
                : JSON.stringify(c.target_segment, null, 2)}
            </pre>
          </div>
        </div>

        {/* Segment breakdown */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-dark-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold inline-flex items-center gap-2">
              <Users size={14} className="text-neon-500" />
              Hedef kitle (cohort sizes)
            </h3>
            <span className="text-[10px] text-dark-500 uppercase tracking-wider">
              k≥{K_THRESHOLD}
            </span>
          </div>
          {data.segment_breakdown.length === 0 ? (
            <div className="p-6 text-sm text-dark-500 text-center">
              {c.target_segment === null
                ? 'Bu kampanya hedefleme yapmıyor — herkese gösterilir.'
                : 'Hedef segmentlere ait güncel cohort verisi yok.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-dark-900 text-dark-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Segment</th>
                  <th className="text-left px-4 py-2 font-medium">Değer</th>
                  <th className="text-right px-4 py-2 font-medium">Cohort size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {data.segment_breakdown.map((s, idx) => (
                  <tr key={`${s.segment_key}:${s.segment_value}:${idx}`} className="hover:bg-dark-850">
                    <td className="px-4 py-2 text-dark-300 text-xs">
                      {SEGMENT_KEY_LABELS[s.segment_key] ?? s.segment_key}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{s.segment_value}</td>
                    <td className="px-4 py-2 text-right text-white tabular-nums">
                      {s.cohort_size.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[10px] text-dark-500 px-4 py-3 border-t border-dark-700 leading-relaxed">
            Cohort sizes platform-wide günlük snapshot'tan gelir. Brand kullanıcı kimliği görmez.
          </p>
        </div>
      </div>

      {/* Placement-specific metrics */}
      <div className="mt-6 bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-dark-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold inline-flex items-center gap-2">
            <ListChecks size={14} className="text-neon-500" />
            Placement metrikleri
          </h3>
          <span className="text-[10px] text-dark-500 uppercase tracking-wider">
            son {days}g
          </span>
        </div>
        {data.metrics_collected.length === 0 ? (
          <div className="p-6 text-sm text-dark-500 text-center">
            Bu placement metrik toplamıyor.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-dark-900 text-dark-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium w-[160px]">Metrik</th>
                <th className="text-left px-4 py-2 font-medium">Tanım</th>
                <th className="text-right px-4 py-2 font-medium w-[260px]">Değer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {data.metrics_collected.map((m) => (
                <tr key={m} className="hover:bg-dark-850">
                  <td className="px-4 py-2">
                    <code className="text-xs text-neon-400 bg-neon-500/10 px-2 py-0.5 rounded">
                      {m}
                    </code>
                  </td>
                  <td className="px-4 py-2 text-dark-300 text-xs">
                    {METRIC_DEFINITIONS[m] ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-dark-200 text-xs tabular-nums">
                    {m === 'impression'
                      ? t.impressions.toLocaleString()
                      : m === 'click'
                      ? t.clicks.toLocaleString()
                      : formatMetricValue(m, t.metric_aggregates)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Audit log */}
      <div className="mt-6 bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-dark-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold inline-flex items-center gap-2">
            <History size={14} className="text-neon-500" />
            Etkinlik log'u ({data.audit_log.length})
          </h3>
          <span className="text-[10px] text-dark-500 uppercase tracking-wider">
            son 50
          </span>
        </div>
        {data.audit_log.length === 0 ? (
          <div className="p-6 text-sm text-dark-500 text-center">
            Bu kampanya üzerinde henüz audit kaydı yok.
          </div>
        ) : (
          <ul className="divide-y divide-dark-700">
            {data.audit_log.map((entry) => (
              <AuditEntry key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <CampaignEditorModal
          initial={c}
          placements={placements}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            void load()
          }}
        />
      )}

      {extending && (
        <ExtendCampaignModal
          campaign={c}
          currentImpressionsTotal={t.impressions}
          onClose={() => setExtending(false)}
          onExtended={() => {
            setExtending(false)
            void load()
          }}
        />
      )}

      {duplicating && (
        <CampaignEditorModal
          initial={{ ...duplicating, id: '' as string }}
          placements={placements}
          onClose={() => setDuplicating(null)}
          onSaved={() => {
            setDuplicating(null)
            // Duplicated → navigate back to list to see the new entry
            navigate('/ads/campaigns')
          }}
        />
      )}

      {error && data && (
        <div className="mt-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}

// ── inline helpers ────────────────────────────────────────────

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs text-dark-400 hover:text-white"
    >
      <ArrowLeft size={12} /> Kampanyalar
    </button>
  )
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

function StatusPill({ active, dry }: { active: boolean; dry: boolean }) {
  if (dry) {
    return (
      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">
        Dry run
      </span>
    )
  }
  return active ? (
    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-accent-green/20 text-accent-green">
      Aktif
    </span>
  ) : (
    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-dark-700 text-dark-400">
      Duraklatılmış
    </span>
  )
}

function HeadlineCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-dark-400 text-[10px] uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-white mt-1.5 tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-dark-500 mt-1">{hint}</div>}
    </div>
  )
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-dark-700/50 last:border-b-0">
      <span className="text-xs text-dark-400">{label}</span>
      <span
        className={`text-xs text-dark-100 text-right ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}

function AuditEntry({
  entry,
}: {
  entry: CampaignDetail['audit_log'][number]
}) {
  const [open, setOpen] = useState(false)
  const at = new Date(entry.created_at)
  return (
    <li className="px-4 py-2.5 hover:bg-dark-850">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <code className="text-[10px] text-neon-400 bg-neon-500/10 px-1.5 py-0.5 rounded shrink-0">
            {entry.action}
          </code>
          <span className="text-xs text-dark-300 truncate">
            actor: {entry.actor}
          </span>
        </div>
        <span className="text-[10px] text-dark-500 tabular-nums shrink-0">
          {at.toLocaleString()}
        </span>
      </button>
      {open && entry.diff && (
        <pre className="mt-2 text-[10px] font-mono text-dark-300 leading-relaxed bg-dark-900 border border-dark-700 rounded p-2 overflow-auto max-h-64">
          {JSON.stringify(entry.diff, null, 2)}
        </pre>
      )}
    </li>
  )
}
