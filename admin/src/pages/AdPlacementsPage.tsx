import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Power, RefreshCw, Layers, BarChart3 } from 'lucide-react'
import { adminApi, type Placement } from '@/services/api'
import { EditPlacementModal } from '@/components/EditPlacementModal'
import { PlacementPreview } from '@/components/PlacementPreview'

export default function AdPlacementsPage() {
  const [items, setItems] = useState<Placement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<Placement | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.listPlacements()
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const toggle = async (p: Placement) => {
    setBusyKey(p.key)
    try {
      const action = p.is_globally_enabled
        ? adminApi.disablePlacement
        : adminApi.enablePlacement
      await action(p.key)
      setItems((arr) =>
        arr.map((x) =>
          x.key === p.key
            ? { ...x, is_globally_enabled: !x.is_globally_enabled }
            : x,
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusyKey(null)
    }
  }

  const onSaved = (next: Placement) => {
    setItems((arr) => arr.map((x) => (x.key === next.key ? { ...x, ...next } : x)))
    setEditing(null)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Layers size={22} className="text-neon-500" />
            Reklam Türleri
          </h2>
          <p className="text-xs text-dark-400 mt-1">
            Her reklam türünün görüntülenme kuralları, creative spec'i ve toplanan
            data'sı buradan yönetilir. Globalde kapatılan placement frontend'de boş kalır.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm hover:bg-dark-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Yenile
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {items.map((p) => (
          <PlacementCard
            key={p.key}
            placement={p}
            busy={busyKey === p.key}
            onToggle={() => toggle(p)}
            onEdit={() => setEditing(p)}
          />
        ))}
        {!loading && items.length === 0 && (
          <div className="col-span-full bg-dark-800 border border-dark-700 rounded-xl p-8 text-center text-sm text-dark-400">
            Henüz placement yok.
          </div>
        )}
      </div>

      {editing && (
        <EditPlacementModal
          placement={editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

function PlacementCard({
  placement,
  busy,
  onToggle,
  onEdit,
}: {
  placement: Placement
  busy: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const ctr =
    placement.impressions_30d && placement.impressions_30d > 0
      ? ((placement.clicks_30d ?? 0) / placement.impressions_30d) * 100
      : 0

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-dark-700 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-dark-500">{placement.key}</span>
            <span
              className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                placement.is_globally_enabled
                  ? 'bg-accent-green/20 text-accent-green'
                  : 'bg-dark-700 text-dark-400'
              }`}
            >
              {placement.is_globally_enabled ? 'Aktif' : 'Kapalı'}
            </span>
          </div>
          <Link
            to={`/ads/placements/${placement.key}`}
            className="text-base font-semibold text-white hover:text-neon-400 transition-colors"
          >
            {placement.display_name}
          </Link>
          <p className="text-xs text-dark-400 mt-1 line-clamp-2">
            {placement.description}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            to={`/ads/placements/${placement.key}`}
            title="Detay & analitik"
            className="p-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-300 hover:text-neon-400 hover:bg-dark-600"
          >
            <BarChart3 size={14} />
          </Link>
          <button
            onClick={onToggle}
            disabled={busy}
            title={placement.is_globally_enabled ? 'Globalde kapat' : 'Globalde aç'}
            className={`p-2 rounded-lg border transition-colors disabled:opacity-50 ${
              placement.is_globally_enabled
                ? 'bg-accent-green/10 border-accent-green/30 text-accent-green hover:bg-accent-green/20'
                : 'bg-dark-700 border-dark-600 text-dark-400 hover:bg-dark-600'
            }`}
          >
            <Power size={14} />
          </button>
          <button
            onClick={onEdit}
            className="p-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-300 hover:text-white hover:bg-dark-600"
          >
            <Pencil size={14} />
          </button>
        </div>
      </div>

      {/* Preview image or mock */}
      <div className="px-4 pt-4">
        {placement.preview_image_url ? (
          <div className="aspect-video bg-dark-950 rounded-lg overflow-hidden border border-dark-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={placement.preview_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <PlacementPreview placementKey={placement.key} viewport="mobile" />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 p-4">
        <Stat label="Aktif kampanya" value={placement.active_campaigns_count ?? 0} />
        <Stat
          label="Impressions 30g"
          value={(placement.impressions_30d ?? 0).toLocaleString()}
        />
        <Stat
          label="Clicks 30g"
          value={(placement.clicks_30d ?? 0).toLocaleString()}
        />
        <Stat label="CTR" value={`${ctr.toFixed(2)}%`} />
      </div>

      {/* Metrics collected */}
      <div className="px-4 pb-4">
        <p className="text-[10px] uppercase tracking-wide text-dark-500 mb-2">
          Toplanan veri
        </p>
        <div className="flex flex-wrap gap-1.5">
          {placement.metrics_collected.map((m) => (
            <span
              key={m}
              className="text-[10px] font-mono px-2 py-0.5 bg-dark-700 text-dark-300 rounded"
            >
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-dark-900 border border-dark-700 rounded-lg p-2">
      <p className="text-[9px] uppercase tracking-wide text-dark-500">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
    </div>
  )
}
