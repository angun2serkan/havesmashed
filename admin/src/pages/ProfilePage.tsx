import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCog, LogOut } from 'lucide-react'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import { useAdminStore } from '@/stores/adminStore'
import { authApi } from '@/services/api'

export default function ProfilePage() {
  const me = useAdminStore((s) => s.me)
  const logout = useAdminStore((s) => s.logout)
  const navigate = useNavigate()
  const [logoutAllPending, setLogoutAllPending] = useState(false)
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null)

  // SEC-105 — server'da bu user için logout-all timestamp set eder,
  // tüm açık session'lar geçersiz olur. Sonrasında bu sekmede de
  // session geçersiz; /login'e yönlendiriyoruz.
  const handleLogoutAll = async () => {
    const confirmed = window.confirm(
      "Tüm cihazlardan çıkış yapılacak — bu cihaz dahil. Devam edilsin mi?",
    )
    if (!confirmed) return
    setLogoutAllPending(true)
    setLogoutAllError(null)
    try {
      await authApi.logoutAll()
      logout()
      navigate('/login')
    } catch (e) {
      setLogoutAllError(
        e instanceof Error ? e.message : 'Logout-all başarısız',
      )
      setLogoutAllPending(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="text-neon-500" />
          Profile
        </h1>
      </header>

      {me && (
        <div className="bg-dark-900 border border-dark-700 rounded-lg p-5 mb-6">
          <h2 className="font-semibold text-white mb-3">Hesap Bilgileri</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Email" value={me.email ?? '(legacy api key)'} />
            <Row label="İsim" value={me.display_name} />
            <Row
              label="Rol"
              value={
                me.role === 'super_admin' ? 'Super Admin' : 'Brand Admin'
              }
            />
            {me.brand && <Row label="Brand" value={me.brand.display_name} />}
            <Row
              label="Son şifre değişikliği"
              value={
                me.password_changed_at
                  ? new Date(me.password_changed_at).toLocaleString('tr')
                  : '—'
              }
            />
          </dl>
        </div>
      )}

      <div className="bg-dark-900 border border-dark-700 rounded-lg p-5 mb-6">
        <h2 className="font-semibold text-white mb-3">Şifre Değiştir</h2>
        <ChangePasswordForm />
      </div>

      <div className="bg-dark-900 border border-red-900/40 rounded-lg p-5">
        <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
          <LogOut size={16} className="text-red-400" />
          Oturum Güvenliği
        </h2>
        <p className="text-sm text-dark-400 mb-3">
          Telefonunuzu kaybettiyseniz, paylaşılan bir cihazda oturum açık
          kaldıysa veya şüpheli bir aktivite gözlemlerseniz: tüm aktif
          session'larınızı (bu cihaz dahil) anlık olarak sonlandırın.
        </p>
        <button
          onClick={handleLogoutAll}
          disabled={logoutAllPending}
          className="px-3 py-2 text-sm rounded-lg bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {logoutAllPending ? 'Sonlandırılıyor…' : 'Tüm cihazlardan çıkış yap'}
        </button>
        {logoutAllError && (
          <p className="mt-2 text-xs text-red-400">{logoutAllError}</p>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-dark-800 pb-2 last:border-0">
      <dt className="text-dark-400">{label}</dt>
      <dd className="text-white text-right">{value}</dd>
    </div>
  )
}
