import { useAuthStore } from "@/stores/authStore";
import type {
  ApiResponse,
  Badge,
  City,
  CityInsights,
  Connection,
  DateEntry,
  ForumComment,
  ForumTopic,
  FriendDate,
  FriendStats,
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
    heightRange: d.height_range ?? null,
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
    currentStreak: s.current_streak ?? 0,
    longestStreak: s.longest_streak ?? 0,
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
    height_range?: string;
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
    height_range: string;
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

  getCityInsights: async (cityId: number): Promise<CityInsights> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/cities/${cityId}/insights`);
    return {
      totalDates: raw.total_dates,
      avgRating: raw.avg_rating,
      genderBreakdown: {
        femaleCount: raw.gender_breakdown.female_count,
        maleCount: raw.gender_breakdown.male_count,
        otherCount: raw.gender_breakdown.other_count,
        avgRatingFemale: raw.gender_breakdown.avg_rating_female,
        avgRatingMale: raw.gender_breakdown.avg_rating_male,
        avgFaceFemale: raw.gender_breakdown.avg_face_female,
        avgBodyFemale: raw.gender_breakdown.avg_body_female,
        avgChatFemale: raw.gender_breakdown.avg_chat_female,
        avgFaceMale: raw.gender_breakdown.avg_face_male,
        avgBodyMale: raw.gender_breakdown.avg_body_male,
        avgChatMale: raw.gender_breakdown.avg_chat_male,
      },
      avgFace: raw.avg_face,
      avgBody: raw.avg_body,
      avgChat: raw.avg_chat,
      heightDistribution: raw.height_distribution ?? [],
      topActivities: raw.top_activities ?? [],
      topVenues: raw.top_venues ?? [],
      topMeetings: raw.top_meetings ?? [],
      monthlyTrend: raw.monthly_trend ?? [],
    };
  },

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
      topBadgeIcon: c.top_badge_icon ?? null,
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

  getFriendDates: async (friendId?: string): Promise<FriendDate[]> => {
    const qs = friendId ? `?friend_id=${friendId}` : "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any[]>(`/friends/dates${qs}`);
    return raw.map((d) => ({
      id: d.id,
      countryCode: d.country_code,
      cityName: d.city_name ?? null,
      cityId: d.city_id,
      color: d.color,
      friendNickname: d.friend_nickname ?? null,
      friendId: d.friend_id,
      longitude: d.longitude,
      latitude: d.latitude,
      dateAt: d.date_at,
      gender: d.gender,
      ageRange: d.age_range,
      heightRange: d.height_range ?? null,
      personNickname: d.person_nickname ?? null,
      description: d.description ?? null,
      rating: d.rating,
      faceRating: d.face_rating ?? null,
      bodyRating: d.body_rating ?? null,
      chatRating: d.chat_rating ?? null,
      tagIds: d.tag_ids ?? [],
    }));
  },

  getFriendStats: async (friendId: string): Promise<FriendStats> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/friends/${friendId}/stats`);
    return {
      totalDates: raw.total_dates,
      uniqueCountries: raw.unique_countries,
      uniqueCities: raw.unique_cities,
      averageRating: raw.average_rating ?? null,
      averageFaceRating: raw.average_face_rating ?? null,
      averageBodyRating: raw.average_body_rating ?? null,
      averageChatRating: raw.average_chat_rating ?? null,
      badges: (raw.badges ?? []).map((b: any) => ({
        id: b.id, name: b.name, icon: b.icon, category: b.category, gender: b.gender,
      })),
      topBadgeIcon: raw.top_badge_icon ?? null,
    };
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
      gender: b.gender ?? "both",
      tier: b.tier ?? "bronze",
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
      gender: b.gender ?? "both",
      tier: b.tier ?? "bronze",
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

  // Forum
  getForumTopics: async (params?: { category?: string; sort?: string; cursor?: string; limit?: number }): Promise<{ topics: ForumTopic[]; next_cursor?: string }> => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.limit) qs.set("limit", String(params.limit));
    const qstr = qs.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/forum/topics${qstr ? `?${qstr}` : ""}`);
    return {
      topics: (raw.topics ?? raw).map((t: any) => ({
        id: t.id,
        title: t.title,
        bodyPreview: t.body_preview ?? t.body?.substring(0, 200) ?? "",
        body: t.body ?? "",
        category: t.category,
        isAnonymous: t.is_anonymous,
        isPinned: t.is_pinned,
        isLocked: t.is_locked,
        likeCount: t.like_count,
        commentCount: t.comment_count,
        authorNickname: t.author_nickname ?? null,
        topBadgeIcon: t.top_badge_icon ?? null,
        liked: t.liked ?? false,
        createdAt: t.created_at,
      })),
      next_cursor: raw.next_cursor,
    };
  },

  getForumTopic: async (id: string): Promise<{ topic: ForumTopic; comments: ForumComment[] }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/forum/topics/${id}`);
    return {
      topic: {
        id: raw.topic.id,
        title: raw.topic.title,
        bodyPreview: "",
        body: raw.topic.body,
        category: raw.topic.category,
        isAnonymous: raw.topic.is_anonymous,
        isPinned: raw.topic.is_pinned,
        isLocked: raw.topic.is_locked,
        likeCount: raw.topic.like_count,
        commentCount: raw.topic.comment_count,
        authorNickname: raw.topic.author_nickname ?? null,
        topBadgeIcon: raw.topic.top_badge_icon ?? null,
        liked: raw.topic.liked ?? false,
        createdAt: raw.topic.created_at,
      },
      comments: (raw.comments ?? []).map((c: any) => ({
        id: c.id,
        topicId: c.topic_id,
        parentId: c.parent_id ?? null,
        body: c.body,
        depth: c.depth,
        likeCount: c.like_count,
        authorNickname: c.author_nickname ?? "Anonim",
        topBadgeIcon: c.top_badge_icon ?? null,
        liked: c.liked ?? false,
        createdAt: c.created_at,
        updatedAt: c.updated_at ?? null,
        deleted: c.deleted ?? false,
      })),
    };
  },

  createForumTopic: (data: { title: string; body: string; category: string; is_anonymous?: boolean }) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request<any>("/forum/topics", { method: "POST", body: JSON.stringify(data) }),

  createForumComment: (topicId: string, data: { body: string; parent_id?: string }) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request<any>(`/forum/topics/${topicId}/comments`, { method: "POST", body: JSON.stringify(data) }),

  toggleForumLike: (data: { target_type: "topic" | "comment"; target_id: string }) =>
    request<{ like_count: number; liked: boolean }>("/forum/like", { method: "POST", body: JSON.stringify(data) }),

  deleteForumTopic: (id: string) => request<void>(`/forum/topics/${id}`, { method: "DELETE" }),

  updateForumTopic: (id: string, data: { title?: string; body?: string }) =>
    request<void>(`/forum/topics/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteForumComment: (id: string) => request<void>(`/forum/comments/${id}`, { method: "DELETE" }),

  reportForumContent: (data: { target_type: "topic" | "comment"; target_id: string; reason: string; description?: string }) =>
    request<{ message: string }>("/forum/report", { method: "POST", body: JSON.stringify(data) }),

  getForumBanStatus: async (): Promise<{ isBanned: boolean; bannedUntil: string | null }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>("/forum/ban-status");
    return { isBanned: raw.is_banned, bannedUntil: raw.banned_until ?? null };
  },

  // Privacy
  getPrivacy: async (): Promise<{
    shareCountries: boolean;
    shareCities: boolean;
    shareDates: boolean;
    shareStats: boolean;
  }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>("/privacy");
    return {
      shareCountries: raw.share_countries ?? true,
      shareCities: raw.share_cities ?? false,
      shareDates: raw.share_dates ?? false,
      shareStats: raw.share_stats ?? true,
    };
  },

  updatePrivacy: (data: {
    share_countries?: boolean;
    share_cities?: boolean;
    share_dates?: boolean;
    share_stats?: boolean;
  }) =>
    request<{
      share_countries: boolean;
      share_cities: boolean;
      share_dates: boolean;
      share_stats: boolean;
    }>("/privacy", { method: "PUT", body: JSON.stringify(data) }),
};
