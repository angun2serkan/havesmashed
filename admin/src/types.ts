export interface City {
  id: number;
  name: string;
  countryCode: string;
  longitude: number;
  latitude: number;
  population: number | null;
}

export interface Badge {
  id: number;
  name: string;
  description: string;
  icon: string;
  category: string;
  threshold: number;
  imageUrl: string | null;
}

export interface UserSummary {
  id: string;
  nickname: string | null;
  dateCount: number;
  friendCount: number;
  createdAt: string;
  lastSeenAt: string | null;
  isActive: boolean;
}

export interface Notification {
  id: string;
  userId: string | null;
  title: string;
  message: string;
  createdAt: string;
}

export interface AdminMetrics {
  totalUsers: number;
  totalDates: number;
  dailyActiveUsers: number;
}
