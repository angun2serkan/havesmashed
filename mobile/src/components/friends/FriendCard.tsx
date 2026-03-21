import React, { useCallback, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Trash2, Check, X } from 'lucide-react-native';
import type { Connection } from '../../types';
import { colors, neonShadow } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';
import { Button } from '../ui/Button';

interface FriendCardProps {
  connection: Connection;
  onPress?: (connection: Connection) => void;
  onAccept?: (connection: Connection) => void;
  onReject?: (connection: Connection) => void;
  onDelete?: (connection: Connection) => void;
}

export const FriendCard: React.FC<FriendCardProps> = ({
  connection,
  onPress,
  onAccept,
  onReject,
  onDelete,
}) => {
  const swipeableRef = useRef<Swipeable>(null);

  const isPending = connection.status === 'pending';
  const nickname = connection.friendNickname ?? 'Unknown';
  const connectedDate = new Date(connection.createdAt).toLocaleDateString();

  const renderRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
    ) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.5],
        extrapolate: 'clamp',
      });

      return (
        <Pressable
          onPress={() => {
            swipeableRef.current?.close();
            onDelete?.(connection);
          }}
          style={styles.deleteAction}
        >
          <Animated.View
            style={[styles.deleteContent, { transform: [{ scale }] }]}
          >
            <Trash2 size={20} color="#ffffff" />
            <Text style={styles.deleteText}>Delete</Text>
          </Animated.View>
        </Pressable>
      );
    },
    [connection, onDelete],
  );

  const content = (
    <View style={styles.card}>
      {/* Color dot */}
      <View
        style={[
          styles.colorDot,
          { backgroundColor: connection.color },
          neonShadow(connection.color),
        ]}
      />

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          {connection.topBadgeIcon && (
            <Text style={styles.badgeIcon}>{connection.topBadgeIcon}</Text>
          )}
          <Text style={styles.nickname} numberOfLines={1}>
            {nickname}
          </Text>
        </View>
        <View style={styles.statusRow}>
          {isPending ? (
            <Text style={styles.pendingText}>Wants to connect</Text>
          ) : (
            <>
              <View style={styles.connectedDot} />
              <Text style={styles.connectedText}>Connected</Text>
              <Text style={styles.dateText}>since {connectedDate}</Text>
            </>
          )}
        </View>
      </View>

      {/* Actions for pending */}
      {isPending && (
        <View style={styles.pendingActions}>
          <Button
            title="Accept"
            onPress={() => onAccept?.(connection)}
            size="sm"
            icon={<Check size={14} color="#ffffff" />}
          />
          <Button
            title=""
            onPress={() => onReject?.(connection)}
            size="sm"
            variant="ghost"
            icon={<X size={16} color={colors.text.muted} />}
          />
        </View>
      )}
    </View>
  );

  if (isPending) {
    return content;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      <Pressable
        onPress={() => onPress?.(connection)}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    padding: spacing.md,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: borderRadius.full,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  badgeIcon: {
    fontSize: fontSize.md,
  },
  nickname: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    flexShrink: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neon.green,
  },
  connectedText: {
    color: colors.neon.green,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  dateText: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
  },
  pendingText: {
    color: colors.neon.yellow,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  pendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deleteAction: {
    backgroundColor: colors.neon.red,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginLeft: spacing.sm,
  },
  deleteContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteText: {
    color: '#ffffff',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
