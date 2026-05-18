// Cron sağlığı dashboard'u (super-only).
// Aktif cron heartbeat durumu + son olay log'u + manuel tetikle butonu.

import { useEffect, useState } from 'react'
import { AlertTriangle, Activity, Play, RefreshCw } from 'lucide-react'
import {
  cronHealthApi,
  type CronStatus,
  type CronHealthLogEntry,
} from '@/services/api'

const EVENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tüm olaylar' },
  { value: 'ok', label: 'OK' },
  { value: 'stale_observed', label: 'Stale gözlemlendi' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'error', label: 'Hata' },
]

const PAGE_SIZE = 100

export default function CronHealthPage() {
  const [crons, setCrons] = useState<CronStatus[]>([])
  const [logs, setLogs] = useState<CronHealthLogEntry[]>([])
  const [eventFilter, setEventFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [triggering, setTriggering] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [s, l] = await Promise.all([
        cronHealthApi.status(),
        cronHealthApi.listLog({
          event: eventFilter || undefined,
          limit: PAGE_SIZE,
        }),
      ])
      setCrons(s.crons)
      setLogs(l.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventFilter])

  async function onTrigger(name: string) {
    setTriggering(name)
    setError('')
    try {
      await cronHealthApi.trigger(name)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'trigger failed')
    } finally {
      setTriggering(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-neon-500" />
          <div>
            <h1 className="text-2xl font-bold text-white">Cron Sağlığı</h1>
            <p className="text-xs text-dark-400">
              Periyodik servislerin son tick zamanı ve olay logu.
            </p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-200 hover:bg-dark-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Yenile
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {crons.length === 0 && !loading && (
          <div className="text-dark-500 text-sm">Cron tanımı bulunamadı.</div>
        )}
        {crons.map((c) => (
          <div
            key={c.name}
            className={`bg-dark-900 border rounded-lg p-4 ${
              c.stale ? 'border-red-500/50' : 'border-dark-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {c.stale ? (
                  <AlertTriangle size={16} className="text-red-400" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-accent-green" />
                )}
                <span className="font-mono text-sm text-white">{c.name}</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                  c.stale
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-accent-green/20 text-accent-green'
                }`}
              >
                {c.stale ? 'stale' : 'sağlıklı'}
              </span>
            </div>
            <div className="text-xs text-dark-400 mb-3">
              Son tick:{' '}
              <span className="font-mono text-dark-200">
                {c.last_run ? new Date(c.last_run).toLocaleString('tr-TR') : 'hiç'}
              </span>
              <span className="ml-2 text-dark-500">
                · stale eşiği {c.stale_threshold_hours}h
              </span>
            </div>
            <button
              onClick={() => void onTrigger(c.name)}
              disabled={triggering === c.name}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neon-500/15 border border-neon-500/30 text-neon-400 rounded text-xs hover:bg-neon-500/25 disabled:opacity-50"
            >
              <Play size={12} />
              {triggering === c.name ? 'Tetikleniyor…' : 'Manuel Tetikle'}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-dark-900 border border-dark-700 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-dark-800">
          <h2 className="font-semibold text-white">Olay Logu</h2>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-3 py-1.5 bg-dark-800 border border-dark-700 rounded text-xs text-white"
          >
            {EVENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-dark-400 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Olay</th>
              <th className="text-left px-4 py-2">Cron</th>
              <th className="text-left px-4 py-2">Detay</th>
              <th className="text-right px-4 py-2">Zaman</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-dark-400">
                  Log kaydı yok.
                </td>
              </tr>
            )}
            {logs.map((l) => {
              const color =
                l.event === 'ok' || l.event === 'recovered'
                  ? 'bg-accent-green/20 text-accent-green'
                  : l.event === 'stale_observed'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-red-500/20 text-red-400'
              return (
                <tr key={l.id} className="border-t border-dark-800">
                  <td className="px-4 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${color}`}
                    >
                      {l.event}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-dark-200">
                    {l.cron_name}
                  </td>
                  <td className="px-4 py-2 text-dark-400 text-xs max-w-md truncate">
                    {l.detail ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-dark-500 text-xs whitespace-nowrap">
                    {new Date(l.observed_at).toLocaleString('tr-TR')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
