import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '@/stores/adminStore'
import { adminApi } from '@/services/api'

export default function LoginPage() {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Temporarily set the key so the API client uses it
    useAdminStore.getState().setApiKey(key)

    try {
      await adminApi.getMetrics()
      navigate('/')
    } catch {
      useAdminStore.getState().logout()
      setError('Invalid API Key')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950">
      <div className="w-full max-w-sm bg-dark-800 border border-dark-700 rounded-2xl p-8">
        <h1 className="text-2xl font-bold text-center mb-2">
          <span className="text-neon-500">havesmashed</span>{' '}
          <span className="text-dark-200">admin</span>
        </h1>
        <p className="text-dark-400 text-center text-sm mb-8">Admin Panel</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-dark-300 mb-1.5">
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter admin API key"
              className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
              required
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !key}
            className="w-full py-2.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg font-medium hover:bg-neon-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
