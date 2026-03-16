import { useAuthStore } from "@/stores/authStore";
import type {
  ApiResponse,
  Badge,
  City,
  Connection,
  DateEntry,
  FriendDate,
  InviteResponse,
  Notification,
  Stats,
} from "@/types";

const API_BASE = "/api";

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDate(d: any): DateEntry {
  return {
    id: d.id,
    countryCode: d.country_code,
    cityId: d.city_id,
    cityName: d.city_name ?? "",
    gender: d.gender,
    ageRange: d.age_range,
    personNickname: d.person_nickname ?? null,
    description: d.description ?? null,
    rating: d.rating,
    faceRating: d.face_rating ?? null,
    bodyRating: d.body_rating ?? null,
    chatRating: d.chat_rating ?? null,
    dateAt: d.date_at,
    tagIds: d.tag_ids ?? [],
    longitude: d.longitude ?? null,
    latitude: d.latitude ?? null,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

function mapStats(s: any): Stats {
  return {
    totalDates: s.total_dates,
    uniqueCountries: s.unique_countries,
    uniqueCities: s.unique_cities,
    averageRating: s.average_rating ?? null,
    averageFaceRating: s.average_face_rating ?? null,
    averageBodyRating: s.average_body_rating ?? null,
    averageChatRating: s.average_chat_rating ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = useAuthStore.getState().token;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error("Session expired");
  }

  const json: ApiResponse<T> = await response.json();

  if (!json.success) {
    throw new Error(json.error ?? "Unknown error");
  }

  return json.data;
}

export const api = {
  // Auth
  register: (inviteToken?: string) =>
    request<{ user_id: string; secret_phrase: string; token: string; expires_in: number }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(inviteToken ? { invite_token: inviteToken } : {}),
      },
    ),

  login: (secretPhrase: string) =>
    request<{ token: string; expires_in: number; user_id: string; nickname: string | null }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ secret_phrase: secretPhrase }),
      },
    ),

  setNickname: (nickname: string) =>
    request<{ nickname: string; token: string; expires_in: number }>(
      "/auth/nickname",
      {
        method: "PUT",
        body: JSON.stringify({ nickname }),
      },
    ),

  deleteAccount: () =>
    request<{ message: string; deletion_date: string }>("/auth/delete-account", {
      method: "POST",
    }),

  // Dates
  createDate: async (data: {
    country_code: string;
    city_id: number;
    gender: "male" | "female" | "other";
    age_range: string;
    person_nickname?: string;
    description?: string;
    rating: number;
    face_rating?: number;
    body_rating?: number;
    chat_rating?: number;
    date_at: string;
    tag_ids: number[];
  }): Promise<{ date: DateEntry; newBadges: string[] }> => {
    const token = useAuthStore.getState().token;
    const response = await fetch(`${API_BASE}/dates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (response.status === 401) {
      useAuthStore.getState().logout();
      throw new Error("Session expired");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await response.json();
    if (!json.success) throw new Error(json.error ?? "Unknown error");

    return {
      date: mapDate(json.data),
      newBadges: json.new_badges ?? [],
    };
  },

  getDates: async (cursor?: string, limit?: number): Promise<{ dates: DateEntry[]; next_cursor?: string }> => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(
      `/dates${qs ? `?${qs}` : ""}`,
    );
    return {
      dates: (raw.dates ?? []).map(mapDate),
      next_cursor: raw.next_cursor,
    };
  },

  getDate: async (id: string): Promise<DateEntry> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/dates/${id}`);
    return mapDate(raw);
  },

  updateDate: (id: string, data: Partial<{
    country_code: string;
    city_id: number;
    gender: "male" | "female" | "other";
    age_range: string;
    description: string;
    rating: number;
    date_at: string;
    tag_ids: number[];
  }>) =>
    request<{ id: string; message: string }>(`/dates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteDate: (id: string) =>
    request<{ id: string; message: string }>(`/dates/${id}`, {
      method: "DELETE",
    }),

  // Cities
  getCities: (countryCode?: string) =>
    request<City[]>(
      `/cities${countryCode ? `?country_code=${countryCode}` : ""}`,
    ),

  // Stats
  getStats: async (): Promise<Stats> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>("/stats");
    return mapStats(raw);
  },

  // Connections
  getConnections: async (status?: string): Promise<Connection[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any[]>(
      `/connections${status ? `?status=${status}` : ""}`,
    );
    return raw.map((c) => ({
      id: c.id,
      requesterId: c.requester_id,
      responderId: c.responder_id,
      friendNickname: c.friend_nickname ?? null,
      color: c.color ?? "#FF5733",
      status: c.status,
      createdAt: c.created_at,
    }));
  },

  respondToConnection: (action: "accept" | "reject") =>
    request<{ status: string }>("/connections/respond", {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  deleteConnection: (id: string) =>
    request<{ id: string; message: string }>(`/connections/${id}`, {
      method: "DELETE",
    }),

  setFriendColor: (connectionId: string, color: string) =>
    request<{ color: string }>(`/connections/${connectionId}/color`, {
      method: "PUT",
      body: JSON.stringify({ color }),
    }),

  getFriendDates: async (): Promise<FriendDate[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any[]>("/friends/dates");
    return raw.map((d) => ({
      id: d.id,
      countryCode: d.country_code,
      cityName: d.city_name ?? null,
      color: d.color,
      cityId: d.city_id,
      friendNickname: d.friend_nickname ?? null,
      longitude: d.longitude,
      latitude: d.latitude,
      dateAt: d.date_at,
    }));
  },

  // Invites
  getInvite: (id: string) =>
    request<{ invite_id: string; invite_type: "platform" | "friend"; inviter_id: string; valid: boolean }>(
      `/invites/${id}`,
    ),

  addFriendByCode: (code: string) =>
    request<{ connection_id: string; status: string }>("/connections/add", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  createInvite: async (inviteType: "platform" | "friend"): Promise<InviteResponse> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>("/invites/create", {
      method: "POST",
      body: JSON.stringify({ invite_type: inviteType }),
    });
    return {
      token: raw.token,
      inviteType: raw.invite_type,
      link: raw.link,
      expiresInSecs: raw.expires_in_secs,
    };
  },

  // Tags
  getTags: (category?: string) =>
    request<Array<{ id: number; name: string; category: string; is_predefined: boolean }>>(
      `/tags${category ? `?category=${category}` : ""}`,
    ),

  createTag: (name: string, category: string) =>
    request<{ id: number; name: string; category: string; is_predefined: boolean }>(
      "/tags",
      { method: "POST", body: JSON.stringify({ name, category }) },
    ),

  // Feed
  getFeed: () =>
    request<{ message: string; friends_active_this_week: number }>("/feed"),

  // Badges
  getMyBadges: async (): Promise<Badge[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any[]>("/badges/me");
    return raw.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      icon: b.icon,
      category: b.category,
      threshold: b.threshold,
      earned: b.earned,
      earnedAt: b.earned_at ?? null,
    }));
  },

  getFriendBadges: async (friendId: string): Promise<Badge[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any[]>(`/badges/friend/${friendId}`);
    return raw.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      icon: b.icon,
      category: b.category,
      threshold: b.threshold,
      earned: b.earned ?? true,
      earnedAt: b.earned_at ?? null,
    }));
  },

  // Notifications
  getNotifications: async (): Promise<Notification[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any[]>("/notifications");
    return raw.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      isRead: n.is_read,
      notificationType: n.notification_type ?? "system",
      createdAt: n.created_at,
    }));
  },

  markNotificationRead: (id: string) =>
    request<void>(`/notifications/${id}/read`, { method: "PUT" }),

  getUnreadCount: async (): Promise<number> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>("/notifications/unread-count");
    return raw.count ?? 0;
  },
};
