import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Heart, Reply, Flag } from 'lucide-react-native';
import type { ForumComment } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

interface CommentThreadProps {
  comment: ForumComment;
  depth: number;
  onLike: (commentId: string) => void;
  onReply: (commentId: string) => void;
  onReport: (commentId: string) => void;
  replies?: ForumComment[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export const CommentThread: React.FC<CommentThreadProps> = ({
  comment,
  depth,
  onLike,
  onReply,
  onReport,
  replies = [],
}) => {
  if (comment.deleted) {
    return (
      <View style={[styles.container, depth > 0 && styles.indented]}>
        <Text style={styles.deletedText}>[This comment has been deleted]</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, depth > 0 && styles.indented]}>
      {depth > 0 && <View style={styles.depthBorder} />}

      <View style={styles.commentBody}>
        {/* Header: author + time */}
        <View style={styles.headerRow}>
          <View style={styles.authorRow}>
            {comment.topBadgeIcon ? (
              <Text style={styles.badgeIcon}>{comment.topBadgeIcon}</Text>
            ) : null}
            <Text style={styles.authorName}>{comment.authorNickname}</Text>
          </View>
          <Text style={styles.timestamp}>{relativeTime(comment.createdAt)}</Text>
        </View>

        {/* Body */}
        <Text style={styles.body}>{comment.body}</Text>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => onLike(comment.id)}
            style={styles.actionButton}
            hitSlop={8}
          >
            <Heart
              size={13}
              color={comment.liked ? '#ff007f' : '#8888aa'}
              fill={comment.liked ? '#ff007f' : 'none'}
            />
            <Text
              style={[
                styles.actionText,
                comment.liked && styles.actionTextActive,
              ]}
            >
              {comment.likeCount}
            </Text>
          </Pressable>

          {depth < 2 && (
            <Pressable
              onPress={() => onReply(comment.id)}
              style={styles.actionButton}
              hitSlop={8}
            >
              <Reply size={13} color="#8888aa" />
              <Text style={styles.actionText}>Reply</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => onReport(comment.id)}
            style={styles.actionButton}
            hitSlop={8}
          >
            <Flag size={12} color="#8888aa" />
          </Pressable>
        </View>
      </View>

      {/* Nested replies */}
      {replies.map((reply) => (
        <CommentThread
          key={reply.id}
          comment={reply}
          depth={depth + 1}
          onLike={onLike}
          onReply={onReply}
          onReport={onReport}
        />
      ))}
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  indented: {
    marginLeft: 20,
    paddingLeft: 12,
  },
  depthBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#2a2a3e',
    borderRadius: 1,
  },
  commentBody: {
    paddingVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeIcon: {
    fontSize: 11,
    marginRight: 4,
  },
  authorName: {
    color: '#e0e0e0',
    fontSize: 12,
    fontWeight: '600',
  },
  timestamp: {
    color: '#606070',
    fontSize: 10,
  },
  body: {
    color: '#c0c0d0',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  actionText: {
    color: '#8888aa',
    fontSize: 11,
    fontWeight: '500',
  },
  actionTextActive: {
    color: '#ff007f',
  },
  deletedText: {
    color: '#606070',
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
});
