import { useEffect, useState } from 'react'
import { Users, Heart, Activity, Link2, Copy, Check } from 'lucide-react'
import { adminApi } from '@/services/api'

interface Metrics {
  totalUsers: number
  totalDates: number
  dailyActiveUsers: number
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    adminApi
      .getMetrics()
      .then(setMetrics)
      .catch((err: Error) => setError(err.message))
  }, [])

  const handleCreateInvite = async () => {
    setInviteLoading(true)
    try {
      const res = await adminApi.createPlatformInvite()
      setInviteLink(res.link)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (error) {
    return (
      <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        Failed to load metrics: {error}
      </div>
    )
  }

  const cards = [
    { label: 'Total Users', value: metrics?.totalUsers ?? '...', icon: Users, color: 'text-neon-400' },
    { label: 'Total Dates', value: metrics?.totalDates ?? '...', icon: Heart, color: 'text-accent-cyan' },
    { label: 'Daily Active', value: metrics?.dailyActiveUsers ?? '...', icon: Activity, color: 'text-accent-green' },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-dark-800 border border-dark-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-dark-400 text-sm font-medium">{card.label}</span>
              <card.icon size={20} className={card.color} />
            </div>
            <p className={`text-3xl font-bold ${card.color}`}>
              {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Invite to App */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Link2 size={18} className="text-neon-500" />
          <h3 className="text-sm font-semibold text-white">Invite to App</h3>
        </div>
        <p className="text-xs text-dark-400 mb-4">
          Generate a single-use invite link. The recipient can register using this link.
        </p>

        {inviteLink ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs font-mono text-dark-200 truncate"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-xs font-medium hover:bg-neon-500/30 transition-colors"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-[10px] text-dark-500">Single-use, expires in 24h</p>
              <button
                onClick={() => { setInviteLink(''); handleCreateInvite(); }}
                className="text-[10px] text-neon-500 hover:text-neon-400 transition-colors"
              >
                Generate another
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleCreateInvite}
            disabled={inviteLoading}
            className="flex items-center gap-2 px-4 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 transition-colors disabled:opacity-50"
          >
            <Link2 size={16} />
            {inviteLoading ? 'Generating...' : 'Generate Invite Link'}
          </button>
        )}
      </div>
    </div>
  )
}
