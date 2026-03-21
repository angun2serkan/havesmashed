import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useLogStore } from '../../stores/logStore';
import { useFriendStore } from '../../stores/friendStore';
import { useAuthStore } from '../../stores/authStore';
import type { DateEntry, Notification } from '../../types';
import { colors, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, spacing, layout } from '../../constants/layout';

// Components
import { GlobeWebView } from '../../components/globe/GlobeWebView';
import { GlobeFilterBar } from '../../components/globe/GlobeFilterBar';
import { CityInsightsModal } from '../../components/globe/CityInsightsModal';
import { DateDetailModal } from '../../components/globe/DateDetailModal';
import { DateEntryForm } from '../../components/date/DateEntryForm';
import { StatsCards } from '../../components/stats/StatsCards';
import { SmashOverlay } from '../../components/shared/SmashOverlay';

export const HomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Stores
  const dates = useLogStore((s) => s.dates);
  const setDates = useLogStore((s) => s.setDates);
  const setStats = useLogStore((s) => s.setStats);
  const connections = useFriendStore((s) => s.connections);
  const setConnections = useFriendStore((s) => s.setConnections);
  const friendDates = useFriendStore((s) => s.friendDates);
  const setFriendDates = useFriendStore((s) => s.setFriendDates);
  const currentUser = useAuthStore((s) => s.user);

  // Local state
  const [globeFilter, setGlobeFilter] = useState<string>('all');
  const [dateFormVisible, setDateFormVisible] = useState(false);
  const [editingDate, setEditingDate] = useState<DateEntry | undefined>(
    undefined,
  );
  const [insightsCityId, setInsightsCityId] = useState<number | null>(null);
  const [insightsVisible, setInsightsVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<DateEntry | null>(null);
  const [dateDetailVisible, setDateDetailVisible] = useState(false);
  const [smashFriendName, setSmashFriendName] = useState('');
  const [smashVisible, setSmashVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // ----- Data fetching with React Query -----

  const { data: datesData } = useQuery({
    queryKey: ['dates'],
    queryFn: () => api.getDates(),
    staleTime: 60_000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
    staleTime: 60_000,
  });

  const { data: connectionsData } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.getConnections('accepted'),
    staleTime: 120_000,
  });

  const { data: friendDatesData } = useQuery({
    queryKey: ['friendDates', globeFilter],
    queryFn: () => {
      if (globeFilter === 'mine') return Promise.resolve([]);
      const friendId =
        globeFilter !== 'all' && globeFilter !== 'mine'
          ? globeFilter
          : undefined;
      return api.getFriendDates(friendId);
    },
    staleTime: 60_000,
  });

  const { data: notificationsData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications(),
    staleTime: 120_000,
  });

  const { data: unreadData } = useQuery({
    queryKey: ['unreadCount'],
    queryFn: () => api.getUnreadCount(),
    staleTime: 30_000,
  });

  // Sync query data to stores
  useEffect(() => {
    if (datesData?.dates) setDates(datesData.dates);
  }, [datesData, setDates]);

  useEffect(() => {
    if (statsData) setStats(statsData);
  }, [statsData, setStats]);

  useEffect(() => {
    if (connectionsData) setConnections(connectionsData);
  }, [connectionsData, setConnections]);

  useEffect(() => {
    if (friendDatesData) setFriendDates(friendDatesData);
  }, [friendDatesData, setFriendDates]);

  useEffect(() => {
    if (unreadData !== undefined) setUnreadCount(unreadData);
  }, [unreadData]);

  // Check for smash notifications
  useEffect(() => {
    if (!notificationsData) return;
    const friendDateNotifs = notificationsData.filter(
      (n) => n.notificationType === 'friend_date' && !n.isRead,
    );
    if (friendDateNotifs.length > 0) {
      const first = friendDateNotifs[0]!;
      setSmashFriendName(first.title || 'A friend');
      setSmashVisible(true);
      // Mark as read
      for (const n of friendDateNotifs) {
        api.markNotificationRead(n.id).catch(() => {});
      }
    }
  }, [notificationsData]);

  // ----- Handlers -----

  const handleFilterChange = useCallback((filter: string) => {
    setGlobeFilter(filter);
  }, []);

  const handleCityPress = useCallback((cityId: number) => {
    setInsightsCityId(cityId);
    setInsightsVisible(true);
  }, []);

  const handleDatePress = useCallback(
    (dateId: string, isFriend: boolean) => {
      if (isFriend) return; // Only show detail for own dates via dot press
      const found = dates.find((d) => d.id === dateId);
      if (found) {
        setSelectedDate(found);
        setDateDetailVisible(true);
      }
    },
    [dates],
  );

  const handleDateEdit = useCallback((date: DateEntry) => {
    setDateDetailVisible(false);
    setEditingDate(date);
    setDateFormVisible(true);
  }, []);

  const handleDateDelete = useCallback(
    async (id: string) => {
      try {
        await api.deleteDate(id);
        useLogStore.getState().removeDate(id);
        setDateDetailVisible(false);
        queryClient.invalidateQueries({ queryKey: ['dates'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      } catch {
        // silently fail
      }
    },
    [queryClient],
  );

  const handleDateFormClose = useCallback(() => {
    setDateFormVisible(false);
    setEditingDate(undefined);
    queryClient.invalidateQueries({ queryKey: ['dates'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  }, [queryClient]);

  const handleSmashDismiss = useCallback(() => {
    setSmashVisible(false);
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Smash overlay */}
      <SmashOverlay
        friendName={smashFriendName}
        visible={smashVisible}
        onDismiss={handleSmashDismiss}
      />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>HaveISmashed</Text>
        </View>
        <Pressable style={styles.bellContainer} hitSlop={8}>
          <Text style={styles.bellIcon}>🔔</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Globe filter bar */}
      <GlobeFilterBar
        activeFilter={globeFilter}
        onFilterChange={handleFilterChange}
        connections={connections}
        currentUserId={currentUser?.id}
      />

      {/* Globe / Map WebView */}
      <View style={styles.mapContainer}>
        <GlobeWebView
          dates={dates}
          friendDates={friendDates}
          filter={globeFilter}
          onCityPress={handleCityPress}
          onDatePress={handleDatePress}
        />
      </View>

      {/* Stats cards at bottom */}
      <View style={[styles.statsContainer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <StatsCards />
      </View>

      {/* FAB - Add new date */}
      <Pressable
        onPress={() => {
          setEditingDate(undefined);
          setDateFormVisible(true);
        }}
        style={[
          styles.fab,
          neonGlow(colors.neon.pink, 0.5),
          { bottom: Math.max(insets.bottom, spacing.sm) + 120 },
        ]}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      {/* Modals */}
      <CityInsightsModal
        cityId={insightsCityId}
        visible={insightsVisible}
        onClose={() => {
          setInsightsVisible(false);
          setInsightsCityId(null);
        }}
      />

      <DateDetailModal
        date={selectedDate}
        visible={dateDetailVisible}
        onClose={() => {
          setDateDetailVisible(false);
          setSelectedDate(null);
        }}
        onEdit={handleDateEdit}
        onDelete={handleDateDelete}
        isOwn={
          selectedDate
            ? !friendDates.some((fd) => fd.id === selectedDate.id)
            : true
        }
      />

      <DateEntryForm
        visible={dateFormVisible}
        onClose={handleDateFormClose}
        editDate={editingDate}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  appName: {
    color: colors.neon.pink,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
    textShadowColor: `${colors.neon.pink}40`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  bellContainer: {
    position: 'relative',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: {
    fontSize: 22,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.neon.pink,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  mapContainer: {
    flex: 1,
    marginHorizontal: spacing.sm,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsContainer: {
    paddingTop: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.neon.pink,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  fabIcon: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
  },
});
