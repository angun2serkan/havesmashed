import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  Globe,
  MapPin,
  Star,
  Trash2,
  Lock,
  Calendar,
} from 'lucide-react-native';
import type { FriendsStackScreenProps } from '../../app/types';
import type { Badge, FriendDate, FriendStats } from '../../types';
import { api } from '../../services/api';
import { useFriendStore } from '../../stores/friendStore';
import { colors, neonShadow, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, spacing, layout } from '../../constants/layout';
import { Card } from '../../components/ui/Card';
import { ColorPicker } from '../../components/friends/ColorPicker';

export const FriendProfileScreen: React.FC<
  FriendsStackScreenProps<'FriendProfile'>
> = ({ navigation, route }) => {
  const { friendId, nickname } = route.params;
  const queryClient = useQueryClient();
  const updateConnectionColor = useFriendStore((s) => s.updateConnectionColor);
  const connections = useFriendStore((s) => s.connections);

  const connection = connections.find(
    (c) => c.requesterId === friendId || c.responderId === friendId,
  );
  const currentColor = connection?.color ?? '#FF5733';

  // Fetch friend stats
  const {
    data: stats,
    isLoading: statsLoading,
  } = useQuery<FriendStats>({
    queryKey: ['friendStats', friendId],
    queryFn: () => api.getFriendStats(friendId),
  });

  // Fetch friend badges
  const {
    data: badges,
    isLoading: badgesLoading,
  } = useQuery<Badge[]>({
    queryKey: ['friendBadges', friendId],
    queryFn: () => api.getFriendBadges(friendId),
  });

  // Fetch friend dates
  const {
    data: friendDates,
    isLoading: datesLoading,
  } = useQuery<FriendDate[]>({
    queryKey: ['friendDates', friendId],
    queryFn: () => api.getFriendDates(friendId),
  });

  // Delete connection mutation
  const deleteMutation = useMutation({
    mutationFn: (connectionId: string) => api.deleteConnection(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      navigation.goBack();
    },
    onError: () => {
      Alert.alert('Error', 'Failed to remove connection');
    },
  });

  // Color change mutation
  const colorMutation = useMutation({
    mutationFn: ({ connectionId, color }: { connectionId: string; color: string }) =>
      api.setFriendColor(connectionId, color),
    onError: () => {
      // Revert optimistic update
      if (connection) {
        updateConnectionColor(connection.id, currentColor);
      }
    },
  });

  const handleColorChange = useCallback(
    (color: string) => {
      if (!connection) return;
      updateConnectionColor(connection.id, color);
      colorMutation.mutate({ connectionId: connection.id, color });
    },
    [connection, updateConnectionColor, colorMutation],
  );

  const handleDelete = useCallback(() => {
    if (!connection) return;
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${nickname ?? 'this friend'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(connection.id),
        },
      ],
    );
  }, [connection, nickname, deleteMutation]);

  const earnedBadges = badges?.filter((b) => b.earned) ?? [];

  const formatRating = (rating: number | null) =>
    rating !== null ? rating.toFixed(1) : '--';

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.text.primary} />
        </Pressable>
        <View style={styles.headerTitle}>
          <View
            style={[
              styles.headerDot,
              { backgroundColor: currentColor },
              neonShadow(currentColor),
            ]}
          />
          <Text style={styles.headerName} numberOfLines={1}>
            {nickname ?? 'Friend'}
          </Text>
          {stats?.topBadgeIcon && (
            <Text style={styles.headerBadge}>{stats.topBadgeIcon}</Text>
          )}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Color Picker */}
        <Card>
          <ColorPicker
            selectedColor={currentColor}
            onColorChange={handleColorChange}
          />
        </Card>

        {/* Stats Section */}
        <Card>
          <View style={styles.sectionHeader}>
            <BarChart3 size={16} color={colors.neon.blue} />
            <Text style={styles.sectionTitle}>Stats</Text>
          </View>

          {statsLoading ? (
            <ActivityIndicator color={colors.neon.pink} style={styles.loader} />
          ) : stats ? (
            <View style={styles.statsGrid}>
              <StatItem
                label="Total Dates"
                value={String(stats.totalDates)}
                icon={<Calendar size={14} color={colors.neon.pink} />}
              />
              <StatItem
                label="Countries"
                value={String(stats.uniqueCountries)}
                icon={<Globe size={14} color={colors.neon.green} />}
              />
              <StatItem
                label="Cities"
                value={String(stats.uniqueCities)}
                icon={<MapPin size={14} color={colors.neon.blue} />}
              />
              <StatItem
                label="Avg Rating"
                value={formatRating(stats.averageRating)}
                icon={<Star size={14} color={colors.neon.yellow} />}
              />
              {stats.averageFaceRating !== null && (
                <StatItem
                  label="Face"
                  value={formatRating(stats.averageFaceRating)}
                />
              )}
              {stats.averageBodyRating !== null && (
                <StatItem
                  label="Body"
                  value={formatRating(stats.averageBodyRating)}
                />
              )}
              {stats.averageChatRating !== null && (
                <StatItem
                  label="Chat"
                  value={formatRating(stats.averageChatRating)}
                />
              )}
            </View>
          ) : (
            <PrivacyNotice message="Stats are not shared" />
          )}
        </Card>

        {/* Badges Section */}
        <Card>
          <View style={styles.sectionHeader}>
            <Text style={styles.badgeEmoji}>🏆</Text>
            <Text style={styles.sectionTitle}>
              Badges{earnedBadges.length > 0 ? ` (${earnedBadges.length})` : ''}
            </Text>
          </View>

          {badgesLoading ? (
            <ActivityIndicator color={colors.neon.pink} style={styles.loader} />
          ) : earnedBadges.length > 0 ? (
            <View style={styles.badgeGrid}>
              {earnedBadges.map((badge) => (
                <View key={badge.id} style={styles.badgeItem}>
                  <Text style={styles.badgeItemIcon}>{badge.icon}</Text>
                  <Text style={styles.badgeItemName} numberOfLines={1}>
                    {badge.name}
                  </Text>
                  <Text style={styles.badgeItemTier}>{badge.tier}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No badges earned yet</Text>
          )}
        </Card>

        {/* Recent Dates */}
        <Card>
          <View style={styles.sectionHeader}>
            <Calendar size={16} color={colors.neon.purple} />
            <Text style={styles.sectionTitle}>Recent Dates</Text>
          </View>

          {datesLoading ? (
            <ActivityIndicator color={colors.neon.pink} style={styles.loader} />
          ) : friendDates && friendDates.length > 0 ? (
            <View style={styles.datesList}>
              {friendDates.slice(0, 10).map((date) => (
                <View key={date.id} style={styles.dateItem}>
                  <View style={styles.dateItemLeft}>
                    <Text style={styles.dateCity}>
                      {date.cityName ?? 'Unknown City'}
                    </Text>
                    <Text style={styles.dateInfo}>
                      {date.gender} / {date.ageRange}
                      {date.heightRange ? ` / ${date.heightRange}` : ''}
                    </Text>
                    <Text style={styles.dateDate}>
                      {new Date(date.dateAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.dateRating}>
                    <Star size={12} color={colors.neon.yellow} />
                    <Text style={styles.dateRatingText}>{date.rating}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <PrivacyNotice message="Dates are not shared or none yet" />
          )}
        </Card>

        {/* Delete Connection */}
        <Pressable
          onPress={handleDelete}
          style={styles.deleteBtn}
        >
          <Trash2 size={16} color={colors.neon.red} />
          <Text style={styles.deleteBtnText}>Remove Connection</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.statItem}>
      {icon && <View style={styles.statIcon}>{icon}</View>}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PrivacyNotice({ message }: { message: string }) {
  return (
    <View style={styles.privacyNotice}>
      <Lock size={16} color={colors.text.muted} />
      <Text style={styles.privacyText}>{message}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  headerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  headerName: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
    maxWidth: '60%',
  },
  headerBadge: {
    fontSize: fontSize.lg,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  loader: {
    paddingVertical: spacing.lg,
  },
  // Stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statItem: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minWidth: 80,
    gap: 2,
  },
  statIcon: {
    marginBottom: 2,
  },
  statValue: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
  },
  // Badges
  badgeEmoji: {
    fontSize: fontSize.md,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badgeItem: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    alignItems: 'center',
    minWidth: 72,
    gap: 2,
  },
  badgeItemIcon: {
    fontSize: 24,
  },
  badgeItemName: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    textAlign: 'center',
    maxWidth: 64,
  },
  badgeItemTier: {
    color: colors.text.muted,
    fontSize: fontSize.xs - 2,
    textTransform: 'capitalize',
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  // Dates
  datesList: {
    gap: spacing.sm,
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  dateItemLeft: {
    flex: 1,
    gap: 1,
  },
  dateCity: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  dateInfo: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textTransform: 'capitalize',
  },
  dateDate: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
  },
  dateRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,215,0,0.1)',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  dateRatingText: {
    color: colors.neon.yellow,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  // Privacy
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  privacyText: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
  },
  // Delete
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.3)',
    backgroundColor: 'rgba(255,68,68,0.08)',
  },
  deleteBtnText: {
    color: colors.neon.red,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});

export default FriendProfileScreen;
