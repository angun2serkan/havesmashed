import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AdminRole = 'super_admin' | 'brand_admin'

export interface BrandRef {
  id: string
  slug: string
  display_name: string
}

export interface AdminMe {
  admin_user_id: string | null
  email: string | null
  display_name: string
  role: AdminRole
  brand_id: string | null
  brand: BrandRef | null
  must_change_password: boolean
  password_changed_at: string | null
  impersonating_brand: BrandRef | null
  // BUG-1 fix sonrası backend her zaman 'jwt' döndürür. Tip korunuyor
  // ki eski persisted state migration sırasında sorun yaşamasın.
  auth_method: 'jwt'
}

interface AdminState {
  // Auth credentials. BUG-1 fix: legacy `apiKey` alanı tamamen kaldırıldı;
  // env-super da JWT taşır (admin_user_id===null ile ayırt edilir).
  accessToken: string | null
  refreshToken: string | null
  // Identity (loaded after /me)
  me: AdminMe | null
  // Env-super impersonation state — frontend her request'te
  // `X-Impersonate-Brand` header'ı olarak gönderir; backend state
  // tutmaz, sadece header'a güvenir. brand_admin token'ları için her
  // zaman null kalır (backend zaten ignore eder).
  impersonatingBrandId: string | null

  // Computed
  isAuthenticated: boolean

  // Mutators
  setTokens: (access: string, refresh: string) => void
  setMe: (me: AdminMe | null) => void
  clearImpersonation: () => void
  setImpersonating: (brand: BrandRef) => void
  logout: () => void
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      me: null,
      impersonatingBrandId: null,
      isAuthenticated: false,

      setTokens: (access, refresh) =>
        set({
          accessToken: access,
          refreshToken: refresh,
          impersonatingBrandId: null,
          isAuthenticated: true,
        }),

      setMe: (me) => set({ me }),

      setImpersonating: (brand) =>
        set((s) => ({
          impersonatingBrandId: brand.id,
          me: s.me ? { ...s.me, impersonating_brand: brand } : s.me,
        })),

      clearImpersonation: () =>
        set((s) => ({
          impersonatingBrandId: null,
          me: s.me ? { ...s.me, impersonating_brand: null } : s.me,
        })),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          me: null,
          impersonatingBrandId: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'havesmashed-admin',
      // BUG-1 fix: persisted state'i whitelist'le tut. Eski apiKey alanı
      // (super_admin ADMIN_API_KEY'ini düz metin saklıyordu) artık şemada
      // yok; partialize ilerideki write'larda alanı düşürür.
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        me: s.me,
        impersonatingBrandId: s.impersonatingBrandId,
        isAuthenticated: s.isAuthenticated,
      }),
      // BUG-1 fix migration: eski tarayıcılarda localStorage'da
      // `apiKey` ve eski `auth_method: "api_key"` değerleri kalmış
      // olabilir. version=2 ile rehydrate sırasında alanı sil; ayrıca
      // eski session'u logout'a düşür ki kullanıcı JWT akışıyla taze
      // login olsun (apiKey değeri zaten yeni request path'inden geçmez,
      // ama UI "Authenticated" görmesin).
      version: 2,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = (persistedState ?? {}) as Record<string, unknown>
        if (fromVersion < 2) {
          if ('apiKey' in state) delete state.apiKey
          // Eski apiKey session'larını drop et — accessToken yoksa
          // zaten isAuthenticated=true tutmak yanıltıcı.
          if (state.accessToken == null) {
            state.isAuthenticated = false
            state.me = null
            state.impersonatingBrandId = null
          }
          // me.auth_method "api_key" değerini "jwt"e taşı; tip artık tek varyant.
          const me = state.me as { auth_method?: string } | null
          if (me && me.auth_method !== 'jwt') me.auth_method = 'jwt'
        }
        return state
      },
    },
  ),
)

/**
 * Effective role — accounts for impersonation. A super_admin who
 * entered "act as brand" mode behaves like a brand_admin everywhere.
 */
export function effectiveRole(me: AdminMe | null): AdminRole | null {
  if (!me) return null
  if (me.impersonating_brand) return 'brand_admin'
  return me.role
}

/**
 * Effective brand_id — the brand whose data the user can access.
 * null for super_admin (sees all), the impersonated brand for
 * super in act-as mode, own brand for brand_admin.
 */
export function effectiveBrandId(me: AdminMe | null): string | null {
  if (!me) return null
  if (me.impersonating_brand) return me.impersonating_brand.id
  return me.brand_id
}
