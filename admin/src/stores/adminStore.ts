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
  auth_method: 'jwt' | 'api_key'
}

interface AdminState {
  // Auth credentials
  accessToken: string | null
  refreshToken: string | null
  // super_admin: env-tabanlı ADMIN_API_KEY
  apiKey: string | null
  // Identity (loaded after /me)
  me: AdminMe | null
  // Env-super impersonation state — frontend her request'te
  // `X-Impersonate-Brand` header'ı olarak gönderir; backend state
  // tutmaz, sadece header'a güvenir.
  impersonatingBrandId: string | null

  // Computed
  isAuthenticated: boolean

  // Mutators
  setTokens: (access: string, refresh: string) => void
  setApiKey: (key: string) => void
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
      apiKey: null,
      me: null,
      impersonatingBrandId: null,
      isAuthenticated: false,

      setTokens: (access, refresh) =>
        set({
          accessToken: access,
          refreshToken: refresh,
          apiKey: null,
          impersonatingBrandId: null,
          isAuthenticated: true,
        }),

      setApiKey: (key) =>
        set({
          apiKey: key,
          accessToken: null,
          refreshToken: null,
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
          apiKey: null,
          me: null,
          impersonatingBrandId: null,
          isAuthenticated: false,
        }),
    }),
    { name: 'havesmashed-admin' },
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
