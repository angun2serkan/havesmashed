import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SplashScreen from "expo-splash-screen";
import { useAuthStore } from "../stores/authStore";
import { colors } from "../constants/colors";
import AuthStack from "./AuthStack";
import MainTabNavigator from "./MainTabNavigator";
import { NicknameScreen } from "../screens/auth/NicknameScreen";
import type { RootStackParamList } from "./types";

// Keep the splash screen visible while we determine auth state.
SplashScreen.preventAutoHideAsync();

// ─── Root Stack ─────────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, user } = useAuthStore();
  const [isReady, setIsReady] = useState(false);

  // Zustand persist rehydrates asynchronously. We wait one tick so the
  // persisted auth state is available before we render navigators.
  useEffect(() => {
    const prepare = async () => {
      // Give zustand/persist time to rehydrate from AsyncStorage.
      // The useAuthStore persist middleware fires synchronously after the
      // first subscription, but the actual AsyncStorage read is async.
      // A small delay ensures the store is populated.
      await new Promise((resolve) => setTimeout(resolve, 100));
      setIsReady(true);
    };

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (isReady) {
      await SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    // Return null while splash screen is still visible.
    return null;
  }

  const hasNickname = Boolean(user?.nickname);

  return (
    <View style={styles.root} onLayout={onLayoutRootView}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background.primary },
          animation: "fade",
          animationDuration: 300,
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : !hasNickname ? (
          <Stack.Screen name="Nickname" component={NicknameScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainTabNavigator} />
        )}
      </Stack.Navigator>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
});
