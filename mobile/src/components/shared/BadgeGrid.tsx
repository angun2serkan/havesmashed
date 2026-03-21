import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, spacing, layout } from '../../constants/layout';
import type { Badge } from '../../types';

interface BadgeGridProps {
  badges: Badge[];
  onBadgePress?: (badge: Badge) => void;
}

const COLUMN_COUNT = 3;
const GRID_GAP = spacing.sm;
const ITEM_WIDTH =
  (layout.screenWidth - layout.screenPadding * 2 - GRID_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

function tierBorderColor(tier: string): string {
  switch (tier) {
    case 'gold':
      return '#facc15';
    case 'silver':
      return '#94a3b8';
    default:
      return '#d97706';
  }
}

function tierGlowColor(tier: string): string {
  switch (tier) {
    case 'gold':
      return 'rgba(250,204,21,0.35)';
    case 'silver':
      return 'rgba(148,163,184,0.3)';
    default:
      return 'rgba(217,119,6,0.25)';
  }
}

function tierLabel(tier: string): string {
  switch (tier) {
    case 'gold':
      return 'GOLD';
    case 'silver':
      return 'SILVER';
    default:
      return 'BRONZE';
  }
}

function genderIndicator(gender: string): string | null {
  switch (gender) {
    case 'male':
      return '\u2642';
    case 'female':
      return '\u2640';
    case 'lgbt':
      return '\uD83C\uDF08';
    default:
      return null;
  }
}

function genderColor(gender: string): string {
  switch (gender) {
    case 'male':
      return colors.neon.blue;
    case 'female':
      return colors.neon.pink;
    case 'lgbt':
      return colors.neon.purple;
    default:
      return colors.text.muted;
  }
}

const BadgeItem: React.FC<{
  badge: Badge;
  onPress?: (badge: Badge) => void;
}> = React.memo(({ badge, onPress }) => {
  const earned = badge.earned;
  const borderColor = earned ? tierBorderColor(badge.tier) : colors.border;
  const indicator = genderIndicator(badge.gender);

  return (
    <Pressable
      onPress={() => onPress?.(badge)}
      style={({ pressed }) => [
        styles.badgeItem,
        {
          borderColor,
          width: ITEM_WIDTH,
        },
        earned && {
          shadowColor: tierGlowColor(badge.tier),
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 10,
          elevation: 8,
        },
        !earned && styles.lockedBadge,
        pressed && { opacity: 0.8 },
      ]}
    >
      {/* Tier label */}
      {earned && (
        <Text
          style={[
            styles.tierLabel,
            { color: tierBorderColor(badge.tier) },
          ]}
        >
          {tierLabel(badge.tier)}
        </Text>
      )}

      {/* Gender indicator */}
      {indicator && (
        <Text
          style={[
            styles.genderIndicator,
            { color: genderColor(badge.gender) },
            earned ? { left: 6 } : { right: 6 },
          ]}
        >
          {indicator}
        </Text>
      )}

      {/* Lock overlay */}
      {!earned && (
        <View style={styles.lockOverlay}>
          <Text style={styles.lockIcon}>{'\uD83D\uDD12'}</Text>
        </View>
      )}

      {/* Badge icon */}
      <Text
        style={[
          styles.badgeIcon,
          !earned && styles.badgeIconLocked,
        ]}
      >
        {badge.icon}
      </Text>

      {/* Badge name */}
      <Text
        style={[
          styles.badgeName,
          !earned && styles.badgeNameLocked,
        ]}
        numberOfLines={1}
      >
        {badge.name}
      </Text>

      {/* Earned date */}
      {earned && badge.earnedAt && (
        <Text style={styles.earnedDate}>
          {new Date(badge.earnedAt).toLocaleDateString()}
        </Text>
      )}
    </Pressable>
  );
});

BadgeItem.displayName = 'BadgeItem';

export const BadgeGrid: React.FC<BadgeGridProps> = ({ badges, onBadgePress }) => {
  if (badges.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No badges yet</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={badges}
      keyExtractor={(item) => String(item.id)}
      numColumns={COLUMN_COUNT}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.grid}
      renderItem={({ item }) => (
        <BadgeItem badge={item} onPress={onBadgePress} />
      )}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  grid: {
    paddingBottom: spacing.sm,
  },
  row: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  badgeItem: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: ITEM_WIDTH * 1.1,
    position: 'relative',
  },
  lockedBadge: {
    opacity: 0.4,
    backgroundColor: colors.background.primary,
  },
  tierLabel: {
    position: 'absolute',
    top: 4,
    right: 4,
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  genderIndicator: {
    position: 'absolute',
    top: 5,
    fontSize: 9,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  lockIcon: {
    fontSize: 18,
    opacity: 0.6,
  },
  badgeIcon: {
    fontSize: 28,
    lineHeight: 34,
    marginBottom: spacing.xs,
  },
  badgeIconLocked: {
    opacity: 0.3,
  },
  badgeName: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  badgeNameLocked: {
    color: colors.text.muted,
  },
  earnedDate: {
    color: colors.text.muted,
    fontSize: 8,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: fontSize.md,
  },
});
