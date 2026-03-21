import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
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
import { EmptyState } from '../../components/ui/EmptyState';
import { api } from '../../services/api';
import type { Notification } from '../../types';

function notificationIcon(type: string): string {
  switch (type) {
    case 'badge':
      return '\uD83C\uDFC5';
    case 'friend_date':
      return '\uD83D\uDD25';
    case 'system':
    default:
      return '\uD83D\uDD14';
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      try {
        await api.markNotificationRead(id);
      } catch {
        // Revert on failure
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)),
        );
      }
    },
    [],
  );

  const handleMarkAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));

    // Mark each as read
    try {
      await Promise.allSettled(
        unread.map((n) => api.markNotificationRead(n.id)),
      );
    } catch {
      // Best effort
    }
  }, [notifications]);

  const handleNotificationPress = useCallback(
    (notification: Notification) => {
      if (!notification.isRead) {
        handleMarkRead(notification.id);
      }

      // Navigate based on type
      switch (notification.notificationType) {
        case 'badge':
          (navigation as any).navigate('Badges');
          break;
        case 'friend_date':
          // Could navigate to friends/feed screen
          break;
        default:
          break;
      }
    },
    [navigation, handleMarkRead],
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <Pressable
        onPress={() => handleNotificationPress(item)}
        style={({ pressed }) => [
          styles.notificationItem,
          !item.isRead && styles.notificationUnread,
          pressed && styles.notificationPressed,
        ]}
      >
        <View style={styles.notificationIconContainer}>
          <Text style={styles.notificationIcon}>
            {notificationIcon(item.notificationType)}
          </Text>
        </View>
        <View style={styles.notificationContent}>
          <Text
            style={[
              styles.notificationTitle,
              !item.isRead && styles.notificationTitleUnread,
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.notificationMessage} numberOfLines={2}>
            {item.message}
          </Text>
          <Text style={styles.notificationTime}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </Pressable>
    ),
    [handleNotificationPress],
  );

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
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={handleMarkAllRead} hitSlop={8}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={styles.headerRight} />
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.neon.pink} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={
            notifications.length === 0
              ? styles.emptyListContent
              : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.neon.pink}
              colors={[colors.neon.pink]}
            />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              title="No notifications yet"
              description="You'll be notified about badges, friend activity, and more."
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
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
    width: 80,
  },
  markAllText: {
    color: colors.neon.pink,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  emptyListContent: {
    flex: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    gap: spacing.sm + 2,
  },
  notificationUnread: {
    backgroundColor: 'rgba(255,0,127,0.04)',
  },
  notificationPressed: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  notificationIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationIcon: {
    fontSize: 20,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    marginBottom: 2,
  },
  notificationTitleUnread: {
    color: colors.text.primary,
    fontWeight: fontWeight.semibold,
  },
  notificationMessage: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  notificationTime: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neon.pink,
    shadowColor: colors.neon.pink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: layout.screenPadding,
  },
});
