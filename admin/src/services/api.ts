import { useAdminStore } from '@/stores/adminStore'

const API_BASE = '/api'

// ── Auth-aware fetch wrapper ──────────────────────────────────
//
// Auth strategy:
//   1. If `accessToken` is set → `Authorization: Bearer <token>`
//   2. Else if `apiKey` is set → `X-Admin-Key: <key>` (legacy)
//   3. Else → no auth headers (login endpoints)
//
// On 401, we try refresh once. If refresh also 401's, we clear auth
// state and let the auth guard navigate back to /login.

let isRefreshing = false
let refreshQueue: Array<() => void> = []

async function attemptRefresh(): Promise<boolean> {
  const refresh = useAdminStore.getState().refreshToken
  if (!refresh) return false

  // Coalesce concurrent refresh attempts so we only call /refresh once
  if (isRefreshing) {
    await new Promise<void>((resolve) => refreshQueue.push(resolve))
    return useAdminStore.getState().accessToken !== null
  }
  isRefreshing = true

  try {
    const res = await fetch(`${API_BASE}/admin/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      useAdminStore.getState().logout()
      return false
    }
    const { access_token, refresh_token } = json.data
    useAdminStore.getState().setTokens(access_token, refresh_token)
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
    const { accessToken, apiKey, impersonatingBrandId } = useAdminStore.getState()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
    else if (apiKey) headers['X-Admin-Key'] = apiKey
    // Env-super impersonation: backend her request'te header'dan okur,
    // state tutmaz. brand_admin JWT'sinde impersonation yok — header
    // gelse bile context'i etkilemez.
    if (apiKey && impersonatingBrandId)
      headers['X-Impersonate-Brand'] = impersonatingBrandId
    return fetch(`${API_BASE}${path}`, { ...options, headers })
  }

  let res = await doFetch()

  // Auto-refresh on 401, then retry once.
  if (res.status === 401 && useAdminStore.getState().refreshToken) {
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

export type LoginResponse =
  | {
      auth_method: 'api_key'
      must_change_password: false
      user: {
        id: null
        display_name: string
        role: 'super_admin'
        brand_id: null
      }
    }
  | {
      auth_method: 'jwt'
      access_token: string
      refresh_token: string
      must_change_password: boolean
      user: {
        id: string
        display_name: string
        role: 'brand_admin'
        brand_id: string
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
      auth_method: 'jwt' | 'api_key'
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
  max_concurrent: number | null
  monthly_impression_cap: number | null
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
      max_concurrent?: number | null
      monthly_impression_cap?: number | null
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
  createBadge: (data: { name: string; description: string; icon: string; category: string; threshold: number; image_url?: string; gender?: string }) =>
    request<{ id: number }>('/admin/badges', { method: 'POST', body: JSON.stringify(data) }),
  updateBadge: (id: number, data: Record<string, unknown>) =>
    request<{ id: number }>(`/admin/badges/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBadge: (id: number) =>
    request<null>(`/admin/badges/${id}`, { method: 'DELETE' }),
  uploadBadgeImage: async (file: File): Promise<{ url: string }> => {
    const { accessToken, apiKey } = useAdminStore.getState()
    const formData = new FormData();
    formData.append('file', file);
    const headers: Record<string, string> = {}
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
    else if (apiKey) headers['X-Admin-Key'] = apiKey

    const res = await fetch(`${API_BASE}/admin/badges/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? 'Upload failed');
    return json.data as { url: string };
  },
  setBadgeSponsor: (id: number, data: { sponsor_name: string; sponsor_click_url: string; sponsor_logo_url: string }) =>
    request<{ id: number; name: string; is_sponsored: boolean; sponsor_name: string; sponsor_click_url: string; sponsor_logo_url: string }>(
      `/admin/badges/${id}/sponsor`,
      { method: 'PUT', body: JSON.stringify(data) },
    ),
  clearBadgeSponsor: (id: number) =>
    request<{ badge_id: number; is_sponsored: false }>(
      `/admin/badges/${id}/sponsor`,
      { method: 'DELETE' },
    ),
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
    const { accessToken, apiKey } = useAdminStore.getState()
    const formData = new FormData()
    formData.append('file', file)
    const headers: Record<string, string> = {}
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
    else if (apiKey) headers['X-Admin-Key'] = apiKey
    const res = await fetch('/api/admin/ads/upload-creative', {
      method: 'POST',
      headers,
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
  daily_cap: number | null
  weight: number
  status: CampaignStatus
  is_active: boolean
  is_dry_run: boolean
  deleted_at: string | null
  pricing_model: 'cpm' | 'cpc' | 'flat' | null
  unit_price_cents: number | null
  total_budget_cents: number | null
  spent_cents: number
  progress_percent: number | null
  paused_reason: string | null
  created_at: string
  updated_at: string | null
  impressions_total: number
  clicks_total: number
}

export type BadgeSpec = {
  name: string
  description: string
  icon: string
  category: 'dates' | 'explore' | 'social' | 'quality'
  threshold: number
  image_url?: string | null
  gender?: 'male' | 'female' | 'both' | null
}

export type CampaignCreateInput = {
  brand_id?: string | null
  placement_key: string
  creative: CampaignCreative
  click_url: string
  target_segment?: TargetSegment | null
  starts_at: string
  ends_at: string
  daily_cap?: number | null
  weight?: number
  is_dry_run?: boolean
  pricing_model?: 'cpm' | 'cpc' | 'flat' | null
  unit_price_cents?: number | null
  total_budget_cents?: number | null
  /** placement_key='badge_sponsor' için zorunlu. Brand kendi badge'ini tasarlar. */
  badge_spec?: BadgeSpec
}

export type CampaignUpdateInput = Partial<{
  creative: CampaignCreative
  click_url: string
  target_segment: TargetSegment | null
  starts_at: string
  ends_at: string
  daily_cap: number | null
  weight: number
  is_dry_run: boolean
  pricing_model: 'cpm' | 'cpc' | 'flat' | null
  unit_price_cents: number | null
  total_budget_cents: number | null
}>

export type AffiliateLink = {
  id: string
  slug: string
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
  target_url: string
  utm_campaign?: string | null
  notes?: string | null
}

export type AffiliateUpdateInput = Partial<{
  target_url: string
  utm_campaign: string | null
  notes: string | null
  is_active: boolean
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
    daily_cap: number | null
    daily_cap_used_pct: number | null
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
