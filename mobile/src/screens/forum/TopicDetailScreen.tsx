import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Heart,
  Flag,
  Lock,
  Pin,
} from 'lucide-react-native';
import { api } from '../../services/api';
import { Badge } from '../../components/ui/Badge';
import { CommentThread } from '../../components/forum/CommentThread';
import { CommentInput } from '../../components/forum/CommentInput';
import { ReportModal } from '../../components/forum/ReportModal';
import type { ForumStackScreenProps } from '../../app/types';
import type { ForumComment } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  tips: '#00ff88',
  stories: '#b44dff',
  questions: '#00d4ff',
  'off-topic': '#ffa500',
  general: '#8888aa',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = ForumStackScreenProps<'TopicDetail'>;

export default function TopicDetailScreen({ navigation, route }: Props) {
  const { topicId } = route.params;
  const queryClient = useQueryClient();

  const [replyTo, setReplyTo] = useState<{
    id: string;
    authorNickname: string;
  } | null>(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: 'topic' | 'comment';
    id: string;
  } | null>(null);

  // Fetch topic + comments
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['forumTopic', topicId],
    queryFn: () => api.getForumTopic(topicId),
    staleTime: 20_000,
  });

  // Ban status
  const banQuery = useQuery({
    queryKey: ['forumBanStatus'],
    queryFn: () => api.getForumBanStatus(),
    staleTime: 60_000,
  });

  const isBanned = banQuery.data?.isBanned ?? false;
  const topic = data?.topic ?? null;
  const allComments = data?.comments ?? [];

  // Build nested comment tree: top-level comments + their replies
  const { rootComments, replyMap } = useMemo(() => {
    const roots: ForumComment[] = [];
    const map = new Map<string, ForumComment[]>();

    for (const c of allComments) {
      if (!c.parentId || c.depth === 0) {
        roots.push(c);
      } else {
        const existing = map.get(c.parentId) ?? [];
        existing.push(c);
        map.set(c.parentId, existing);
      }
    }

    return { rootComments: roots, replyMap: map };
  }, [allComments]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleTopicLike = useCallback(async () => {
    if (!topic) return;
    try {
      const res = await api.toggleForumLike({
        target_type: 'topic',
        target_id: topic.id,
      });
      queryClient.setQueryData(
        ['forumTopic', topicId],
        (old: typeof data) =>
          old
            ? {
                ...old,
                topic: {
                  ...old.topic,
                  likeCount: res.like_count,
                  liked: res.liked,
                },
              }
            : old,
      );
    } catch {
      // silently fail
    }
  }, [topic, topicId, queryClient, data]);

  const handleCommentLike = useCallback(
    async (commentId: string) => {
      try {
        const res = await api.toggleForumLike({
          target_type: 'comment',
          target_id: commentId,
        });
        queryClient.setQueryData(
          ['forumTopic', topicId],
          (old: typeof data) =>
            old
              ? {
                  ...old,
                  comments: old.comments.map((c) =>
                    c.id === commentId
                      ? { ...c, likeCount: res.like_count, liked: res.liked }
                      : c,
                  ),
                }
              : old,
        );
      } catch {
        // silently fail
      }
    },
    [topicId, queryClient, data],
  );

  const handleReply = useCallback(
    (commentId: string) => {
      const comment = allComments.find((c) => c.id === commentId);
      if (comment) {
        setReplyTo({ id: comment.id, authorNickname: comment.authorNickname });
      }
    },
    [allComments],
  );

  const handleCommentReport = useCallback((commentId: string) => {
    setReportTarget({ type: 'comment', id: commentId });
  }, []);

  const handleSubmitComment = useCallback(
    async (body: string, parentId?: string) => {
      setCommentLoading(true);
      try {
        await api.createForumComment(topicId, {
          body,
          parent_id: parentId,
        });
        setReplyTo(null);
        await refetch();
      } catch {
        // silently fail
      } finally {
        setCommentLoading(false);
      }
    },
    [topicId, refetch],
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff007f" />
        </View>
      </SafeAreaView>
    );
  }

  if (!topic) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.notFoundText}>Topic not found.</Text>
          <Pressable onPress={() => navigation.goBack()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const categoryColor = CATEGORY_COLORS[topic.category] ?? '#8888aa';
  const authorDisplay = topic.isAnonymous
    ? 'Anonymous'
    : topic.authorNickname ?? 'Anonymous';
  const canComment = !topic.isLocked && !isBanned;

  const renderComment = ({ item }: { item: ForumComment }) => (
    <CommentThread
      comment={item}
      depth={0}
      onLike={handleCommentLike}
      onReply={handleReply}
      onReport={handleCommentReport}
      replies={replyMap.get(item.id)}
    />
  );

  const ListHeader = (
    <View>
      {/* Topic card */}
      <View style={styles.topicCard}>
        {/* Indicators */}
        <View style={styles.indicatorRow}>
          {topic.isPinned && <Pin size={12} color="#ffd700" fill="#ffd700" />}
          {topic.isLocked && <Lock size={12} color="#8888aa" />}
          <Badge text={topic.category} color={categoryColor} size="sm" />
          <Text style={styles.topicMeta}>
            {topic.topBadgeIcon ? `${topic.topBadgeIcon} ` : ''}
            {authorDisplay}
          </Text>
          <Text style={styles.topicMeta}>
            {relativeTime(topic.createdAt)}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.topicTitle}>{topic.title}</Text>

        {/* Body */}
        <Text style={styles.topicBody}>{topic.body}</Text>

        {/* Actions */}
        <View style={styles.topicActions}>
          <Pressable
            onPress={handleTopicLike}
            style={styles.topicActionBtn}
            hitSlop={8}
          >
            <Heart
              size={16}
              color={topic.liked ? '#ff007f' : '#8888aa'}
              fill={topic.liked ? '#ff007f' : 'none'}
            />
            <Text
              style={[
                styles.topicActionText,
                topic.liked && styles.topicActionTextActive,
              ]}
            >
              {topic.likeCount}
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setReportTarget({ type: 'topic', id: topic.id })
            }
            style={styles.topicActionBtn}
            hitSlop={8}
          >
            <Flag size={14} color="#8888aa" />
            <Text style={styles.topicActionText}>Report</Text>
          </Pressable>
        </View>
      </View>

      {/* Locked banner */}
      {topic.isLocked && (
        <View style={styles.lockedBanner}>
          <Lock size={14} color="#8888aa" />
          <Text style={styles.lockedText}>This topic is locked</Text>
        </View>
      )}

      {/* Comments header */}
      <View style={styles.commentsHeader}>
        <Text style={styles.commentsHeaderText}>
          Comments ({allComments.length})
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Navigation header */}
        <View style={styles.navHeader}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={12}
          >
            <ArrowLeft size={20} color="#e0e0e0" />
          </Pressable>
          <Text style={styles.navTitle} numberOfLines={1}>
            {topic.title}
          </Text>
          <View style={styles.backButton} />
        </View>

        {/* Comments list */}
        <FlatList
          data={rootComments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.noCommentsText}>No comments yet.</Text>
          }
        />

        {/* Comment input */}
        {canComment && (
          <CommentInput
            onSubmit={handleSubmitComment}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            loading={commentLoading}
          />
        )}

        {/* Report modal */}
        {reportTarget && (
          <ReportModal
            visible
            onClose={() => setReportTarget(null)}
            targetType={reportTarget.type}
            targetId={reportTarget.id}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    color: '#8888aa',
    fontSize: 15,
    marginBottom: 12,
  },
  backLink: {
    paddingVertical: 8,
  },
  backLinkText: {
    color: '#ff007f',
    fontSize: 14,
    fontWeight: '500',
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    flex: 1,
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  topicCard: {
    backgroundColor: '#12121a',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  topicMeta: {
    color: '#606070',
    fontSize: 11,
  },
  topicTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  topicBody: {
    color: '#c0c0d0',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  topicActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
  },
  topicActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  topicActionText: {
    color: '#8888aa',
    fontSize: 13,
    fontWeight: '500',
  },
  topicActionTextActive: {
    color: '#ff007f',
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#12121a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  lockedText: {
    color: '#8888aa',
    fontSize: 13,
  },
  commentsHeader: {
    marginBottom: 8,
  },
  commentsHeaderText: {
    color: '#a0a0b0',
    fontSize: 14,
    fontWeight: '600',
  },
  noCommentsText: {
    color: '#606070',
    fontSize: 13,
    paddingVertical: 16,
  },
});
