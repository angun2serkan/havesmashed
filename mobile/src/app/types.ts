import type { NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";

// ─── Auth Stack ──────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined;
  Register: { inviteToken?: string };
  InvitePreview: { inviteToken: string };
};

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

// ─── Friends Stack ───────────────────────────────────────────────────────────

export type FriendsStackParamList = {
  FriendsList: undefined;
  FriendProfile: { friendId: string; nickname: string | null };
};

export type FriendsStackScreenProps<T extends keyof FriendsStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<FriendsStackParamList, T>,
    BottomTabScreenProps<MainTabParamList>
  >;

// ─── Forum Stack ─────────────────────────────────────────────────────────────

export type ForumStackParamList = {
  ForumList: undefined;
  TopicDetail: { topicId: string; title: string };
  NewTopic: undefined;
};

export type ForumStackScreenProps<T extends keyof ForumStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<ForumStackParamList, T>,
    BottomTabScreenProps<MainTabParamList>
  >;

// ─── Profile Stack ──────────────────────────────────────────────────────────

export type ProfileStackParamList = {
  Settings: undefined;
  Badges: undefined;
  Privacy: undefined;
  Notifications: undefined;
  Wrapped: undefined;
};

export type ProfileStackScreenProps<T extends keyof ProfileStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<ProfileStackParamList, T>,
    BottomTabScreenProps<MainTabParamList>
  >;

// ─── Dashboard Stack ────────────────────────────────────────────────────────

export type DashboardStackParamList = {
  DashboardMain: undefined;
  DateDetailModal: { dateId: string };
};

export type DashboardStackScreenProps<
  T extends keyof DashboardStackParamList,
> = CompositeScreenProps<
  NativeStackScreenProps<DashboardStackParamList, T>,
  BottomTabScreenProps<MainTabParamList>
>;

// ─── Main Tab Navigator ─────────────────────────────────────────────────────

export type MainTabParamList = {
  Home: undefined;
  Dashboard: NavigatorScreenParams<DashboardStackParamList>;
  Friends: NavigatorScreenParams<FriendsStackParamList>;
  Forum: NavigatorScreenParams<ForumStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
};

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;

// ─── Root Stack ─────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Nickname: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

// ─── Global type augmentation ───────────────────────────────────────────────

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
