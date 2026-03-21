import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus, MessageCircle } from 'lucide-react-native';
import { api } from '../../services/api';
import { TopicCard } from '../../components/forum/TopicCard';
import { EmptyState } from '../../components/ui/EmptyState';
import type { ForumStackScreenProps } from '../../app/types';
import type { ForumTopic } from '../../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'tips', label: 'Tips' },
  { value: 'stories', label: 'Stories' },
  { value: 'questions', label: 'Questions' },
  { value: 'off-topic', label: 'Off-topic' },
];

const SORTS = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
];

const PAGE_LIMIT = 20;

function formatBanRemaining(bannedUntil: string): string {
  const remaining = new Date(bannedUntil).getTime() - Date.now();
  if (remaining <= 0) return 'expired';
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${mins}m`;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = ForumStackScreenProps<'ForumList'>;

export default function ForumScreen({ navigation }: Props) {
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('hot');

  // Ban status
  const banQuery = useQuery({
    queryKey: ['forumBanStatus'],
    queryFn: () => api.getForumBanStatus(),
    staleTime: 60_000,
  });

  const isBanned = banQuery.data?.isBanned ?? false;
  const bannedUntil = banQuery.data?.bannedUntil ?? null;

  // Topics with infinite scroll
  const topicsQuery = useInfiniteQuery({
    queryKey: ['forumTopics', category, sort],
    queryFn: async ({ pageParam }) => {
      return api.getForumTopics({
        category: category || undefined,
        sort,
        cursor: pageParam as string | undefined,
        limit: PAGE_LIMIT,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
  });

  // Flatten pages into sorted topic list (pinned first)
  const allTopics = useMemo(() => {
    const flat = topicsQuery.data?.pages.flatMap((p) => p.topics) ?? [];
    const pinned = flat.filter((t) => t.isPinned);
    const regular = flat.filter((t) => !t.isPinned);
    return [...pinned, ...regular];
  }, [topicsQuery.data]);

  const handleRefresh = useCallback(() => {
    topicsQuery.refetch();
    banQuery.refetch();
  }, [topicsQuery, banQuery]);

  const handleEndReached = useCallback(() => {
    if (topicsQuery.hasNextPage && !topicsQuery.isFetchingNextPage) {
      topicsQuery.fetchNextPage();
    }
  }, [topicsQuery]);

  const navigateToTopic = useCallback(
    (topic: ForumTopic) => {
      navigation.navigate('TopicDetail', {
        topicId: topic.id,
        title: topic.title,
      });
    },
    [navigation],
  );

  const navigateToNewTopic = useCallback(() => {
    navigation.navigate('NewTopic');
  }, [navigation]);

  // ─── Render helpers ──────────────────────────────────────────────────────

  const renderTopic = useCallback(
    ({ item }: { item: ForumTopic }) => (
      <TopicCard topic={item} onPress={() => navigateToTopic(item)} />
    ),
    [navigateToTopic],
  );

  const keyExtractor = useCallback((item: ForumTopic) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!topicsQuery.isFetchingNextPage) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#ff007f" />
      </View>
    );
  }, [topicsQuery.isFetchingNextPage]);

  const renderEmpty = useCallback(() => {
    if (topicsQuery.isLoading) return null;
    return (
      <EmptyState
        icon={<MessageCircle size={48} color="#606070" />}
        title="No topics yet"
        description="Be the first to start a conversation!"
      />
    );
  }, [topicsQuery.isLoading]);

  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Forum</Text>
          {!isBanned && (
            <Pressable
              onPress={navigateToNewTopic}
              style={styles.newTopicButton}
            >
              <Plus size={18} color="#ffffff" />
              <Text style={styles.newTopicText}>New Topic</Text>
            </Pressable>
          )}
        </View>

        {/* Ban banner */}
        {isBanned && bannedUntil && (
          <View style={styles.banBanner}>
            <Text style={styles.banTitle}>Forum access restricted</Text>
            <Text style={styles.banSubtitle}>
              Remaining: {formatBanRemaining(bannedUntil)}
            </Text>
          </View>
        )}

        {/* Category filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContainer}
          style={styles.chipsScroll}
        >
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => setCategory(c.value)}
              style={[
                styles.chip,
                category === c.value && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  category === c.value && styles.chipTextActive,
                ]}
              >
                {c.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Sort tabs */}
        <View style={styles.sortRow}>
          {SORTS.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => setSort(s.value)}
              style={[
                styles.sortTab,
                sort === s.value && styles.sortTabActive,
              ]}
            >
              <Text
                style={[
                  styles.sortText,
                  sort === s.value && styles.sortTextActive,
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Loading state */}
        {topicsQuery.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ff007f" />
          </View>
        ) : (
          <FlatList
            data={allTopics}
            renderItem={renderTopic}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.3}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={renderEmpty}
            refreshControl={
              <RefreshControl
                refreshing={topicsQuery.isRefetching && !topicsQuery.isFetchingNextPage}
                onRefresh={handleRefresh}
                tintColor="#ff007f"
                colors={['#ff007f']}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  newTopicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff007f',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
    shadowColor: '#ff007f',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  newTopicText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  banBanner: {
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.25)',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  banTitle: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '600',
  },
  banSubtitle: {
    color: '#ff8888',
    fontSize: 12,
    marginTop: 4,
  },
  chipsScroll: {
    maxHeight: 44,
  },
  chipsContainer: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#12121a',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  chipActive: {
    backgroundColor: 'rgba(255,0,127,0.12)',
    borderColor: 'rgba(255,0,127,0.5)',
  },
  chipText: {
    color: '#8888aa',
    fontSize: 12,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#ff007f',
  },
  sortRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  sortTab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  sortTabActive: {
    borderBottomColor: '#ff007f',
  },
  sortText: {
    color: '#8888aa',
    fontSize: 13,
    fontWeight: '500',
  },
  sortTextActive: {
    color: '#ff007f',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    flexGrow: 1,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
