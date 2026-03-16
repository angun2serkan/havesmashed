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
  cityName: string;
  gender: "male" | "female" | "other";
  ageRange: string;
  heightRange: string | null;
  personNickname: string | null;
  description: string | null;
  rating: number; // 1-10
  faceRating: number | null;
  bodyRating: number | null;
  chatRating: number | null;
  dateAt: string;
  tagIds: number[];
  longitude: number | null;
  latitude: number | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Tag {
  id: number;
  name: string;
  category: "meeting" | "venue" | "activity" | "physical_male" | "physical_female" | "face" | "personality";
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
  averageFaceRating: number | null;
  averageBodyRating: number | null;
  averageChatRating: number | null;
}

export interface Connection {
  id: string;
  requesterId: string;
  responderId: string;
  friendNickname: string | null;
  color: string; // hex like "#FF5733"
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export interface FriendDate {
  id: string;
  countryCode: string;
  cityName: string | null;
  color: string;
  cityId: number;
  friendNickname: string | null;
  longitude: number;
  latitude: number;
  dateAt: string;
}

export interface InviteResponse {
  token: string;
  inviteType: "platform" | "friend";
  link: string;
  expiresInSecs: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error: string | null;
}

export interface Badge {
  id: number;
  name: string;
  description: string;
  icon: string; // emoji
  category: "dates" | "explore" | "social" | "quality";
  threshold: number;
  earned: boolean;
  earnedAt: string | null;
  gender: "male" | "female" | "lgbt" | "both";
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  notificationType: string; // 'system' | 'friend_date' | 'badge'
  createdAt: string;
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
