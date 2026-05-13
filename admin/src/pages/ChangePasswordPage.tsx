import { useNavigate } from 'react-router-dom'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import { useAdminStore } from '@/stores/adminStore'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const me = useAdminStore((s) => s.me)
  const logout = useAdminStore((s) => s.logout)

  const forced = me?.must_change_password === true

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-md">
        {forced && (
          <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-sm">
            İlk girişinizde şifrenizi değiştirmeniz gerekiyor. Değiştirmeden başka
            bir sayfaya erişemezsiniz.
          </div>
        )}

        <div className="bg-dark-800 border border-dark-700 rounded-2xl p-8">
          <h1 className="text-xl font-bold text-white mb-1">Şifre Değiştir</h1>
          <p className="text-dark-400 text-sm mb-6">
            {forced
              ? 'Geçici şifrenizi kendi şifrenizle değiştirin.'
              : 'Şifrenizi güncelleyin.'}
          </p>
          <ChangePasswordForm
            onSuccess={() => {
              if (forced) navigate('/')
            }}
          />
        </div>

        <div className="text-center mt-4">
          <button
            onClick={() => {
              logout()
              navigate('/login')
            }}
            className="text-xs text-dark-500 hover:text-dark-300 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}
