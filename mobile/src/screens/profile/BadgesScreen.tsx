import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
  layout,
} from '../../constants/layout';
import { BadgeGrid } from '../../components/shared/BadgeGrid';
import { BadgePopup } from '../../components/shared/BadgePopup';
import { api } from '../../services/api';
import type { Badge } from '../../types';

type FilterTab = 'all' | 'earned' | 'locked';

const FILTER_TABS: { label: string; value: FilterTab }[] = [
  { label: 'All', value: 'all' },
  { label: 'Earned', value: 'earned' },
  { label: 'Locked', value: 'locked' },
];

export const BadgesScreen: React.FC = () => {
  const navigation = useNavigation();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);

  useEffect(() => {
    loadBadges();
  }, []);

  const loadBadges = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getMyBadges();
      setBadges(data);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredBadges = badges.filter((b) => {
    if (filter === 'earned') return b.earned;
    if (filter === 'locked') return !b.earned;
    return true;
  });

  const earnedCount = badges.filter((b) => b.earned).length;
  const totalCount = badges.length;

  const handleBadgePress = useCallback((badge: Badge) => {
    setSelectedBadge(badge);
    setPopupVisible(true);
  }, []);

  const handleClosePopup = useCallback(() => {
    setPopupVisible(false);
    setSelectedBadge(null);
  }, []);

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
        <Text style={styles.headerTitle}>My Badges</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Progress summary */}
      <View style={styles.progressSummary}>
        <Text style={styles.progressText}>
          <Text style={styles.progressHighlight}>{earnedCount}</Text>
          /{totalCount} earned
        </Text>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: totalCount > 0
                  ? `${Math.round((earnedCount / totalCount) * 100)}%`
                  : '0%',
              },
            ]}
          />
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <Pressable
            key={tab.value}
            onPress={() => setFilter(tab.value)}
            style={[
              styles.filterTab,
              filter === tab.value && styles.filterTabActive,
            ]}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === tab.value && styles.filterTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Badge grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.neon.pink} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredBadges.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>
                {filter === 'earned' ? '\uD83C\uDFC6' : '\uD83D\uDD12'}
              </Text>
              <Text style={styles.emptyText}>
                {filter === 'earned'
                  ? 'No badges earned yet. Keep going!'
                  : filter === 'locked'
                  ? 'All badges unlocked!'
                  : 'No badges available'}
              </Text>
            </View>
          ) : (
            <BadgeGrid badges={filteredBadges} onBadgePress={handleBadgePress} />
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}

      {/* Badge popup */}
      <BadgePopup
        badge={selectedBadge}
        visible={popupVisible}
        onClose={handleClosePopup}
      />
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
  progressSummary: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
  },
  progressText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  progressHighlight: {
    color: colors.neon.pink,
    fontWeight: fontWeight.bold,
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.background.tertiary,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.neon.pink,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabActive: {
    backgroundColor: 'rgba(255,0,127,0.12)',
    borderColor: colors.neon.pink,
  },
  filterTabText: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  filterTabTextActive: {
    color: colors.neon.pink,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
