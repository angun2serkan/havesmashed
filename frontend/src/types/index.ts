export interface User {
  id: string;
  nickname: string | null;
  createdAt: string;
  lastSeenAt?: string;
  inviteCount: number;
  isActive: boolean;
}

export interface DateEntry {
  id: string;
  countryCode: string;
  cityId: number;
  gender: "male" | "female" | "other";
  ageRange: string;
  description: string | null;
  rating: number; // 1-10
  dateAt: string;
  tagIds: number[];
  createdAt: string;
  updatedAt?: string;
}

export interface Tag {
  id: number;
  name: string;
  category: "meeting" | "venue" | "activity" | "physical_male" | "physical_female";
  isPredefined: boolean;
}

export interface City {
  id: number;
  name: string;
  countryCode: string;
  longitude: number;
  latitude: number;
  population?: number;
}

export interface Stats {
  totalDates: number;
  uniqueCountries: number;
  uniqueCities: number;
  averageRating: number | null;
}

export interface Connection {
  id: string;
  requesterId: string;
  responderId: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export interface InviteResponse {
  inviteId: string;
  inviteType: "platform" | "friend";
  link: string;
  expiresInSecs: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error: string | null;
}

export interface CountryFeature {
  type: "Feature";
  properties: {
    ISO_A2: string;
    ADMIN: string;
    dateCount?: number;
  };
  geometry: GeoJSON.Geometry;
}
