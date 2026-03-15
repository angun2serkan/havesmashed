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
  getCities: () => request<Array<{ id: number; name: string; country_code: string; latitude: number; longitude: number; population: number | null }>>('/admin/cities'),
  createCity: (data: { name: string; country_code: string; latitude: number; longitude: number; population?: number }) =>
    request<{ id: number }>('/admin/cities', { method: 'POST', body: JSON.stringify(data) }),
  updateCity: (id: number, data: Record<string, unknown>) =>
    request<{ id: number }>(`/admin/cities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCity: (id: number) =>
    request<null>(`/admin/cities/${id}`, { method: 'DELETE' }),

  // Badges
  getBadges: () => request<Array<{ id: number; name: string; description: string; icon: string; category: string; threshold: number; image_url: string | null }>>('/admin/badges'),
  createBadge: (data: { name: string; description: string; icon: string; category: string; threshold: number; image_url?: string }) =>
    request<{ id: number }>('/admin/badges', { method: 'POST', body: JSON.stringify(data) }),
  updateBadge: (id: number, data: Record<string, unknown>) =>
    request<{ id: number }>(`/admin/badges/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBadge: (id: number) =>
    request<null>(`/admin/badges/${id}`, { method: 'DELETE' }),

  // Notifications
  sendNotification: (data: { user_id?: string; title: string; message: string }) =>
    request<{ id: string }>('/admin/notifications', { method: 'POST', body: JSON.stringify(data) }),
  getNotifications: () => request<Array<{ id: string; user_id: string | null; title: string; message: string; created_at: string }>>('/admin/notifications'),

  // Users
  getUsers: () => request<Array<{ id: string; nickname: string | null; date_count: number; friend_count: number; created_at: string; last_seen_at: string | null; is_active: boolean }>>('/admin/users'),
}
