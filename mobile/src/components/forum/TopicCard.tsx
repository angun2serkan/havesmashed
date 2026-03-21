import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Heart, MessageCircle, Pin, Lock } from 'lucide-react-native';
import type { ForumTopic } from '../../types';
import { Badge } from '../ui/Badge';

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

// ─── Props ───────────────────────────────────────────────────────────────────

interface TopicCardProps {
  topic: ForumTopic;
  onPress: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const TopicCard: React.FC<TopicCardProps> = ({ topic, onPress }) => {
  const categoryColor = CATEGORY_COLORS[topic.category] ?? '#8888aa';
  const authorDisplay = topic.isAnonymous
    ? 'Anonymous'
    : topic.authorNickname ?? 'Anonymous';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* Left: like column */}
      <View style={styles.likeColumn}>
        <Heart
          size={16}
          color={topic.liked ? '#ff007f' : '#8888aa'}
          fill={topic.liked ? '#ff007f' : 'none'}
        />
        <Text style={[styles.likeCount, topic.liked && styles.likeCountActive]}>
          {topic.likeCount}
        </Text>
      </View>

      {/* Center: content */}
      <View style={styles.content}>
        {/* Indicators row */}
        <View style={styles.indicatorRow}>
          {topic.isPinned && (
            <View style={styles.indicator}>
              <Pin size={10} color="#ffd700" fill="#ffd700" />
            </View>
          )}
          {topic.isLocked && (
            <View style={styles.indicator}>
              <Lock size={10} color="#8888aa" />
            </View>
          )}
          <Badge text={topic.category} color={categoryColor} size="sm" />
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={1}>
          {topic.title}
        </Text>

        {/* Body preview */}
        {topic.bodyPreview ? (
          <Text style={styles.preview} numberOfLines={2}>
            {topic.bodyPreview}
          </Text>
        ) : null}

        {/* Author */}
        <View style={styles.metaRow}>
          {topic.topBadgeIcon ? (
            <Text style={styles.badgeIcon}>{topic.topBadgeIcon}</Text>
          ) : null}
          <Text style={styles.author}>{authorDisplay}</Text>
        </View>
      </View>

      {/* Right: comment count + time */}
      <View style={styles.rightColumn}>
        <View style={styles.commentBubble}>
          <MessageCircle size={12} color="#8888aa" />
          <Text style={styles.commentCount}>{topic.commentCount}</Text>
        </View>
        <Text style={styles.time}>{relativeTime(topic.createdAt)}</Text>
      </View>
    </Pressable>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#12121a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    marginBottom: 10,
  },
  cardPressed: {
    opacity: 0.85,
    backgroundColor: '#1a1a2e',
  },
  likeColumn: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 32,
    paddingTop: 2,
    marginRight: 10,
  },
  likeCount: {
    color: '#8888aa',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  likeCountActive: {
    color: '#ff007f',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  indicator: {
    marginRight: 2,
  },
  title: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  preview: {
    color: '#8888aa',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeIcon: {
    fontSize: 11,
    marginRight: 3,
  },
  author: {
    color: '#606070',
    fontSize: 11,
  },
  rightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginLeft: 10,
    paddingVertical: 2,
  },
  commentBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  commentCount: {
    color: '#8888aa',
    fontSize: 11,
    fontWeight: '500',
  },
  time: {
    color: '#606070',
    fontSize: 10,
  },
});
