import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../constants/colors";
import type { AuthStackParamList } from "./types";

import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";
import { InvitePreviewScreen } from "../screens/auth/InvitePreviewScreen";

// ─── Stack ──────────────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background.primary },
        animation: "slide_from_right",
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen
        name="InvitePreview"
        component={InvitePreviewScreen}
        options={{ animation: "slide_from_bottom" }}
      />
    </Stack.Navigator>
  );
}
