import { useAdminStore } from '@/stores/adminStore'

const API_BASE = '/api'

// ── Auth-aware fetch wrapper ──────────────────────────────────
//
// SEC-101: Auth transport artık httpOnly cookie. Tüm fetch çağrıları
// `credentials: 'include'` ile gönderilir; tarayıcı `admin_access_token`
// cookie'sini otomatik ekler. Bu sayede:
//   - JavaScript token'a erişemez (XSS senaryosunda exfil mümkün değil)
//   - localStorage'da artık JWT tutulmuyor
//   - Refresh tamamen cookie üzerinden: body boş, refresh cookie path'i
//     (`/api/admin/auth/refresh`) ile gönderilir.
//
// `isAuthenticated` artık server-truth — `me()` çağrısı 200 dönüyorsa
// auth var. Store'da `accessToken`/`refreshToken` alanları yok.
//
// 401 → tek refresh dene → yine 401 ise logout (auth guard /login'e atar).

let isRefreshing = false
let refreshQueue: Array<() => void> = []

async function attemptRefresh(): Promise<boolean> {
  if (isRefreshing) {
    await new Promise<void>((resolve) => refreshQueue.push(resolve))
    return useAdminStore.getState().isAuthenticated
  }
  isRefreshing = true

  try {
    // Refresh cookie path'i `/api/admin/auth/refresh` — tarayıcı sadece
    // bu URL'e refresh cookie'sini ekler. Body bilerek boş.
    const res = await fetch(`${API_BASE}/admin/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) {
      useAdminStore.getState().logout()
      return false
    }
    const json = await res.json()
    if (!json.success) {
      useAdminStore.getState().logout()
      return false
    }
    // Yeni cookies backend tarafından Set-Cookie ile geldi; store'da
    // ayrıca token tutmuyoruz, sadece authenticated flag'i taze tut.
    useAdminStore.getState().markAuthenticated()
    return true
  } finally {
    isRefreshing = false
    const queued = refreshQueue
    refreshQueue = []
    queued.forEach((cb) => cb())
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const { impersonatingBrandId } = useAdminStore.getState()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }
    // Env-super impersonation: backend her request'te header'dan okur,
    // state tutmaz. brand_admin JWT'sinde impersonation yok — backend
    // sub != Uuid::nil() ise header'ı bilerek ignore eder.
    if (impersonatingBrandId)
      headers['X-Impersonate-Brand'] = impersonatingBrandId
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    })
  }

  let res = await doFetch()

  // Auto-refresh on 401, then retry once. isAuthenticated false ise zaten
  // login sayfasındayız, refresh denemenin anlamı yok.
  if (res.status === 401 && useAdminStore.getState().isAuthenticated) {
    const ok = await attemptRefresh()
    if (ok) {
      res = await doFetch()
    }
  }

  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? 'Unknown error')
  return json.data as T
}

// ── Auth endpoints ────────────────────────────────────────────

// BUG-1 fix: hem brand_admin hem env-super JWT döner. Env-super'de
// `user.id` null kalır (admin_users tablosunda satır yok); frontend
// bu null'ı "env-super" ayırt edici olarak kullanır. `must_change_password`
// env-super için her zaman false (DB satırı olmadığı için pwc flag'i yok).
export type LoginResponse = {
  auth_method: 'jwt'
  access_token: string
  refresh_token: string
  must_change_password: boolean
  user: {
    id: string | null
    display_name: string
    role: 'super_admin' | 'brand_admin'
    brand_id: string | null
  }
}

export const authApi = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<{ ok: boolean }>('/admin/auth/logout', { method: 'POST' }),

  changePassword: (current_password: string, new_password: string) =>
    request<{
      access_token: string
      refresh_token: string
      must_change_password: boolean
    }>('/admin/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),

  me: () =>
    request<{
      admin_user_id: string | null
      email: string | null
      display_name: string
      role: 'super_admin' | 'brand_admin'
      brand_id: string | null
      brand: { id: string; slug: string; display_name: string } | null
      must_change_password: boolean
      password_changed_at: string | null
      impersonating_brand: { id: string; slug: string; display_name: string } | null
      auth_method: 'jwt'
    }>('/admin/me'),

  impersonateStart: (brand_id: string) =>
    request<{
      impersonating_brand: { id: string; slug: string; display_name: string }
    }>('/admin/impersonate', {
      method: 'POST',
      body: JSON.stringify({ brand_id }),
    }),

  impersonateStop: () =>
    request<{ ok: boolean }>('/admin/impersonate/stop', {
      method: 'POST',
    }),
}

// ── Brand entity endpoints ────────────────────────────────────

export type Brand = {
  id: string
  slug: string
  display_name: string
  contact_email: string | null
  contract_notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string | null
  campaigns_count: number
}

export type BrandGrant = {
  brand_id: string
  placement_key: string
  notes: string | null
  granted_at: string
}

export const brandsApi = {
  list: (inactive?: boolean) => {
    const qs = inactive ? '?inactive=true' : ''
    return request<Brand[]>(`/admin/brands${qs}`)
  },
  get: (id: string) => request<Brand>(`/admin/brands/${id}`),
  create: (body: {
    slug: string
    display_name: string
    contact_email?: string | null
    contract_notes?: string | null
  }) =>
    request<Brand>('/admin/brands', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (
    id: string,
    body: Partial<{
      display_name: string
      contact_email: string | null
      contract_notes: string | null
    }>,
  ) =>
    request<Brand>(`/admin/brands/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deactivate: (id: string) =>
    request<{ id: string; is_active: false }>(`/admin/brands/${id}`, {
      method: 'DELETE',
    }),

  listGrants: (brand_id: string) =>
    request<BrandGrant[]>(`/admin/brands/${brand_id}/grants`),
  upsertGrant: (
    brand_id: string,
    body: {
      placement_key: string
      notes?: string | null
    },
  ) =>
    request<{ brand_id: string; placement_key: string }>(
      `/admin/brands/${brand_id}/grants`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  removeGrant: (brand_id: string, placement_key: string) =>
    request<{ removed: boolean }>(
      `/admin/brands/${brand_id}/grants/${placement_key}`,
      { method: 'DELETE' },
    ),
}

// ── Admin user management ─────────────────────────────────────

export type AdminUserRow = {
  id: string
  email: string
  display_name: string
  role: 'super_admin' | 'brand_admin'
  brand_id: string | null
  is_active: boolean
  must_change_password: boolean
  password_changed_at: string | null
  last_login_at: string | null
  created_at: string
}

export const adminUsersApi = {
  list: () => request<AdminUserRow[]>('/admin/admin-users'),
  get: (id: string) => request<AdminUserRow>(`/admin/admin-users/${id}`),

  create: (body: {
    email: string
    display_name: string
    role: 'super_admin' | 'brand_admin'
    brand_id?: string | null
    initial_password?: string
  }) =>
    request<{
      admin_user: AdminUserRow
      temp_password: string
    }>('/admin/admin-users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (
    id: string,
    body: Partial<{
      display_name: string
      is_active: boolean
      role: 'super_admin' | 'brand_admin'
      brand_id: string | null
    }>,
  ) =>
    request<{ updated: boolean }>(`/admin/admin-users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  resetPassword: (id: string) =>
    request<{ id: string; temp_password: string; must_change_password: true }>(
      `/admin/admin-users/${id}/reset-password`,
      { method: 'POST' },
    ),
}

// ── Brand-scoped stats ────────────────────────────────────────

export type BrandStatsSummary = {
  brand_id: string
  window_days: number
  totals: { impressions: number; clicks: number; ctr: number }
  budget: {
    total_spent_cents: number
    total_budget_cents: number
    overall_progress_percent: number | null
    campaigns_paused_due_to_budget: number
  }
  per_campaign: Array<{
    id: string
    name: string
    placement_key: string
    total_budget_cents: number | null
    spent_cents: number
    progress_percent: number | null
    status: string
    paused_reason: string | null
  }>
  affiliate_clicks_total: number
}

export const brandStatsApi = {
  summary: (brand_id: string, days?: number) => {
    const qs = days ? `?days=${days}` : ''
    return request<BrandStatsSummary>(`/admin/stats/brand/${brand_id}${qs}`)
  },
}

// ── Admin inbox (notifications) ───────────────────────────────

export type AdminNotification = {
  id: string
  type: string
  title: string
  body: string | null
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export const inboxApi = {
  list: (filter?: 'all' | 'unread', limit?: number) => {
    const p = new URLSearchParams()
    if (filter) p.set('filter', filter)
    if (limit) p.set('limit', String(limit))
    const qs = p.toString()
    return request<AdminNotification[]>(`/admin/inbox${qs ? `?${qs}` : ''}`)
  },
  unreadCount: () =>
    request<{ count: number }>('/admin/inbox/unread-count'),
  markRead: (id: string) =>
    request<{ id: string; marked: boolean }>(
      `/admin/inbox/${id}/mark-read`,
      { method: 'POST' },
    ),
  markAllRead: () =>
    request<{ marked_count: number }>('/admin/inbox', { method: 'POST' }),
}

// ════════════════════════════════════════════════════════════════
// EXISTING ENDPOINTS — preserved for backward compat
// ════════════════════════════════════════════════════════════════

export const adminApi = {
  // Auth test
  getMetrics: () => request<{ totalUsers: number; totalDates: number; dailyActiveUsers: number }>('/admin/metrics'),

  // Tags (public; sponsored badge criteria builder kullanır)
  getTags: () =>
    request<Array<{ id: number; name: string; category: string; is_predefined: boolean }>>(
      '/tags',
    ),

  // Cities
  getCities: (country_code?: string) => {
    const params = country_code ? `?country_code=${encodeURIComponent(country_code)}` : '';
    return request<Array<{ id: number; name: string; country_code: string; latitude: number; longitude: number; population: number | null }>>(`/admin/cities${params}`);
  },
  createCity: (data: { name: string; country_code: string; latitude: number; longitude: number; population?: number }) =>
    request<{ id: number }>('/admin/cities', { method: 'POST', body: JSON.stringify(data) }),
  bulkCreateCities: (cities: Array<{ name: string; country_code: string; latitude: number; longitude: number; population?: number }>) =>
    request<{
      added: number
      skipped: number
      errors: Array<{ row: number; name: string | null; reason: string }>
    }>('/admin/cities/bulk', { method: 'POST', body: JSON.stringify({ cities }) }),
  updateCity: (id: number, data: Record<string, unknown>) =>
    request<{ id: number }>(`/admin/cities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCity: (id: number) =>
    request<null>(`/admin/cities/${id}`, { method: 'DELETE' }),

  // Badges
  getBadges: (gender?: string) => {
    const params = gender ? `?gender=${encodeURIComponent(gender)}` : '';
    return request<BadgeRow[]>(`/admin/badges${params}`);
  },
  createBadge: (data: { name: string; description: string; icon: string; category: string; threshold: number; image_url?: string; gender?: string; criteria?: BadgeCriteria | null }) =>
    request<{ id: number }>('/admin/badges', { method: 'POST', body: JSON.stringify(data) }),
  updateBadge: (id: number, data: Record<string, unknown>) =>
    request<{ id: number }>(`/admin/badges/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBadge: (id: number) =>
    request<null>(`/admin/badges/${id}`, { method: 'DELETE' }),
  uploadBadgeImage: async (file: File): Promise<{ url: string }> => {
    // SEC-101: cookie auth; FormData için Content-Type'ı browser kendisi
    // (boundary ile) ayarlasın, manuel set etme.
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/admin/badges/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? 'Upload failed');
    return json.data as { url: string };
  },
  // Legacy super-admin sponsor retrofit endpoint'leri (setBadgeSponsor /
  // clearBadgeSponsor) migration 054 ile birlikte kaldırıldı. Brand artık
  // kendi badge_sponsor kampanyasını açıyor (createCampaign).
  getSponsoredBadgeStats: () =>
    request<Array<{
      badge_id: number
      name: string
      sponsor_name: string | null
      total_unlocks: number
      sponsor_click_count: number
    }>>('/admin/badges/sponsored/stats'),

  // Notifications (user-facing broadcast — kept distinct from admin inbox)
  sendNotification: (data: { user_id?: string; title: string; message: string }) =>
    request<{ id: string }>('/admin/notifications', { method: 'POST', body: JSON.stringify(data) }),
  getNotifications: () => request<Array<{ id: string; user_id: string | null; title: string; message: string; created_at: string }>>('/admin/notifications'),

  // Users
  getUsers: () => request<Array<{ id: string; nickname: string | null; date_count: number; friend_count: number; created_at: string; last_seen_at: string | null; is_active: boolean }>>('/admin/users'),

  // Invites
  createPlatformInvite: () => request<{ token: string; link: string; expires_in_secs: number }>('/admin/invites', { method: 'POST' }),

  // Forum
  getForumTopics: () => request<any[]>('/admin/forum/topics'),
  deleteForumTopic: (id: string) => request<null>(`/admin/forum/topics/${id}`, { method: 'DELETE' }),
  toggleForumPin: (id: string) => request<any>(`/admin/forum/topics/${id}/pin`, { method: 'PUT' }),
  toggleForumLock: (id: string) => request<any>(`/admin/forum/topics/${id}/lock`, { method: 'PUT' }),
  deleteForumComment: (id: string) => request<null>(`/admin/forum/comments/${id}`, { method: 'DELETE' }),

  // Forum Reports & Bans
  getForumReports: () => request<any[]>('/admin/forum/reports'),
  reviewReport: (id: string, status: string) =>
    request<any>(`/admin/forum/reports/${id}/review`, { method: 'PUT', body: JSON.stringify({ status }) }),
  banForumUser: (userId: string, data: { duration_hours: number; reason?: string }) =>
    request<any>(`/admin/forum/users/${userId}/ban`, { method: 'POST', body: JSON.stringify(data) }),
  unbanForumUser: (userId: string) =>
    request<any>(`/admin/forum/users/${userId}/unban`, { method: 'POST' }),
  getActiveBans: () => request<any[]>('/admin/forum/bans'),

  // Advertiser stats (super only)
  getStatsOverview: (days?: number) =>
    request<{
      headline: {
        as_of: string
        total_users: number
        dau: number
        mau: number
        dau_mau_ratio: number
        total_dates_logged: number
      } | null
      series: Array<{
        date: string
        total_users: number
        new_users: number
        dau: number
        mau: number
        total_dates_logged: number
        new_dates_logged: number
      }>
    }>(`/admin/stats/overview${days ? `?days=${days}` : ''}`),

  getStatsSegments: (date?: string, segmentKey?: string) => {
    const p = new URLSearchParams()
    if (date) p.set('date', date)
    if (segmentKey) p.set('segment_key', segmentKey)
    const qs = p.toString()
    return request<{
      date: string | null
      rows: Array<{ segment_key: string; segment_value: string; cohort_size: number }>
    }>(`/admin/stats/segments${qs ? `?${qs}` : ''}`)
  },

  getStatsTrends: (segmentKey: string, segmentValue?: string, days?: number) => {
    const p = new URLSearchParams({ segment_key: segmentKey })
    if (segmentValue) p.set('segment_value', segmentValue)
    if (days) p.set('days', String(days))
    return request<{
      segment_key: string
      rows: Array<{ date: string; segment_value: string; cohort_size: number }>
    }>(`/admin/stats/trends?${p.toString()}`)
  },

  getStatsSnapshot: (days?: number, segments?: string[]) => {
    const p = new URLSearchParams()
    if (days) p.set('days', String(days))
    if (segments && segments.length) p.set('segments', segments.join(','))
    const qs = p.toString()
    return request<{
      as_of: string | null
      series: Array<{
        date: string
        total_users: number
        new_users: number
        dau: number
        mau: number
        total_dates_logged: number
        new_dates_logged: number
      }>
      segments: Array<{ segment_key: string; segment_value: string; cohort_size: number }>
      k_threshold: number
    }>(`/admin/stats/snapshot${qs ? `?${qs}` : ''}`)
  },

  recomputeAnalytics: (date?: string) =>
    request<{ date: string }>(`/admin/analytics/recompute${date ? `?date=${date}` : ''}`, {
      method: 'POST',
    }),

  // Ads — placements
  listPlacements: () =>
    request<Array<Placement>>('/admin/ads/placements'),

  getPlacement: (key: string) =>
    request<Placement>(`/admin/ads/placements/${key}`),

  getPlacementDetail: (key: string, days?: number) => {
    const qs = days ? `?days=${days}` : ''
    return request<PlacementDetail>(`/admin/ads/placements/${key}/detail${qs}`)
  },

  updatePlacement: (key: string, body: Partial<{
    display_name: string
    description: string
    preview_image_url: string | null
    creative_spec: Record<string, unknown>
    display_rules: Record<string, unknown>
    metrics_collected: string[]
  }>) =>
    request<Placement>(`/admin/ads/placements/${key}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  enablePlacement: (key: string) =>
    request<{ key: string; is_globally_enabled: boolean }>(
      `/admin/ads/placements/${key}/enable`,
      { method: 'POST' },
    ),

  disablePlacement: (key: string) =>
    request<{ key: string; is_globally_enabled: boolean }>(
      `/admin/ads/placements/${key}/disable`,
      { method: 'POST' },
    ),

  uploadAdCreative: async (file: File): Promise<{ url: string }> => {
    // SEC-101: cookie auth — bkz. uploadBadgeImage.
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/admin/ads/upload-creative', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.error ?? 'Upload failed')
    return json.data as { url: string }
  },

  // Ads — campaigns
  listCampaigns: (filters?: {
    status?: CampaignStatus | 'all' | 'scheduled' | 'expired' | 'dry_run'
    placement_key?: string
    brand_id?: string
    include_deleted?: boolean
  }) => {
    const p = new URLSearchParams()
    if (filters?.status) p.set('status', filters.status)
    if (filters?.placement_key) p.set('placement_key', filters.placement_key)
    if (filters?.brand_id) p.set('brand_id', filters.brand_id)
    if (filters?.include_deleted) p.set('include_deleted', 'true')
    const qs = p.toString()
    return request<Campaign[]>(`/admin/ads/campaigns${qs ? `?${qs}` : ''}`)
  },

  getCampaign: (id: string) =>
    request<Campaign>(`/admin/ads/campaigns/${id}`),

  getCampaignDetail: (id: string, days?: number) => {
    const qs = days ? `?days=${days}` : ''
    return request<CampaignDetail>(`/admin/ads/campaigns/${id}/detail${qs}`)
  },

  listAuditLog: (filters?: {
    target_kind?: string
    target_id?: string
    action?: string
    since?: string
    until?: string
    limit?: number
  }) => {
    const p = new URLSearchParams()
    if (filters?.target_kind) p.set('target_kind', filters.target_kind)
    if (filters?.target_id) p.set('target_id', filters.target_id)
    if (filters?.action) p.set('action', filters.action)
    if (filters?.since) p.set('since', filters.since)
    if (filters?.until) p.set('until', filters.until)
    if (filters?.limit) p.set('limit', String(filters.limit))
    const qs = p.toString()
    return request<AuditLogEntry[]>(`/admin/ads/audit${qs ? `?${qs}` : ''}`)
  },

  createCampaign: (body: CampaignCreateInput) =>
    request<Campaign>('/admin/ads/campaigns', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateCampaign: (id: string, body: CampaignUpdateInput) =>
    request<Campaign>(`/admin/ads/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  pauseCampaign: (id: string) =>
    request<{ id: string; status: string }>(
      `/admin/ads/campaigns/${id}/pause`,
      { method: 'POST' },
    ),

  activateCampaign: (id: string) =>
    request<{ id: string; status: string }>(
      `/admin/ads/campaigns/${id}/activate`,
      { method: 'POST' },
    ),

  deleteCampaign: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/admin/ads/campaigns/${id}`, {
      method: 'DELETE',
    }),

  // T3.3 — approval state machine
  submitForReview: (id: string) =>
    request<{ id: string; status: 'pending_review' }>(
      `/admin/ads/campaigns/${id}/submit-for-review`,
      { method: 'POST' },
    ),

  approveCampaign: (id: string) =>
    request<{ id: string; status: 'active' }>(
      `/admin/ads/campaigns/${id}/approve`,
      { method: 'POST' },
    ),

  rejectCampaign: (id: string, reason: string) =>
    request<{ id: string; status: 'rejected'; reason: string }>(
      `/admin/ads/campaigns/${id}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),

  resumeCampaign: (id: string) =>
    request<{ id: string; status: string }>(
      `/admin/ads/campaigns/${id}/resume`,
      { method: 'POST' },
    ),

  // T0.2 — restore from soft delete (super only)
  restoreCampaign: (id: string) =>
    request<{ id: string; status: string }>(
      `/admin/ads/campaigns/${id}/restore`,
      { method: 'POST' },
    ),

  // T3.4 — approval queue
  listPendingReview: () =>
    request<Campaign[]>('/admin/ads/campaigns/pending-review'),

  // Brand-badge preview: badge_sponsor kampanyasına bağlı badge satırını
  // döndürür. ApprovalQueue super'a "ne onaylıyorsun" preview'ı için kullanır.
  getCampaignBadge: (id: string) =>
    request<{
      id: number
      name: string
      description: string
      icon: string
      category: 'dates' | 'explore' | 'social' | 'quality'
      threshold: number
      image_url: string | null
      gender: 'male' | 'female' | 'both'
      is_sponsored: boolean
      sponsor_name: string | null
      sponsor_logo_url: string | null
      sponsor_click_url: string | null
      brand_id: string | null
      status: string
      tier: 'bronze' | 'silver' | 'gold' | 'premium' | null
    }>(`/admin/ads/campaigns/${id}/badge`),

  // T0.4 — manual budget aggregator trigger (super only)
  runBudgetAggregator: () =>
    request<{ processed: number; auto_paused: number; alerts_fired: number }>(
      '/admin/ads/jobs/budget-aggregator/run',
      { method: 'POST' },
    ),

  // Ads — affiliate links
  listAffiliate: (include_deleted?: boolean) => {
    const qs = include_deleted ? '?include_deleted=true' : ''
    return request<AffiliateLink[]>(`/admin/ads/affiliate${qs}`)
  },

  createAffiliate: (body: AffiliateCreateInput) =>
    request<AffiliateLink>('/admin/ads/affiliate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateAffiliate: (id: string, body: AffiliateUpdateInput) =>
    request<AffiliateLink>(`/admin/ads/affiliate/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deactivateAffiliate: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/admin/ads/affiliate/${id}`, {
      method: 'DELETE',
    }),

  restoreAffiliate: (id: string) =>
    request<{ id: string; restored: boolean }>(
      `/admin/ads/affiliate/${id}/restore`,
      { method: 'POST' },
    ),
}

// ── Type exports ──────────────────────────────────────────────

export type BadgeRow = {
  id: number
  name: string
  description: string
  icon: string
  category: string
  threshold: number
  image_url: string | null
  gender: 'male' | 'female' | 'lgbt' | 'both'
  is_sponsored: boolean
  sponsor_name: string | null
  sponsor_click_url: string | null
  sponsor_logo_url: string | null
  sponsor_click_count: number
  /** Sponsored badge ile aynı şema; NULL ise legacy category/threshold unlock. */
  criteria: BadgeCriteria | null
}

export type Placement = {
  key: string
  display_name: string
  description: string
  preview_image_url: string | null
  creative_spec: Record<string, unknown>
  display_rules: Record<string, unknown>
  metrics_collected: string[]
  is_globally_enabled: boolean
  requires_auth: boolean
  active_campaigns_count?: number
  impressions_30d?: number
  clicks_30d?: number
}

export type PlacementDetail = {
  placement: Placement
  window_days: number
  totals: {
    impressions: number
    clicks: number
    ctr: number
    avg_dwell_ms: number | null
    metric_aggregates: Record<string, number>
  }
  daily_series: Array<{ date: string; impressions: number; clicks: number }>
  active_campaigns: Array<{
    id: string
    brand_name: string
    weight: number
    status?: string
    is_active?: boolean
    is_dry_run: boolean
    starts_at: string
    ends_at: string
    impressions_total: number
    clicks_total: number
    ctr: number
  }>
}

export type TargetSegment = {
  city_ids?: number[]
  age_ranges?: string[]
  behaviors?: string[]
}

export type CampaignCreative = {
  image_url?: string
  video_url?: string
  title?: string
  body?: string
  cta?: string
  sponsor_name?: string
  logo_url?: string
}

export type CampaignStatus =
  | 'draft'
  | 'pending_review'
  | 'active'
  | 'paused'
  | 'rejected'

export type Campaign = {
  id: string
  brand_id: string
  brand_name: string
  placement_key: string
  creative: CampaignCreative
  click_url: string
  target_segment: TargetSegment | null
  starts_at: string
  ends_at: string
  weight: number
  status: CampaignStatus
  is_active: boolean
  is_dry_run: boolean
  deleted_at: string | null
  pricing_model: 'cpm' | 'cpc' | 'flat' | null
  unit_price_cents: number | null
  total_budget_cents: number | null
  target_impressions: number | null
  duration_months: 1 | 3 | 6 | 12 | null
  spent_cents: number
  progress_percent: number | null
  paused_reason: string | null
  created_at: string
  updated_at: string | null
  impressions_total: number
  clicks_total: number
}

export type BadgeDateFilter = {
  gender?: ('male' | 'female' | 'other')[]
  age_range?: string[]
  height_range?: string[]
  country_code?: string[]
  city_id?: number[]
  min_rating?: number
  min_face_rating?: number
  min_body_rating?: number
  min_chat_rating?: number
  /** Tag ID'lerinden EN AZ BİRİNİN date'te bulunması gerekir (OR semantiği). */
  any_tags?: number[]
  /** ISO date (YYYY-MM-DD). */
  date_after?: string
  date_before?: string
}

export type BadgeCondition =
  | { type: 'count'; min: number; filter: BadgeDateFilter }
  | {
      type: 'distinct'
      field: 'country_code' | 'city_id'
      min: number
      filter?: BadgeDateFilter
    }
  | {
      type: 'avg_rating'
      field: 'rating' | 'face_rating' | 'body_rating' | 'chat_rating'
      min_avg: number
      min_sample: number
      filter?: BadgeDateFilter
    }
  | { type: 'friend_count'; min: number }

/** Sponsored badge zengin kriter spec'i. Tüm conditions AND ile birleşir. */
export type BadgeCriteria = {
  conditions: BadgeCondition[]
}

export type BadgeSpec = {
  name: string
  description: string
  icon: string
  category: 'dates' | 'explore' | 'social' | 'quality'
  threshold: number
  image_url?: string | null
  gender?: 'male' | 'female' | 'both' | null
  /** Opsiyonel. Verilirse unlock evaluator bu spec'i değerlendirir; legacy
   *  category/threshold yolu kullanılmaz. */
  criteria?: BadgeCriteria | null
}

export type DurationMonths = 1 | 3 | 6 | 12
export const DURATION_MONTH_OPTIONS: DurationMonths[] = [1, 3, 6, 12]

export type CampaignCreateInput = {
  brand_id?: string | null
  placement_key: string
  creative: CampaignCreative
  click_url: string
  target_segment?: TargetSegment | null
  starts_at: string
  weight?: number
  is_dry_run?: boolean
  /** Tier paketi (1/3/6/12). Süre, included impression ve CPM bundan gelir;
   *  brand serbest impression girişi yapmaz. */
  duration_months: DurationMonths
  /** placement_key='badge_sponsor' için zorunlu. Brand kendi badge'ini tasarlar. */
  badge_spec?: BadgeSpec
}

export type CampaignUpdateInput = Partial<{
  creative: CampaignCreative
  // click_url is intentionally not editable — locked at creation.
  target_segment: TargetSegment | null
  starts_at: string
  ends_at: string
  weight: number
  is_dry_run: boolean
  pricing_model: 'cpm' | 'cpc' | 'flat' | null
  unit_price_cents: number | null
  total_budget_cents: number | null
}>

export type AffiliateLink = {
  id: string
  slug: string
  /** Operatör-okur etiket; NULL ise UI slug'a fallback yapar. */
  name: string | null
  brand_id: string | null
  brand_name: string
  target_url: string
  utm_campaign: string | null
  is_active: boolean
  deleted_at: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
  clicks_30d: number
  clicks_total: number
  daily_clicks: Array<{ date: string; count: number }>
}

export type AffiliateCreateInput = {
  slug: string
  brand_id?: string | null
  name?: string | null
  target_url: string
  utm_campaign?: string | null
  notes?: string | null
}

export type AffiliateUpdateInput = Partial<{
  target_url: string
  utm_campaign: string | null
  notes: string | null
  is_active: boolean
  name: string | null
}>

export type AuditLogEntry = {
  id: string
  actor: string
  action: string
  target_id: string | null
  target_kind: string | null
  diff: Record<string, unknown> | null
  admin_user_id: string | null
  impersonating_brand_id: string | null
  brand_id: string | null
  created_at: string
}

export type CampaignDetail = {
  campaign: Campaign
  window_days: number
  metrics_collected: string[]
  totals: {
    impressions: number
    clicks: number
    ctr: number
    avg_dwell_ms: number | null
    today_impressions: number
    metric_aggregates: Record<string, number>
  }
  daily_series: Array<{
    date: string
    impressions: number
    clicks: number
    ctr: number
  }>
  audit_log: Array<{
    id: string
    actor: string
    action: string
    diff: Record<string, unknown> | null
    created_at: string
  }>
  segment_breakdown: Array<{
    segment_key: string
    segment_value: string
    cohort_size: number
  }>
}

// ════════════════════════════════════════════════════════════
// Brand wallet (BRAND_BALANCE_PLAN §7.1)
// ════════════════════════════════════════════════════════════

export type WalletTxKind =
  | 'topup'
  | 'purchase'
  | 'extend'
  | 'refund'
  | 'adjust'

export type WalletTransaction = {
  id: string
  kind: WalletTxKind
  amount_cents: number
  balance_after_cents: number
  ref_kind: string | null
  ref_id: string | null
  description: string | null
  actor_label: string
  admin_user_id?: string | null
  impersonating_brand_id?: string | null
  created_at: string
}

export type WalletSummary = {
  brand_id: string
  balance_cents: number
  recent_transactions: WalletTransaction[]
}

export const walletApi = {
  get: (brandId: string) =>
    request<WalletSummary>(`/admin/brands/${brandId}/wallet`),

  listTransactions: (
    brandId: string,
    params?: { kind?: string; ref_kind?: string; limit?: number; offset?: number },
  ) => {
    const qs = new URLSearchParams()
    if (params?.kind) qs.set('kind', params.kind)
    if (params?.ref_kind) qs.set('ref_kind', params.ref_kind)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return request<{
      items: WalletTransaction[]
      limit: number
      offset: number
    }>(`/admin/brands/${brandId}/wallet/transactions${q ? `?${q}` : ''}`)
  },

  topup: (brandId: string, amount_cents: number, description: string) =>
    request<WalletTransaction>(`/admin/brands/${brandId}/wallet/topup`, {
      method: 'POST',
      body: JSON.stringify({ amount_cents, description }),
    }),

  adjust: (brandId: string, amount_cents: number, description: string) =>
    request<WalletTransaction>(`/admin/brands/${brandId}/wallet/adjust`, {
      method: 'POST',
      body: JSON.stringify({ amount_cents, description }),
    }),

  refund: (
    brandId: string,
    amount_cents: number,
    description: string,
    campaign_id?: string,
  ) =>
    request<WalletTransaction>(`/admin/brands/${brandId}/wallet/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount_cents, description, campaign_id }),
    }),
}

// ════════════════════════════════════════════════════════════
// Placement pricing
// ════════════════════════════════════════════════════════════

export type PricingHistoryEntry = {
  id: string
  pricing_model: 'cpm'
  unit_price_cents: number
  duration_months: DurationMonths
  included_impressions: number
  effective_from: string
  effective_to: string | null
  actor_label: string
  notes: string | null
  created_at: string
  is_active: boolean
}

export type ActivePricing = {
  placement_key: string
  pricing_model: 'cpm'
  unit_price_cents: number
  duration_months: DurationMonths
  included_impressions: number
  effective_from: string
}

export const pricingApi = {
  getForPlacement: (placement_key: string) =>
    request<{ placement_key: string; history: PricingHistoryEntry[] }>(
      `/admin/ads/placements/${placement_key}/pricing`,
    ),

  update: (
    placement_key: string,
    unit_price_cents: number,
    duration_months: DurationMonths,
    included_impressions: number,
    notes?: string,
  ) =>
    request<{
      id: string
      placement_key: string
      pricing_model: 'cpm'
      unit_price_cents: number
      duration_months: DurationMonths
      included_impressions: number
      effective_from: string
      is_active: boolean
    }>(`/admin/ads/placements/${placement_key}/pricing`, {
      method: 'POST',
      body: JSON.stringify({
        unit_price_cents,
        duration_months,
        included_impressions,
        notes,
      }),
    }),

  listActive: () => request<ActivePricing[]>('/admin/ads/pricing/active'),
}

// ════════════════════════════════════════════════════════════
// Cron health
// ════════════════════════════════════════════════════════════

export type CronStatus = {
  name: string
  last_run: string | null
  stale: boolean
  stale_threshold_hours: number
}

export type CronHealthLogEntry = {
  id: string
  cron_name: string
  event: 'ok' | 'stale_observed' | 'recovered' | 'error'
  detail: string | null
  observed_at: string
}

export const cronHealthApi = {
  status: () => request<{ crons: CronStatus[] }>('/admin/cron-health/status'),

  listLog: (params?: {
    cron_name?: string
    event?: string
    limit?: number
    offset?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.cron_name) qs.set('cron_name', params.cron_name)
    if (params?.event) qs.set('event', params.event)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return request<{
      items: CronHealthLogEntry[]
      limit: number
      offset: number
    }>(`/admin/cron-health/log${q ? `?${q}` : ''}`)
  },

  trigger: (name: string) =>
    request<{
      cron_name: string
      triggered_at: string
      summary: { processed: number; paused: number }
    }>(`/admin/cron-health/trigger/${name}`, { method: 'POST' }),
}

// ════════════════════════════════════════════════════════════
// Campaign extension
// ════════════════════════════════════════════════════════════

export const campaignExtendApi = {
  /**
   * Kampanyaya ek impression satın alır. Süre değişmez; fiyat kampanyanın
   * kilitli tier CPM'inden (`unit_price_cents`) kullanılır. Yeni süre lazımsa
   * brand "Yeni Kampanya" ile o anki tier fiyatından fresh paket açar.
   */
  extend: (
    campaignId: string,
    extra_impressions: number,
    description?: string,
  ) =>
    request<{
      campaign_id: string
      ends_at: string
      new_target_impressions: number
      new_total_budget_cents: number
      extra_cost_cents: number
      balance_after_cents: number
      resumed_from_cap_reached: boolean
    }>(`/admin/ads/campaigns/${campaignId}/extend`, {
      method: 'POST',
      body: JSON.stringify({ extra_impressions, description }),
    }),
}
