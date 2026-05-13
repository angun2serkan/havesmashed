import { UserCog } from 'lucide-react'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import { useAdminStore } from '@/stores/adminStore'

export default function ProfilePage() {
  const me = useAdminStore((s) => s.me)

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

      <div className="bg-dark-900 border border-dark-700 rounded-lg p-5">
        <h2 className="font-semibold text-white mb-3">Şifre Değiştir</h2>
        <ChangePasswordForm />
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
