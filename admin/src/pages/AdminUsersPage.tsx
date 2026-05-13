import { useEffect, useState, type FormEvent } from 'react'
import { Copy, KeyRound, Plus, UserCog, X } from 'lucide-react'
import {
  adminUsersApi,
  brandsApi,
  type AdminUserRow,
  type Brand,
} from '@/services/api'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [tempCred, setTempCred] = useState<{ email: string; password: string } | null>(
    null,
  )
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    setUsers(null)
    adminUsersApi
      .list()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'))
    brandsApi
      .list(false)
      .then(setBrands)
      .catch(() => setBrands([]))
  }
  useEffect(load, [])

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="text-neon-500" />
            Admin Users
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            Super_admin ve brand_admin kullanıcı yönetimi.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 border border-neon-500/30 text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Yeni Admin
        </button>
      </header>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="bg-dark-900 border border-dark-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-dark-800 text-dark-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Email</th>
              <th className="text-left px-4 py-2.5">İsim</th>
              <th className="text-left px-4 py-2.5">Rol</th>
              <th className="text-left px-4 py-2.5">Brand</th>
              <th className="text-left px-4 py-2.5">Son login</th>
              <th className="text-left px-4 py-2.5">Şifre değişti</th>
              <th className="text-left px-4 py-2.5">Durum</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {users === null && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-dark-400">
                  Yükleniyor…
                </td>
              </tr>
            )}
            {users?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-dark-400">
                  Henüz admin user yok.
                </td>
              </tr>
            )}
            {users?.map((u) => {
              const brand = brands?.find((b) => b.id === u.brand_id)
              return (
                <tr
                  key={u.id}
                  className="border-t border-dark-800 hover:bg-dark-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-white">{u.email}</td>
                  <td className="px-4 py-3 text-dark-300">{u.display_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                        u.role === 'super_admin'
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-dark-300">
                    {brand?.display_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-dark-400 text-xs">
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleString('tr')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-dark-400 text-xs">
                    {u.must_change_password ? (
                      <span className="text-amber-400">force-change pending</span>
                    ) : u.password_changed_at ? (
                      new Date(u.password_changed_at).toLocaleDateString('tr')
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-400 uppercase tracking-wider">
                        active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-dark-700 text-dark-400 uppercase tracking-wider">
                        disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setResetTarget(u)}
                        className="px-2 py-1 rounded bg-dark-800 hover:bg-dark-700 text-dark-300 text-xs flex items-center gap-1"
                        title="Şifre sıfırla"
                      >
                        <KeyRound size={12} />
                        Sıfırla
                      </button>
                      {u.is_active ? (
                        <button
                          onClick={async () => {
                            if (!confirm(`${u.email} pasifleştirilsin mi?`)) return
                            await adminUsersApi.update(u.id, { is_active: false })
                            load()
                          }}
                          className="px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs"
                        >
                          Pasifleştir
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            await adminUsersApi.update(u.id, { is_active: true })
                            load()
                          }}
                          className="px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs"
                        >
                          Aktifleştir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <CreateUserModal
          brands={brands ?? []}
          onClose={() => setCreateOpen(false)}
          onCreated={(email, pw) => {
            setCreateOpen(false)
            setTempCred({ email, password: pw })
            load()
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onReset={(pw) => {
            setTempCred({ email: resetTarget.email, password: pw })
            setResetTarget(null)
            load()
          }}
        />
      )}

      {tempCred && (
        <TempPasswordDisplay
          email={tempCred.email}
          password={tempCred.password}
          onClose={() => setTempCred(null)}
        />
      )}
    </div>
  )
}

function CreateUserModal({
  brands,
  onClose,
  onCreated,
}: {
  brands: Brand[]
  onClose: () => void
  onCreated: (email: string, tempPassword: string) => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'super_admin' | 'brand_admin'>('brand_admin')
  const [brandId, setBrandId] = useState('')
  const [useCustomPassword, setUseCustomPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (role === 'brand_admin' && !brandId) {
      setError('brand_admin için marka seçin')
      return
    }
    setLoading(true)
    try {
      const res = await adminUsersApi.create({
        email: email.trim().toLowerCase(),
        display_name: name.trim(),
        role,
        brand_id: role === 'brand_admin' ? brandId : null,
        initial_password: useCustomPassword ? password : undefined,
      })
      onCreated(res.admin_user.email, res.temp_password)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-dark-800">
          <h2 className="font-bold text-white">Yeni Admin Davet Et</h2>
          <button type="button" onClick={onClose} className="text-dark-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="block text-xs text-dark-300 mb-1">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-dark-300 mb-1">İsim</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-dark-300 mb-1">Rol</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'super_admin' | 'brand_admin')}
              className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
            >
              <option value="brand_admin">Brand Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </label>
          {role === 'brand_admin' && (
            <label className="block">
              <span className="block text-xs text-dark-300 mb-1">Brand</span>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                required
                className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white"
              >
                <option value="">Seç…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.display_name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 text-xs text-dark-300 cursor-pointer">
            <input
              type="checkbox"
              checked={useCustomPassword}
              onChange={(e) => setUseCustomPassword(e.target.checked)}
              className="accent-neon-500"
            />
            Şifreyi kendim belirle (boş bırak → sistem 16-char rastgele üretir)
          </label>
          {useCustomPassword && (
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 8 char, harf+rakam"
              minLength={8}
              required
              className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white font-mono"
            />
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-dark-800">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-dark-300">
            İptal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-1.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Oluşturuluyor…' : 'Davet Et'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ResetPasswordModal({
  user,
  onClose,
  onReset,
}: {
  user: AdminUserRow
  onClose: () => void
  onReset: (tempPassword: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function doReset() {
    setLoading(true)
    setError('')
    try {
      const res = await adminUsersApi.resetPassword(user.id)
      onReset(res.temp_password)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reset failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm bg-dark-900 border border-dark-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-2">Şifre Sıfırla</h2>
        <p className="text-sm text-dark-300 mb-4">
          <strong>{user.email}</strong> için yeni geçici şifre üretilecek.
          Kullanıcı bir sonraki login'de bunu değiştirmek zorunda kalır.
        </p>
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-dark-300">
            İptal
          </button>
          <button
            onClick={doReset}
            disabled={loading}
            className="px-4 py-1.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Sıfırlanıyor…' : 'Sıfırla'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TempPasswordDisplay({
  email,
  password,
  onClose,
}: {
  email: string
  password: string
  onClose: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(password)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-dark-900 border border-amber-500/40 rounded-xl p-5">
        <div className="mb-4">
          <div className="text-amber-300 text-sm font-semibold mb-1">
            ⚠ Şifre sadece bir kez gösterilir
          </div>
          <p className="text-sm text-dark-300">
            Kullanıcıya iletmeden bu pencereyi kapatma. Aksi takdirde tekrar
            sıfırlaman gerekir.
          </p>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-dark-400 mb-1">Email</label>
          <div className="px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white font-mono">
            {email}
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs text-dark-400 mb-1">Geçici şifre</label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 bg-dark-950 border border-amber-500/30 rounded text-base text-amber-200 font-mono select-all break-all">
              {password}
            </div>
            <button
              onClick={copy}
              className="px-3 py-2 rounded bg-dark-800 hover:bg-dark-700 text-dark-300"
              title="Kopyala"
            >
              <Copy size={16} />
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-dark-300 mb-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="accent-neon-500"
          />
          Şifreyi kullanıcıya ilettim / güvenli bir yere kopyaladım.
        </label>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            disabled={!confirmed}
            className="px-4 py-1.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
