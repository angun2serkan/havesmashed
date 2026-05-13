import { useEffect, useMemo, useState } from 'react'
import {
  Users,
  Activity,
  Heart,
  TrendingUp,
  RefreshCw,
  FileDown,
  FileText,
  Sliders,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { adminApi } from '@/services/api'
import {
  exportMediaKitPdf,
  exportMediaKitPptx,
  exportSnapshotCsv,
  type MediaKitOptions,
} from '@/lib/mediaKit'
import { CustomReportModal } from '@/components/CustomReportModal'

type SegmentRow = { segment_key: string; segment_value: string; cohort_size: number }
type SeriesRow = {
  date: string
  total_users: number
  new_users: number
  dau: number
  mau: number
  total_dates_logged: number
  new_dates_logged: number
}

const SEGMENT_LABELS: Record<string, string> = {
  single_proxy: 'Single (proxy)',
  active_dater_30d: 'Active Dater (30g)',
  high_frequency_30d: 'High Frequency (5+/30g)',
  partner_gender_majority: 'Partner Cinsiyet Çoğunluğu',
  partner_age_range: 'Partner Yaş Aralığı',
  top_city_dates: 'Top Şehirler (Date sayısı)',
  tag_category: 'Tag Kategorisi',
}

const PIE_COLORS = ['#22c55e', '#06b6d4', '#a855f7', '#f59e0b', '#ef4444', '#3b82f6']

export default function AdvertiserStatsPage() {
  const [days, setDays] = useState(90)
  const [series, setSeries] = useState<SeriesRow[]>([])
  const [segments, setSegments] = useState<SegmentRow[]>([])
  const [asOf, setAsOf] = useState<string | null>(null)
  const [headline, setHeadline] = useState<{
    total_users: number
    dau: number
    mau: number
    dau_mau_ratio: number
    total_dates_logged: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [showReportBuilder, setShowReportBuilder] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [overview, snapshot] = await Promise.all([
        adminApi.getStatsOverview(days),
        adminApi.getStatsSnapshot(days),
      ])
      setSeries(overview.series)
      setHeadline(
        overview.headline
          ? {
              total_users: overview.headline.total_users,
              dau: overview.headline.dau,
              mau: overview.headline.mau,
              dau_mau_ratio: overview.headline.dau_mau_ratio,
              total_dates_logged: overview.headline.total_dates_logged,
            }
          : null,
      )
      setSegments(snapshot.segments)
      setAsOf(snapshot.as_of)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const groupedSegments = useMemo(() => {
    const map: Record<string, SegmentRow[]> = {}
    for (const r of segments) {
      ;(map[r.segment_key] ??= []).push(r)
    }
    return map
  }, [segments])

  const handleRecompute = async () => {
    setRecomputing(true)
    try {
      await adminApi.recomputeAnalytics()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recompute başarısız')
    } finally {
      setRecomputing(false)
    }
  }

  const runExport = async (kind: 'pdf' | 'pptx' | 'csv', opts?: Partial<MediaKitOptions>) => {
    setExporting(kind)
    try {
      const snapshot = await adminApi.getStatsSnapshot(days, opts?.segmentKeys ?? undefined)
      const fullOpts: MediaKitOptions = {
        brandName: opts?.brandName ?? null,
        notes: opts?.notes ?? null,
        segmentKeys: opts?.segmentKeys ?? null,
        days,
      }
      if (kind === 'pdf') await exportMediaKitPdf(snapshot, fullOpts)
      else if (kind === 'pptx') await exportMediaKitPptx(snapshot, fullOpts)
      else exportSnapshotCsv(snapshot, fullOpts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export başarısız')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Advertiser Stats</h2>
          <p className="text-xs text-dark-400 mt-1">
            Reklam pitch'leri için anonim aggregate panosu. Hiçbir kullanıcı kimliği yok ·
            kohort eşiği k≥1000{asOf ? ` · son hesaplama: ${asOf}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm"
          >
            <option value={7}>Son 7 gün</option>
            <option value={30}>Son 30 gün</option>
            <option value={90}>Son 90 gün</option>
            <option value={180}>Son 180 gün</option>
            <option value={365}>Son 1 yıl</option>
          </select>
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm hover:bg-dark-700 disabled:opacity-50"
            title="Dünün aggregate'ini yeniden hesapla"
          >
            <RefreshCw size={14} className={recomputing ? 'animate-spin' : ''} />
            Recompute
          </button>
        </div>
      </div>

      {/* Export bar */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Media Kit Export</h3>
            <p className="text-xs text-dark-400">
              PDF / PPTX / CSV — pitch'e direkt gönderilebilir formatlar
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => runExport('pdf')}
              disabled={!!exporting || loading}
              className="flex items-center gap-2 px-4 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 disabled:opacity-50"
            >
              <FileDown size={14} />
              {exporting === 'pdf' ? 'Hazırlanıyor…' : 'PDF Media Kit'}
            </button>
            <button
              onClick={() => runExport('pptx')}
              disabled={!!exporting || loading}
              className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-dark-100 border border-dark-600 rounded-lg text-sm font-medium hover:bg-dark-600 disabled:opacity-50"
            >
              <FileText size={14} />
              {exporting === 'pptx' ? 'Hazırlanıyor…' : 'PowerPoint'}
            </button>
            <button
              onClick={() => runExport('csv')}
              disabled={!!exporting || loading}
              className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-dark-100 border border-dark-600 rounded-lg text-sm font-medium hover:bg-dark-600 disabled:opacity-50"
            >
              <FileDown size={14} />
              {exporting === 'csv' ? '…' : 'CSV'}
            </button>
            <button
              onClick={() => setShowReportBuilder(true)}
              disabled={!!exporting || loading}
              className="flex items-center gap-2 px-4 py-2 bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 rounded-lg text-sm font-medium hover:bg-accent-cyan/30 disabled:opacity-50"
            >
              <Sliders size={14} />
              Custom Report
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Headline cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <HeadlineCard
          label="Toplam Kullanıcı"
          value={headline?.total_users}
          icon={Users}
          color="text-neon-400"
        />
        <HeadlineCard
          label="MAU (30g)"
          value={headline?.mau}
          icon={TrendingUp}
          color="text-accent-cyan"
        />
        <HeadlineCard
          label="DAU"
          value={headline?.dau}
          icon={Activity}
          color="text-accent-green"
        />
        <HeadlineCard
          label="DAU / MAU"
          value={
            headline ? `${(headline.dau_mau_ratio * 100).toFixed(1)}%` : undefined
          }
          icon={Heart}
          color="text-purple-400"
        />
      </div>

      {/* Trend chart */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3">DAU / MAU Trend</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="dau" stroke="#22c55e" name="DAU" dot={false} />
              <Line type="monotone" dataKey="mau" stroke="#06b6d4" name="MAU" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* New users + new dates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Yeni Kullanıcı (günlük)">
          <BarChart data={series} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
            <YAxis stroke="#94a3b8" fontSize={10} />
            <Tooltip
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
              }}
            />
            <Bar dataKey="new_users" fill="#22c55e" />
          </BarChart>
        </ChartCard>
        <ChartCard title="Yeni Date Logu (günlük)">
          <BarChart data={series} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
            <YAxis stroke="#94a3b8" fontSize={10} />
            <Tooltip
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
              }}
            />
            <Bar dataKey="new_dates_logged" fill="#06b6d4" />
          </BarChart>
        </ChartCard>
      </div>

      {/* Segment cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <BinarySegmentCard
          title="Single Proxy"
          rows={groupedSegments['single_proxy']}
          subtitle="Aktif partner kaydı olmayan kullanıcı"
        />
        <BinarySegmentCard
          title="Active Dater (30g)"
          rows={groupedSegments['active_dater_30d']}
          subtitle="Son 30 günde 3+ date logu"
        />
        <BinarySegmentCard
          title="High Frequency (30g)"
          rows={groupedSegments['high_frequency_30d']}
          subtitle="Son 30 günde 5+ date logu"
        />
        <PieSegmentCard
          title="Partner Cinsiyet Çoğunluğu"
          rows={groupedSegments['partner_gender_majority']}
        />
        <PieSegmentCard
          title="Partner Yaş Aralığı"
          rows={groupedSegments['partner_age_range']}
        />
        <PieSegmentCard
          title="Tag Kategorisi"
          rows={groupedSegments['tag_category']}
        />
      </div>

      {/* Top cities */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3">Top Şehirler — Date Sayısı</h3>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={(groupedSegments['top_city_dates'] ?? []).slice(0, 20)}
              layout="vertical"
              margin={{ top: 5, right: 20, bottom: 5, left: 100 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis type="number" stroke="#94a3b8" fontSize={10} />
              <YAxis
                dataKey="segment_value"
                type="category"
                stroke="#94a3b8"
                fontSize={10}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="cohort_size" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full segments table */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3">Tüm Segmentler</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-dark-400 text-xs uppercase border-b border-dark-700">
                <th className="text-left py-2 px-2">Segment</th>
                <th className="text-left py-2 px-2">Değer</th>
                <th className="text-right py-2 px-2">Kohort</th>
              </tr>
            </thead>
            <tbody>
              {segments.length === 0 && !loading && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-dark-500">
                    Henüz aggregate veri yok. Recompute butonuna tıkla.
                  </td>
                </tr>
              )}
              {segments.map((r) => (
                <tr
                  key={`${r.segment_key}|${r.segment_value}`}
                  className="border-b border-dark-700/50"
                >
                  <td className="py-2 px-2 text-dark-300">
                    {SEGMENT_LABELS[r.segment_key] ?? r.segment_key}
                  </td>
                  <td className="py-2 px-2 text-dark-200">{r.segment_value}</td>
                  <td className="py-2 px-2 text-right text-white font-mono">
                    {r.cohort_size.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-dark-500 mt-3">
          Gizlilik: tüm değerler k≥1000 eşiğini geçen kohortları temsil eder. Eşiğin
          altındaki segmentler tabloya yazılmaz.
        </p>
      </div>

      {showReportBuilder && (
        <CustomReportModal
          defaultDays={days}
          availableSegments={Object.keys(groupedSegments)}
          onClose={() => setShowReportBuilder(false)}
          onExport={async (kind, opts) => {
            await runExport(kind, opts)
            setShowReportBuilder(false)
          }}
        />
      )}
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

function HeadlineCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number | string | undefined
  icon: typeof Users
  color: string
}) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-dark-400 text-xs font-medium">{label}</span>
        <Icon size={18} className={color} />
      </div>
      <p className={`text-2xl font-bold ${color}`}>
        {value === undefined
          ? '…'
          : typeof value === 'number'
            ? value.toLocaleString()
            : value}
      </p>
    </div>
  )
}

function ChartCard({
  title,
  children,
}: {
  title: string
  children: React.ReactElement
}) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function BinarySegmentCard({
  title,
  rows,
  subtitle,
}: {
  title: string
  rows?: SegmentRow[]
  subtitle: string
}) {
  const value = rows?.[0]?.cohort_size
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-5">
      <div className="text-xs text-dark-400">{subtitle}</div>
      <h3 className="text-sm font-semibold text-white mt-1 mb-3">{title}</h3>
      <p className="text-3xl font-bold text-neon-400">
        {value === undefined ? '—' : value.toLocaleString()}
      </p>
      {value === undefined && (
        <p className="text-[10px] text-dark-500 mt-2">k&lt;1000 — yayınlanmıyor</p>
      )}
    </div>
  )
}

function PieSegmentCard({ title, rows }: { title: string; rows?: SegmentRow[] }) {
  const data = rows ?? []
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      <div className="h-56">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-dark-500">
            k&lt;1000 — yayınlanmıyor
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="cohort_size"
                nameKey="segment_value"
                outerRadius={70}
                label={(props: { name?: string }) => props.name ?? ''}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
