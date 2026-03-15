import { useEffect, useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { adminApi } from '@/services/api'

interface NotificationRow {
  id: string
  user_id: string | null
  title: string
  message: string
  created_at: string
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function fetchNotifications() {
    adminApi
      .getNotifications()
      .then(setNotifications)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await adminApi.sendNotification({
        title,
        message,
        ...(userId ? { user_id: userId } : {}),
      })
      setTitle('')
      setMessage('')
      setUserId('')
      setSuccess('Notification sent successfully')
      fetchNotifications()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send notification')
    } finally {
      setLoading(false)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString()
  }

  const inputClass =
    'px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors'

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Notifications</h2>

      {/* Send Notification Form */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
          Send Notification
        </h3>
        <form onSubmit={handleSend} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={inputClass}
            />
            <input
              placeholder="User ID (leave empty for broadcast)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className={inputClass}
            />
          </div>
          <textarea
            placeholder="Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={3}
            className={`${inputClass} w-full resize-none`}
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg font-medium hover:bg-neon-500/30 transition-colors disabled:opacity-50"
          >
            <Send size={16} />
            {loading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-4 text-sm">
          {success}
        </div>
      )}

      {/* Notifications List */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-dark-800 border-b border-dark-700">
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Time</th>
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Title</th>
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Message</th>
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((n) => (
              <tr key={n.id} className="border-b border-dark-700/50 hover:bg-dark-900/50">
                <td className="px-4 py-3 text-dark-400 whitespace-nowrap">
                  {formatDate(n.created_at)}
                </td>
                <td className="px-4 py-3 text-white font-medium">{n.title}</td>
                <td className="px-4 py-3 text-dark-300 max-w-xs truncate">{n.message}</td>
                <td className="px-4 py-3">
                  {n.user_id ? (
                    <span className="text-dark-300 font-mono text-xs">{n.user_id}</span>
                  ) : (
                    <span className="text-accent-cyan text-xs font-medium bg-accent-cyan/10 px-2 py-0.5 rounded-full">
                      Broadcast
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {notifications.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-dark-500">
                  No notifications sent yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
