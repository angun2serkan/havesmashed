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

type Props = NativeStackScreenProps<AuthStackParamList, 'Nickname'>;

const NICKNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export const NicknameScreen: React.FC<Props> = () => {
  const { setNickname: storeSetNickname } = useAuthStore();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValid = NICKNAME_REGEX.test(nickname);
  const lengthValid = nickname.length >= 3 && nickname.length <= 20;
  const charsValid = nickname.length > 0 && /^[a-zA-Z0-9_]+$/.test(nickname);

  const handleSubmit = async () => {
    if (!isValid) return;

    setLoading(true);
    setError('');

    try {
      const data = await api.setNickname(nickname);

      storeSetNickname(data.nickname, data.token);

      Toast.show({
        type: 'success',
        text1: 'Welcome!',
        text2: `Your nickname is ${data.nickname}`,
        visibilityTime: 2000,
      });
      // Auth state change will trigger navigation to main app
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to set nickname. Please try again.';
      setError(message);
      Toast.show({
        type: 'error',
        text1: 'Error',
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
            <Text style={styles.appSubtitle}>Almost there!</Text>
          </View>

          <Card style={styles.card}>
            <View style={styles.content}>
              <Text style={styles.sectionTitle}>Choose a Nickname</Text>
              <Text style={styles.sectionSubtitle}>
                Pick a unique nickname for your profile. This is how others will
                see you.
              </Text>

              <Input
                label="Nickname"
                value={nickname}
                onChangeText={(text) => {
                  setNickname(text);
                  setError('');
                }}
                placeholder="your_nickname"
                maxLength={20}
                error={error || undefined}
              />

              <View style={styles.rules}>
                <Text
                  style={[
                    styles.ruleText,
                    lengthValid && styles.ruleValid,
                  ]}
                >
                  3-20 characters
                </Text>
                <Text
                  style={[
                    styles.ruleText,
                    charsValid && styles.ruleValid,
                  ]}
                >
                  Letters, numbers, and underscores only
                </Text>
              </View>

              <View style={styles.charCount}>
                <Text style={styles.charCountText}>
                  {nickname.length}/20
                </Text>
              </View>

              <Button
                title={loading ? 'Setting nickname...' : 'Set Nickname'}
                onPress={handleSubmit}
                disabled={!isValid || loading}
                loading={loading}
                size="lg"
                fullWidth
              />
            </View>
          </Card>
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
  content: {
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
  rules: {
    gap: spacing.xs,
  },
  ruleText: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
  },
  ruleValid: {
    color: '#00ff88',
  },
  charCount: {
    alignItems: 'flex-end',
  },
  charCountText: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
  },
});
