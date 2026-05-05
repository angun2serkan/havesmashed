export interface User {
  id: string;
  nickname: string | null;
  birthday?: string | null;
  createdAt: string;
  lastSeenAt?: string;
  inviteCount: number;
  isActive: boolean;
}

export type EndReason =
  | "distance"
  | "lost_interest"
  | "cheating"
  | "mutual"
  | "incompatibility"
  | "other";

export type HowWeMet =
  | "app"
  | "friends"
  | "work"
  | "school"
  | "family"
  | "random"
  | "other";

export interface Partner {
  id: string;
  name: string;
  birthday: string; // ISO date YYYY-MM-DD
  relationshipStart: string;
  relationshipEnd: string | null;
  satisfactionScore: number | null;
  endReason: EndReason | null;
  howWeMet: HowWeMet | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface PartnerInput {
  name: string;
  birthday: string;
  relationship_start: string;
  relationship_end?: string | null;
  satisfaction_score?: number | null;
  end_reason?: EndReason | null;
  how_we_met?: HowWeMet | null;
  notes?: string | null;
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
  currentStreak: number;
  longestStreak: number;
}

export interface Connection {
  id: string;
  requesterId: string;
  responderId: string;
  friendNickname: string | null;
  topBadgeIcon: string | null;
  color: string; // hex like "#FF5733"
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export interface FriendDate {
  id: string;
  countryCode: string;
  cityName: string | null;
  cityId: number;
  color: string;
  friendNickname: string | null;
  friendId: string;
  longitude: number;
  latitude: number;
  dateAt: string;
  gender: string;
  ageRange: string;
  heightRange: string | null;
  personNickname: string | null;
  description: string | null;
  rating: number;
  faceRating: number | null;
  bodyRating: number | null;
  chatRating: number | null;
  tagIds: number[];
}

export interface FriendStats {
  totalDates: number;
  uniqueCountries: number;
  uniqueCities: number;
  averageRating: number | null;
  averageFaceRating: number | null;
  averageBodyRating: number | null;
  averageChatRating: number | null;
  badges: Array<{ id: number; name: string; icon: string; category: string; gender: string }>;
  topBadgeIcon: string | null;
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
  tier: "bronze" | "silver" | "gold";
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

export interface CityInsights {
  totalDates: number;
  avgRating: number | null;
  genderBreakdown: {
    femaleCount: number;
    maleCount: number;
    otherCount: number;
    avgRatingFemale: number | null;
    avgRatingMale: number | null;
    avgFaceFemale: number | null;
    avgBodyFemale: number | null;
    avgChatFemale: number | null;
    avgFaceMale: number | null;
    avgBodyMale: number | null;
    avgChatMale: number | null;
  };
  avgFace: number | null;
  avgBody: number | null;
  avgChat: number | null;
  heightDistribution: Array<{ range: string; count: number }>;
  topActivities: Array<{ name: string; count: number }>;
  topVenues: Array<{ name: string; count: number }>;
  topMeetings: Array<{ name: string; count: number }>;
  monthlyTrend: Array<{ month: string; count: number }>;
}

export interface ForumTopic {
  id: string;
  title: string;
  bodyPreview: string;
  body: string;
  category: string;
  isAnonymous: boolean;
  isPinned: boolean;
  isLocked: boolean;
  likeCount: number;
  commentCount: number;
  authorNickname: string | null;
  topBadgeIcon: string | null;
  liked: boolean;
  createdAt: string;
}

export interface ForumComment {
  id: string;
  topicId: string;
  parentId: string | null;
  body: string;
  depth: number;
  likeCount: number;
  authorNickname: string;
  topBadgeIcon: string | null;
  liked: boolean;
  createdAt: string;
  updatedAt: string | null;
  deleted: boolean;
}
