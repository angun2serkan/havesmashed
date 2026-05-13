import { useState, type FormEvent } from 'react'
import { authApi } from '@/services/api'
import { useAdminStore } from '@/stores/adminStore'

interface Props {
  onSuccess?: () => void
  /** Hide "current password" field when the user just registered? Not used yet. */
}

export default function ChangePasswordForm({ onSuccess }: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (next.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    const hasLetter = /[a-zA-Z]/.test(next)
    const hasDigit = /\d/.test(next)
    if (!hasLetter || !hasDigit) {
      setError('New password must contain at least one letter and one digit')
      return
    }
    if (next !== confirm) {
      setError('New passwords do not match')
      return
    }
    if (next === current) {
      setError('New password must differ from current password')
      return
    }

    setLoading(true)
    try {
      const res = await authApi.changePassword(current, next)
      useAdminStore.getState().setTokens(res.access_token, res.refresh_token)
      // Refresh the /me snapshot — must_change_password should now be false
      try {
        const me = await authApi.me()
        useAdminStore.getState().setMe(me)
      } catch { /* non-fatal */ }
      setSuccess('Password updated.')
      setCurrent('')
      setNext('')
      setConfirm('')
      onSuccess?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Password change failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-1.5">
          Current password
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-neon-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-1.5">
          New password
        </label>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-neon-500"
          required
          minLength={8}
        />
        <p className="text-[11px] text-dark-500 mt-1">
          At least 8 characters, must include letter + digit.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-1.5">
          Confirm new password
        </label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-neon-500"
          required
        />
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      {success && <p className="text-emerald-400 text-sm text-center">{success}</p>}

      <button
        type="submit"
        disabled={loading || !current || !next || !confirm}
        className="w-full py-2.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg font-medium hover:bg-neon-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Saving…' : 'Update Password'}
      </button>
    </form>
  )
}
