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
  // SEC-101: access/refresh token'lar artık httpOnly cookie. JavaScript
  // tokenları okuyamaz; store sadece "oturum açık mı" boolean'ını ve
  // /me snapshot'ını tutar. Eski `accessToken` / `refreshToken` alanları
  // migration ile silinir (version 3).
  isAuthenticated: boolean
  // Identity (loaded after /me)
  me: AdminMe | null
  // Env-super impersonation state — frontend her request'te
  // `X-Impersonate-Brand` header'ı olarak gönderir; backend state
  // tutmaz, sadece header'a güvenir. brand_admin token'ları için her
  // zaman null kalır (backend zaten ignore eder).
  impersonatingBrandId: string | null

  // Mutators
  markAuthenticated: () => void
  setMe: (me: AdminMe | null) => void
  clearImpersonation: () => void
  setImpersonating: (brand: BrandRef) => void
  logout: () => void
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      me: null,
      impersonatingBrandId: null,

      markAuthenticated: () =>
        set({
          isAuthenticated: true,
          impersonatingBrandId: null,
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
          isAuthenticated: false,
          me: null,
          impersonatingBrandId: null,
        }),
    }),
    {
      name: 'havesmashed-admin',
      // Persist edilen field'lar: token YOK (cookie'de). Sadece UI state.
      partialize: (s) => ({
        isAuthenticated: s.isAuthenticated,
        me: s.me,
        impersonatingBrandId: s.impersonatingBrandId,
      }),
      // version 3 — SEC-101: legacy accessToken/refreshToken alanlarını
      // localStorage'dan temizle. Eski oturumlar httpOnly cookie'lere
      // sahip olmadığı için ilk request 401 alacak, refresh de
      // başarısız olacak → kullanıcı login sayfasına yönlenir.
      version: 3,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = (persistedState ?? {}) as Record<string, unknown>
        if (fromVersion < 2) {
          // Legacy BUG-1 fix: apiKey + auth_method=api_key drop.
          if ('apiKey' in state) delete state.apiKey
          const me = state.me as { auth_method?: string } | null
          if (me && me.auth_method !== 'jwt') me.auth_method = 'jwt'
        }
        if (fromVersion < 3) {
          // SEC-101: localStorage'daki JWT'leri sil. Cookie yoksa zaten
          // request başarısız olacak; isAuthenticated'i de false yap ki
          // /login'e yönlendirme net olsun.
          if ('accessToken' in state) delete state.accessToken
          if ('refreshToken' in state) delete state.refreshToken
          state.isAuthenticated = false
          state.me = null
          state.impersonatingBrandId = null
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
