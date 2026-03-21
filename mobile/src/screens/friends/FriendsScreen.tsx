import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Connection } from '../../types';
import type { FriendsStackScreenProps } from '../../app/types';
import { api } from '../../services/api';
import { useFriendStore } from '../../stores/friendStore';
import { useAuthStore } from '../../stores/authStore';
import { colors, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, spacing, layout } from '../../constants/layout';
import { FriendList } from '../../components/friends/FriendList';
import { InviteSection } from '../../components/friends/InviteSection';
import { LoadingScreen } from '../../components/ui/LoadingScreen';

type Tab = 'friends' | 'pending' | 'invite';

const TABS: { key: Tab; label: string }[] = [
  { key: 'friends', label: 'Friends' },
  { key: 'pending', label: 'Pending' },
  { key: 'invite', label: 'Invite' },
];

export const FriendsScreen: React.FC<
  FriendsStackScreenProps<'FriendsList'>
> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const {
    setConnections,
    updateConnectionStatus,
    removeConnection,
  } = useFriendStore();

  // Fetch connections
  const {
    data: connections = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['connections'],
    queryFn: async () => {
      const data = await api.getConnections();
      setConnections(data);
      return data;
    },
  });

  const pendingConnections = connections.filter((c) => c.status === 'pending');
  const acceptedConnections = connections.filter((c) => c.status === 'accepted');

  // Accept mutation
  const acceptMutation = useMutation({
    mutationFn: () => api.respondToConnection('accept'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['connections'] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
    onError: () => {
      Alert.alert('Error', 'Failed to accept connection');
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: () => api.respondToConnection('reject'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['connections'] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
    onError: () => {
      Alert.alert('Error', 'Failed to reject connection');
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['connections'] });
      removeConnection(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
    onError: () => {
      Alert.alert('Error', 'Failed to remove connection');
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });

  const handleAccept = useCallback(
    (connection: Connection) => {
      updateConnectionStatus(connection.id, 'accepted');
      acceptMutation.mutate();
    },
    [acceptMutation, updateConnectionStatus],
  );

  const handleReject = useCallback(
    (connection: Connection) => {
      updateConnectionStatus(connection.id, 'rejected');
      rejectMutation.mutate();
    },
    [rejectMutation, updateConnectionStatus],
  );

  const handleDelete = useCallback(
    (connection: Connection) => {
      Alert.alert(
        'Remove Friend',
        `Are you sure you want to remove ${connection.friendNickname ?? 'this friend'}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => deleteMutation.mutate(connection.id),
          },
        ],
      );
    },
    [deleteMutation],
  );

  const handlePress = useCallback(
    (connection: Connection) => {
      const friendId =
        connection.requesterId === currentUser?.id
          ? connection.responderId
          : connection.requesterId;
      navigation.navigate('FriendProfile', {
        friendId,
        nickname: connection.friendNickname,
      });
    },
    [currentUser?.id, navigation],
  );

  const pendingCount = pendingConnections.length;

  const getDisplayConnections = (): Connection[] => {
    switch (activeTab) {
      case 'friends':
        return acceptedConnections;
      case 'pending':
        return pendingConnections;
      default:
        return [];
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Loading friends..." />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Friends</Text>
          <Text style={styles.subtitle}>
            Connect and share with friends
          </Text>
        </View>

        {/* Tab Segments */}
        <View style={styles.tabRow}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const showBadge = tab.key === 'pending' && pendingCount > 0;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.tab,
                  isActive && styles.tabActive,
                  isActive && neonGlow(colors.neon.pink, 0.3),
                ]}
              >
                <Text
                  style={[styles.tabText, isActive && styles.tabTextActive]}
                >
                  {tab.label}
                </Text>
                {showBadge && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{pendingCount}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Content */}
        {activeTab === 'invite' ? (
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.inviteContent}
            showsVerticalScrollIndicator={false}
          >
            <InviteSection />
          </ScrollView>
        ) : (
          <FriendList
            connections={getDisplayConnections()}
            onAccept={handleAccept}
            onReject={handleReject}
            onDelete={handleDelete}
            onPress={handlePress}
            refreshing={isRefetching}
            onRefresh={refetch}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: 'rgba(255,0,127,0.15)',
    borderColor: 'rgba(255,0,127,0.4)',
  },
  tabText: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.neon.pink,
  },
  tabBadge: {
    backgroundColor: colors.neon.pink,
    borderRadius: borderRadius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: '#ffffff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  scrollContent: {
    flex: 1,
  },
  inviteContent: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
});

export default FriendsScreen;
