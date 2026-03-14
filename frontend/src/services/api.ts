import { useAuthStore } from "@/stores/authStore";
import type {
  ApiResponse,
  Connection,
  DateEntry,
  InviteResponse,
  Stats,
} from "@/types";

const API_BASE = "/api";

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
  register: (inviteId?: string) =>
    request<{ user_id: string; secret_phrase: string; token: string; expires_in: number }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(inviteId ? { invite_id: inviteId } : {}),
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
  createDate: (data: {
    country_code: string;
    city_id: number;
    gender: "male" | "female" | "other";
    age_range: string;
    description?: string;
    rating: number;
    date_at: string;
    tag_ids: number[];
  }) =>
    request<DateEntry>("/dates", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getDates: (cursor?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return request<{ dates: DateEntry[]; next_cursor?: string }>(
      `/dates${qs ? `?${qs}` : ""}`,
    );
  },

  getDate: (id: string) => request<DateEntry>(`/dates/${id}`),

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

  // Stats
  getStats: () => request<Stats>("/stats"),

  // Connections
  getConnections: (status?: string) =>
    request<Connection[]>(
      `/connections${status ? `?status=${status}` : ""}`,
    ),

  respondToConnection: (action: "accept" | "reject") =>
    request<{ status: string }>("/connections/respond", {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  // Invites
  createInvite: (inviteType: "platform" | "friend") =>
    request<InviteResponse>("/invites/create", {
      method: "POST",
      body: JSON.stringify({ invite_type: inviteType }),
    }),

  // Feed
  getFeed: () =>
    request<{ message: string; friends_active_this_week: number }>("/feed"),
};
