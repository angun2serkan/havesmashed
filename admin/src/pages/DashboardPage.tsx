import { useEffect, useState } from 'react'
import { Users, Heart, Activity } from 'lucide-react'
import { adminApi } from '@/services/api'

interface Metrics {
  totalUsers: number
  totalDates: number
  dailyActiveUsers: number
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi
      .getMetrics()
      .then(setMetrics)
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        Failed to load metrics: {error}
      </div>
    )
  }

  const cards = [
    {
      label: 'Total Users',
      value: metrics?.totalUsers ?? '...',
      icon: Users,
      color: 'text-neon-400',
    },
    {
      label: 'Total Dates',
      value: metrics?.totalDates ?? '...',
      icon: Heart,
      color: 'text-accent-cyan',
    },
    {
      label: 'Daily Active Users',
      value: metrics?.dailyActiveUsers ?? '...',
      icon: Activity,
      color: 'text-accent-green',
    },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-dark-800 border border-dark-700 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-dark-400 text-sm font-medium">
                {card.label}
              </span>
              <card.icon size={20} className={card.color} />
            </div>
            <p className={`text-3xl font-bold ${card.color}`}>
              {typeof card.value === 'number'
                ? card.value.toLocaleString()
                : card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
