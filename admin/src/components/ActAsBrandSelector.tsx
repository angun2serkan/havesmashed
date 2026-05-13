import { useEffect, useState } from 'react'
import { Theater } from 'lucide-react'
import { authApi, brandsApi, type Brand } from '@/services/api'
import { useAdminStore } from '@/stores/adminStore'

export default function ActAsBrandSelector() {
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [brands, setBrands] = useState<Brand[] | null>(null)

  useEffect(() => {
    if (!open || brands !== null) return
    brandsApi
      .list(false)
      .then(setBrands)
      .catch(() => setBrands([]))
  }, [open, brands])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-actas-root]')) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function startAs(brandId: string) {
    setBusyId(brandId)
    try {
      const res = await authApi.impersonateStart(brandId)
      // Env-super: brand_id'yi store'a yaz, sonraki request'ler header ile
      // gönderilir. /me yenilenerek banner UI'sı dolar.
      useAdminStore.getState().setImpersonating(res.impersonating_brand)
      const me = await authApi.me()
      useAdminStore.getState().setMe(me)
      setOpen(false)
    } catch (e) {
      console.error('Impersonation failed', e)
      alert(e instanceof Error ? e.message : 'Failed to impersonate')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="relative" data-actas-root>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-700 hover:border-neon-500/50 text-xs text-dark-300 transition-colors"
      >
        <Theater size={14} />
        Brand olarak davran
        <span className="text-dark-500">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-dark-900 border border-dark-700 rounded-lg shadow-xl z-30 max-h-80 overflow-y-auto">
          {!brands ? (
            <div className="p-3 text-xs text-dark-400">Yükleniyor…</div>
          ) : brands.length === 0 ? (
            <div className="p-3 text-xs text-dark-400">Henüz brand yok.</div>
          ) : (
            <ul className="py-1">
              {brands.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => startAs(b.id)}
                    disabled={busyId !== null}
                    className="w-full text-left px-3 py-2 hover:bg-dark-800 text-sm text-dark-200 disabled:opacity-50 transition-colors"
                  >
                    <div className="font-medium">{b.display_name}</div>
                    <div className="text-[11px] text-dark-500">
                      {b.slug} · {b.campaigns_count} kampanya
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
