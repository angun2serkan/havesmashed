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
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SeedPhraseDisplay } from '../../components/auth/SeedPhraseDisplay';
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

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

type Step = 'invite' | 'display';

export const RegisterScreen: React.FC<Props> = ({ navigation, route }) => {
  const { setAuth } = useAuthStore();
  const initialToken = route.params?.inviteToken ?? '';

  const [step, setStep] = useState<Step>('invite');
  const [inviteToken, setInviteToken] = useState(initialToken);
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [registrationData, setRegistrationData] = useState<{
    userId: string;
    token: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    const trimmedToken = inviteToken.trim();
    if (!trimmedToken) {
      setError('An invite token is required to register.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await api.register(trimmedToken);

      const words = data.secret_phrase.split(' ');
      setSeedWords(words);
      setRegistrationData({
        userId: data.user_id,
        token: data.token,
      });
      setStep('display');

      Toast.show({
        type: 'success',
        text1: 'Account created!',
        text2: 'Save your recovery phrase now.',
        visibilityTime: 3000,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Registration failed. Please try again.';
      setError(message);
      Toast.show({
        type: 'error',
        text1: 'Registration failed',
        text2: message,
        visibilityTime: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!registrationData) return;

    setAuth(
      {
        id: registrationData.userId,
        nickname: null,
        createdAt: new Date().toISOString(),
        inviteCount: 0,
        isActive: true,
      },
      registrationData.token,
    );

    navigation.replace('Nickname');
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
            <Text style={styles.appSubtitle}>Create your anonymous account</Text>
          </View>

          <Card style={styles.card}>
            {step === 'invite' && (
              <View style={styles.inviteContainer}>
                <Text style={styles.sectionTitle}>Anonymous Registration</Text>
                <Text style={styles.sectionSubtitle}>
                  No email, no password. We'll generate a 12-word recovery
                  phrase that acts as your identity.
                </Text>

                <Input
                  label="Invite Token"
                  value={inviteToken}
                  onChangeText={(text) => {
                    setInviteToken(text);
                    setError('');
                  }}
                  placeholder="Enter your invite token"
                  error={error || undefined}
                />

                <Button
                  title={loading ? 'Creating Account...' : 'Register'}
                  onPress={handleRegister}
                  loading={loading}
                  disabled={!inviteToken.trim() || loading}
                  size="lg"
                  fullWidth
                />
              </View>
            )}

            {step === 'display' && (
              <SeedPhraseDisplay
                words={seedWords}
                onContinue={handleContinue}
              />
            )}
          </Card>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Text
              style={styles.footerLink}
              onPress={() => navigation.navigate('Login')}
            >
              Sign In
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
    padding: spacing.lg,
  },
  inviteContainer: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.sm,
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
