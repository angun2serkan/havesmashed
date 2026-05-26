import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '@/stores/adminStore'
import { authApi } from '@/services/api'

// Tek login formu. SEC-101: token transport artık httpOnly cookie —
// backend Set-Cookie ile `admin_access_token` + `admin_refresh_token`
// gönderir; frontend localStorage'a token yazmaz. Store sadece
// `isAuthenticated` flag'ini ve /me snapshot'ını tutar.
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Login backend Set-Cookie ile cookie'leri yazar; body'deki
      // access_token/refresh_token alanları artık kullanılmıyor.
      await authApi.login(email.trim(), password)
      useAdminStore.getState().markAuthenticated()

      try {
        const me = await authApi.me()
        useAdminStore.getState().setMe(me)
      } catch {
        // /me başarısız olursa root layout tekrar dener.
      }
      navigate('/')
    } catch (e) {
      useAdminStore.getState().logout()
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950">
      <div className="w-full max-w-sm bg-dark-800 border border-dark-700 rounded-2xl p-8">
        <img
          src="/logo.png"
          alt="havesmashed"
          className="w-24 h-24 mx-auto mb-3 object-contain drop-shadow-[0_0_16px_rgba(244,114,182,0.35)]"
        />
        <p className="text-dark-400 text-center text-sm mb-8">
          <span className="text-dark-200 uppercase tracking-widest text-xs">
            Admin Panel
          </span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-dark-300 mb-1.5"
            >
              Email veya kullanıcı adı
            </label>
            <input
              id="email"
              type="text"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com / admin"
              className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-dark-300 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
              required
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-2.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg font-medium hover:bg-neon-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
