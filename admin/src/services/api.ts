import { useAdminStore } from '@/stores/adminStore'

const API_BASE = '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiKey = useAdminStore.getState().apiKey;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (apiKey) headers['X-Admin-Key'] = apiKey;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Unknown error');
  return json.data as T;
}

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
    return request<Array<{ id: number; name: string; description: string; icon: string; category: string; threshold: number; image_url: string | null; gender: 'male' | 'female' | 'both' }>>(`/admin/badges${params}`);
  },
  createBadge: (data: { name: string; description: string; icon: string; category: string; threshold: number; image_url?: string; gender?: string }) =>
    request<{ id: number }>('/admin/badges', { method: 'POST', body: JSON.stringify(data) }),
  updateBadge: (id: number, data: Record<string, unknown>) =>
    request<{ id: number }>(`/admin/badges/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBadge: (id: number) =>
    request<null>(`/admin/badges/${id}`, { method: 'DELETE' }),
  uploadBadgeImage: async (file: File): Promise<{ url: string }> => {
    const apiKey = useAdminStore.getState().apiKey;
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/admin/badges/upload`, {
      method: 'POST',
      headers: {
        ...(apiKey ? { 'X-Admin-Key': apiKey } : {}),
      },
      body: formData,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? 'Upload failed');
    return json.data as { url: string };
  },

  // Notifications
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
}
