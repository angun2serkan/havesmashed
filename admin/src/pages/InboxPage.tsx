import { useEffect, useState } from 'react'
import { Inbox, CheckCheck } from 'lucide-react'
import { inboxApi, type AdminNotification } from '@/services/api'

export default function InboxPage() {
  const [items, setItems] = useState<AdminNotification[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [error, setError] = useState('')

  const load = () => {
    setItems(null)
    inboxApi
      .list(filter, 100)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'))
  }
  useEffect(load, [filter])

  async function markRead(id: string) {
    try {
      await inboxApi.markRead(id)
      setItems((cur) =>
        cur?.map((i) => (i.id === id ? { ...i, read_at: new Date().toISOString() } : i)) ?? null,
      )
    } catch {/* ignore */}
  }

  async function markAll() {
    try {
      await inboxApi.markAllRead()
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'mark-all failed')
    }
  }

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="text-neon-500" />
            Inbox
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            Bildirimler — bütçe eşikleri, onay durumu, sistem mesajları.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-dark-800 rounded-lg p-0.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-xs rounded ${
                filter === 'all'
                  ? 'bg-dark-700 text-white'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              Hepsi
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 text-xs rounded ${
                filter === 'unread'
                  ? 'bg-dark-700 text-white'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              Okunmamış
            </button>
          </div>
          <button
            onClick={markAll}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded bg-dark-800 hover:bg-dark-700 text-dark-300"
          >
            <CheckCheck size={14} /> Hepsini okundu işaretle
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {items === null && (
          <div className="text-dark-400 text-sm">Yükleniyor…</div>
        )}
        {items?.length === 0 && (
          <div className="bg-dark-900 border border-dark-700 rounded-lg p-8 text-center text-dark-400">
            {filter === 'unread' ? '✓ Okunmamış bildirim yok.' : 'Hiç bildirim yok.'}
          </div>
        )}
        {items?.map((n) => {
          const unread = n.read_at === null
          return (
            <div
              key={n.id}
              onClick={() => unread && markRead(n.id)}
              className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                unread
                  ? 'bg-neon-500/5 border-neon-500/30 hover:bg-neon-500/10'
                  : 'bg-dark-900 border-dark-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {unread && (
                      <span className="w-2 h-2 rounded-full bg-neon-500" />
                    )}
                    <h3 className="font-semibold text-white">{n.title}</h3>
                  </div>
                  {n.body && (
                    <p className="text-sm text-dark-300 mt-1">{n.body}</p>
                  )}
                </div>
                <span className="text-[11px] text-dark-500 shrink-0">
                  {new Date(n.created_at).toLocaleString('tr')}
                </span>
              </div>
              <div className="text-[10px] text-dark-500 mt-2 uppercase tracking-wider">
                {n.type}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
