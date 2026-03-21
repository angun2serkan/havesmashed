import React from "react";
import { Platform, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  Globe,
  BarChart3,
  Users,
  MessageCircle,
  User,
} from "lucide-react-native";
import { colors } from "../constants/colors";
import { layout } from "../constants/layout";
import type {
  MainTabParamList,
  DashboardStackParamList,
  FriendsStackParamList,
  ForumStackParamList,
  ProfileStackParamList,
} from "./types";

// ─── Shared stack screen options ────────────────────────────────────────────

const sharedStackScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.background.primary },
  animation: "slide_from_right" as const,
} as const;

const modalScreenOptions = {
  ...sharedStackScreenOptions,
  presentation: "modal" as const,
  animation: "slide_from_bottom" as const,
} as const;

// ─── Screen Imports ─────────────────────────────────────────────────────────

import { HomeScreen } from "../screens/home/HomeScreen";
import { DashboardScreen } from "../screens/dashboard/DashboardScreen";
import { FriendsScreen } from "../screens/friends/FriendsScreen";
import { FriendProfileScreen } from "../screens/friends/FriendProfileScreen";
import ForumScreen from "../screens/forum/ForumScreen";
import TopicDetailScreen from "../screens/forum/TopicDetailScreen";
import NewTopicScreen from "../screens/forum/NewTopicScreen";
import { SettingsScreen } from "../screens/profile/SettingsScreen";
import { BadgesScreen } from "../screens/profile/BadgesScreen";
import { PrivacyScreen } from "../screens/profile/PrivacyScreen";
import { NotificationsScreen } from "../screens/profile/NotificationsScreen";
import { WrappedScreen } from "../screens/profile/WrappedScreen";

// DateDetailModal is handled within DashboardScreen itself
const DateDetailModalScreen = DashboardScreen;

// ─── Dashboard Stack ────────────────────────────────────────────────────────

const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();

function DashboardStackNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={sharedStackScreenOptions}>
      <DashboardStack.Screen
        name="DashboardMain"
        component={DashboardScreen}
      />
      <DashboardStack.Screen
        name="DateDetailModal"
        component={DateDetailModalScreen}
        options={modalScreenOptions}
      />
    </DashboardStack.Navigator>
  );
}

// ─── Friends Stack ──────────────────────────────────────────────────────────

const FriendsStack = createNativeStackNavigator<FriendsStackParamList>();

function FriendsStackNavigator() {
  return (
    <FriendsStack.Navigator screenOptions={sharedStackScreenOptions}>
      <FriendsStack.Screen name="FriendsList" component={FriendsScreen} />
      <FriendsStack.Screen
        name="FriendProfile"
        component={FriendProfileScreen}
      />
    </FriendsStack.Navigator>
  );
}

// ─── Forum Stack ────────────────────────────────────────────────────────────

const ForumStack = createNativeStackNavigator<ForumStackParamList>();

function ForumStackNavigator() {
  return (
    <ForumStack.Navigator screenOptions={sharedStackScreenOptions}>
      <ForumStack.Screen name="ForumList" component={ForumScreen} />
      <ForumStack.Screen name="TopicDetail" component={TopicDetailScreen} />
      <ForumStack.Screen
        name="NewTopic"
        component={NewTopicScreen}
        options={modalScreenOptions}
      />
    </ForumStack.Navigator>
  );
}

// ─── Profile Stack ──────────────────────────────────────────────────────────

const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={sharedStackScreenOptions}>
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="Badges" component={BadgesScreen} />
      <ProfileStack.Screen name="Privacy" component={PrivacyScreen} />
      <ProfileStack.Screen
        name="Notifications"
        component={NotificationsScreen}
      />
      <ProfileStack.Screen name="Wrapped" component={WrappedScreen} />
    </ProfileStack.Navigator>
  );
}

// ─── Tab Navigator ──────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICON_SIZE = 22;
const ACTIVE_COLOR = colors.neon.pink;
const INACTIVE_COLOR = colors.text.muted;

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ color }) => (
            <Globe size={TAB_ICON_SIZE} color={color} strokeWidth={1.8} />
          ),
        }}
      />
      <Tab.Screen
        name="Dashboard"
        component={DashboardStackNavigator}
        options={{
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color }) => (
            <BarChart3 size={TAB_ICON_SIZE} color={color} strokeWidth={1.8} />
          ),
        }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsStackNavigator}
        options={{
          tabBarLabel: "Friends",
          tabBarIcon: ({ color }) => (
            <Users size={TAB_ICON_SIZE} color={color} strokeWidth={1.8} />
          ),
        }}
      />
      <Tab.Screen
        name="Forum"
        component={ForumStackNavigator}
        options={{
          tabBarLabel: "Forum",
          tabBarIcon: ({ color }) => (
            <MessageCircle
              size={TAB_ICON_SIZE}
              color={color}
              strokeWidth={1.8}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{
          tabBarLabel: "Profile",
          tabBarIcon: ({ color }) => (
            <User size={TAB_ICON_SIZE} color={color} strokeWidth={1.8} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.background.primary,
    borderTopWidth: 0,
    height: layout.tabBarHeight,
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
    paddingTop: 8,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  tabBarItem: {
    paddingVertical: 4,
  },
});
