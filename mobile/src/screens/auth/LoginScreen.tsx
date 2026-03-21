import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SeedPhraseInput } from '../../components/auth/SeedPhraseInput';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import { colors } from '../../constants/colors';
import { fontSize, spacing } from '../../constants/layout';

type AuthStackParamList = {
  Login: undefined;
  Register: { inviteToken?: string } | undefined;
  Nickname: undefined;
  InvitePreview: { inviteToken: string };
};

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleLogin = async (secretPhrase: string) => {
    setLoading(true);
    setError(undefined);

    try {
      const data = await api.login(secretPhrase);

      setAuth(
        {
          id: data.user_id,
          nickname: data.nickname || null,
          createdAt: new Date().toISOString(),
          inviteCount: 0,
          isActive: true,
        },
        data.token,
      );

      if (!data.nickname) {
        navigation.replace('Nickname');
      }
      // If nickname exists, the auth state change will trigger navigation
      // to the main app via the root navigator
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to sign in. Please check your recovery phrase.';
      setError(message);
      Toast.show({
        type: 'error',
        text1: 'Login failed',
        text2: message,
        visibilityTime: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerContainer}>
            <Text style={styles.appTitle}>havesmashed</Text>
            <Text style={styles.appSubtitle}>Your dating journal</Text>
          </View>

          <View style={styles.card}>
            <SeedPhraseInput
              onSubmit={handleLogin}
              loading={loading}
              error={error}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Don't have an account?{' '}
            </Text>
            <Text
              style={styles.footerLink}
              onPress={() => navigation.navigate('Register')}
            >
              Get an invite
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ff007f',
    textShadowColor: 'rgba(255, 0, 127, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
    marginBottom: spacing.xs,
  },
  appSubtitle: {
    fontSize: fontSize.md,
    color: colors.text.secondary,
  },
  card: {
    backgroundColor: '#12121a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    padding: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
  },
  footerLink: {
    fontSize: fontSize.sm,
    color: '#ff007f',
    fontWeight: '600',
  },
});
