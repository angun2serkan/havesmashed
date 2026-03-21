import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, neonGlow } from '../../constants/colors';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
  layout,
} from '../../constants/layout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import type { Badge, Stats } from '../../types';

function fmtRating(val: number | null): string {
  return val !== null ? val.toFixed(1) : '--';
}

interface StatCardData {
  value: string;
  label: string;
  color: string;
  delay: number;
}

const AnimatedStatCard: React.FC<StatCardData & { index: number }> = ({
  value,
  label,
  color,
  delay,
  index,
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 14,
          stiffness: 100,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, scaleAnim, opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.statCard,
        {
          borderColor: `${color}40`,
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <Text
        style={[
          styles.statValue,
          {
            color,
            textShadowColor: `${color}80`,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 12,
          },
        ]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
};

const AnimatedDetailRow: React.FC<{
  emoji: string;
  label: string;
  value: string;
  accent?: string;
  delay: number;
}> = ({ emoji, label, value, accent, delay }) => {
  const slideAnim = useRef(new Animated.Value(30)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, slideAnim, opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.detailRow,
        {
          opacity: opacityAnim,
          transform: [{ translateX: slideAnim }],
        },
      ]}
    >
      <Text style={styles.detailEmoji}>{emoji}</Text>
      <View style={styles.detailTextContainer}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, accent ? { color: accent } : null]}>
          {value}
        </Text>
      </View>
    </Animated.View>
  );
};

export const WrappedScreen: React.FC = () => {
  const navigation = useNavigation();
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<Stats | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, badgesData] = await Promise.all([
        api.getStats(),
        api.getMyBadges(),
      ]);
      setStats(statsData);
      setBadges(badgesData);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  }, []);

  const topBadge = badges
    .filter((b) => b.earned)
    .sort((a, b) => {
      const tierOrder: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };
      return (tierOrder[b.tier] ?? 0) - (tierOrder[a.tier] ?? 0);
    })[0] ?? null;

  const earnedBadgeCount = badges.filter((b) => b.earned).length;

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      // Attempt to use expo-sharing + react-native-view-shot if available
      const ViewShot = await import('react-native-view-shot').catch(() => null);
      const Sharing = await import('expo-sharing').catch(() => null);

      if (!ViewShot || !Sharing) {
        // Fallback: share text
        const { Share } = await import('react-native');
        await Share.share({
          message: `Check out my havesmashed stats! ${stats?.totalDates ?? 0} dates across ${stats?.uniqueCities ?? 0} cities in ${stats?.uniqueCountries ?? 0} countries. Average rating: ${fmtRating(stats?.averageRating ?? null)}`,
        });
      }
    } catch {
      // Fallback share
      const { Share } = await import('react-native');
      await Share.share({
        message: `Check out my havesmashed stats! ${stats?.totalDates ?? 0} dates across ${stats?.uniqueCities ?? 0} cities in ${stats?.uniqueCountries ?? 0} countries.`,
      });
    } finally {
      setSharing(false);
    }
  }, [stats]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={styles.backButton}
          >
            <Text style={styles.backText}>{'\u2039'}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Your Wrapped</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.neon.pink} />
        </View>
      </SafeAreaView>
    );
  }

  if (!stats) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={styles.backButton}
          >
            <Text style={styles.backText}>{'\u2039'}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Your Wrapped</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Failed to load stats</Text>
          <Button title="Retry" onPress={loadData} size="sm" />
        </View>
      </SafeAreaView>
    );
  }

  const statCards: StatCardData[] = [
    {
      value: String(stats.totalDates),
      label: 'DATES',
      color: colors.neon.pink,
      delay: 200,
    },
    {
      value: String(stats.uniqueCities),
      label: 'CITIES',
      color: colors.neon.blue,
      delay: 400,
    },
    {
      value: String(stats.uniqueCountries),
      label: 'COUNTRIES',
      color: colors.neon.purple,
      delay: 600,
    },
    {
      value: fmtRating(stats.averageRating),
      label: 'AVG RATING',
      color: colors.neon.yellow,
      delay: 800,
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backButton}
        >
          <Text style={styles.backText}>{'\u2039'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Your Wrapped</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Wrapped Card */}
        <View style={styles.wrappedCard}>
          {/* Decorative glows */}
          <View style={styles.glowTopRight} />
          <View style={styles.glowBottomLeft} />

          {/* Branding */}
          <Text style={styles.branding}>havesmashed</Text>

          {/* Nickname subtitle */}
          <Text style={styles.nickname}>
            @{user?.nickname ?? 'anonymous'}
          </Text>
          <Text style={styles.yearTitle}>2026 Wrapped</Text>

          {/* Stats grid 2x2 */}
          <View style={styles.statsGrid}>
            {statCards.map((card, idx) => (
              <AnimatedStatCard key={card.label} {...card} index={idx} />
            ))}
          </View>

          {/* Details */}
          <View style={styles.detailsSection}>
            <AnimatedDetailRow
              emoji={'\uD83D\uDD25'}
              label="Current Streak"
              value={`${stats.currentStreak} weeks`}
              delay={1000}
            />
            <AnimatedDetailRow
              emoji={'\uD83C\uDFC6'}
              label="Longest Streak"
              value={`${stats.longestStreak} weeks`}
              delay={1100}
            />
            {stats.averageFaceRating !== null && (
              <AnimatedDetailRow
                emoji={'\uD83D\uDE0D'}
                label="Avg Face Rating"
                value={fmtRating(stats.averageFaceRating)}
                delay={1200}
              />
            )}
            {stats.averageBodyRating !== null && (
              <AnimatedDetailRow
                emoji={'\uD83D\uDCAA'}
                label="Avg Body Rating"
                value={fmtRating(stats.averageBodyRating)}
                delay={1300}
              />
            )}
            {stats.averageChatRating !== null && (
              <AnimatedDetailRow
                emoji={'\uD83D\uDCAC'}
                label="Avg Chat Rating"
                value={fmtRating(stats.averageChatRating)}
                delay={1400}
              />
            )}
            {topBadge && (
              <AnimatedDetailRow
                emoji={topBadge.icon}
                label="Top Badge"
                value={topBadge.name}
                accent={colors.neon.yellow}
                delay={1500}
              />
            )}
            <AnimatedDetailRow
              emoji={'\uD83C\uDFC5'}
              label="Badges Earned"
              value={`${earnedBadgeCount}/${badges.length}`}
              delay={1600}
            />
          </View>

          {/* Footer divider */}
          <View style={styles.cardDivider} />
          <Text style={styles.cardFooter}>havesmashed.app</Text>
        </View>

        {/* Share button */}
        <View style={styles.shareContainer}>
          <Button
            title={sharing ? 'Sharing...' : 'Share My Stats'}
            onPress={handleShare}
            loading={sharing}
            fullWidth
            size="lg"
          />
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    height: 52,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: colors.text.primary,
    fontSize: 26,
    fontWeight: fontWeight.semibold,
    marginTop: -2,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  headerRight: {
    width: 36,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorText: {
    color: colors.text.muted,
    fontSize: fontSize.md,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },

  /* Wrapped Card */
  wrappedCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    padding: spacing.lg,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,0,127,0.15)',
    backgroundColor: colors.background.secondary,
  },
  glowTopRight: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,0,127,0.08)',
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: -40,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(0,212,255,0.06)',
  },
  branding: {
    color: colors.neon.pink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
    textShadowColor: 'rgba(255,0,127,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    marginBottom: spacing.sm,
  },
  nickname: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  yearTitle: {
    color: colors.text.primary,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(255,255,255,0.1)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
    marginBottom: spacing.lg,
  },

  /* Stats Grid */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 2,
    width: '100%',
    marginBottom: spacing.lg,
  },
  statCard: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 36,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },

  /* Details */
  detailsSection: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  detailEmoji: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },

  /* Footer */
  cardDivider: {
    width: '60%',
    height: 1,
    backgroundColor: 'rgba(255,0,127,0.2)',
    marginBottom: spacing.sm,
  },
  cardFooter: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '500',
  },

  /* Share */
  shareContainer: {
    marginTop: spacing.lg,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
