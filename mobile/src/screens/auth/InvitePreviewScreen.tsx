import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { colors } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

type AuthStackParamList = {
  Login: undefined;
  Register: { inviteToken?: string } | undefined;
  Nickname: undefined;
  InvitePreview: { inviteToken: string };
};

type Props = NativeStackScreenProps<AuthStackParamList, 'InvitePreview'>;

export const InvitePreviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const { inviteToken } = route.params;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <Text style={styles.appTitle}>havesmashed</Text>
          <Text style={styles.appSubtitle}>Your dating journal</Text>
        </View>

        <Card style={styles.card}>
          <View style={styles.content}>
            <Text style={styles.inviteEmoji}>&#127881;</Text>
            <Text style={styles.sectionTitle}>You're Invited!</Text>
            <Text style={styles.sectionSubtitle}>
              Someone invited you to join havesmashed -- the anonymous dating
              journal where you can track your dating experiences, discover
              insights, and connect with friends.
            </Text>

            <View style={styles.featureList}>
              <FeatureItem
                emoji="&#128205;"
                title="Track Dates"
                description="Log your dating experiences across cities and countries"
              />
              <FeatureItem
                emoji="&#128202;"
                title="Get Insights"
                description="See your dating stats, patterns, and city-level analytics"
              />
              <FeatureItem
                emoji="&#129309;"
                title="Connect"
                description="Add friends and compare dating adventures"
              />
              <FeatureItem
                emoji="&#128274;"
                title="Fully Anonymous"
                description="No email, no phone -- just a 12-word recovery phrase"
              />
            </View>

            <View style={styles.tokenContainer}>
              <Text style={styles.tokenLabel}>Your invite code</Text>
              <View style={styles.tokenBox}>
                <Text style={styles.tokenText} numberOfLines={1}>
                  {inviteToken}
                </Text>
              </View>
            </View>

            <Button
              title="Register with this Invite"
              onPress={() =>
                navigation.navigate('Register', { inviteToken })
              }
              size="lg"
              fullWidth
            />
          </View>
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
    </SafeAreaView>
  );
};

interface FeatureItemProps {
  emoji: string;
  title: string;
  description: string;
}

const FeatureItem: React.FC<FeatureItemProps> = ({ emoji, title, description }) => (
  <View style={styles.featureItem}>
    <Text style={styles.featureEmoji}>{emoji}</Text>
    <View style={styles.featureTextContainer}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDescription}>{description}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0f',
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
    gap: spacing.lg,
    alignItems: 'center',
  },
  inviteEmoji: {
    fontSize: 48,
  },
  sectionTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: fontSize.md,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  featureList: {
    width: '100%',
    gap: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  featureEmoji: {
    fontSize: 24,
    marginTop: 2,
  },
  featureTextContainer: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text.primary,
  },
  featureDescription: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  tokenContainer: {
    width: '100%',
    gap: spacing.xs,
  },
  tokenLabel: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tokenBox: {
    backgroundColor: '#0a0a0f',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  tokenText: {
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
    color: '#ff007f',
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
