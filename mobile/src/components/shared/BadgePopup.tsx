import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Modal } from '../ui/Modal';
import { colors, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';
import type { Badge } from '../../types';

interface BadgePopupProps {
  badge: Badge | null;
  visible: boolean;
  onClose: () => void;
  /** Current user progress toward this badge (optional). */
  currentProgress?: number;
}

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

function tierLabel(tier: string): string {
  switch (tier) {
    case 'gold':
      return 'Gold';
    case 'silver':
      return 'Silver';
    default:
      return 'Bronze';
  }
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'dates':
      return 'Dates';
    case 'explore':
      return 'Explore';
    case 'social':
      return 'Social';
    case 'quality':
      return 'Quality';
    default:
      return category;
  }
}

function genderLabel(gender: string): string {
  switch (gender) {
    case 'male':
      return '\u2642 Male';
    case 'female':
      return '\u2640 Female';
    case 'lgbt':
      return '\uD83C\uDF08 LGBT';
    default:
      return 'All';
  }
}

export const BadgePopup: React.FC<BadgePopupProps> = ({
  badge,
  visible,
  onClose,
  currentProgress,
}) => {
  if (!badge) return null;

  const earned = badge.earned;
  const tColor = tierBorderColor(badge.tier);
  const progress = currentProgress ?? 0;
  const progressPct = badge.threshold > 0
    ? Math.min(progress / badge.threshold, 1)
    : 0;

  return (
    <Modal visible={visible} onClose={onClose} title="">
      <View style={styles.container}>
        {/* Large badge icon */}
        <View
          style={[
            styles.iconContainer,
            {
              borderColor: earned ? tColor : colors.border,
            },
            earned && neonGlow(tColor, 0.5),
          ]}
        >
          <Text style={[styles.icon, !earned && styles.iconLocked]}>
            {badge.icon}
          </Text>
        </View>

        {/* Badge name */}
        <Text style={styles.name}>{badge.name}</Text>

        {/* Tier + Category */}
        <View style={styles.tagRow}>
          <View style={[styles.tag, { borderColor: tColor }]}>
            <Text style={[styles.tagText, { color: tColor }]}>
              {tierLabel(badge.tier)}
            </Text>
          </View>
          <View style={[styles.tag, { borderColor: colors.neon.blue }]}>
            <Text style={[styles.tagText, { color: colors.neon.blue }]}>
              {categoryLabel(badge.category)}
            </Text>
          </View>
          <View style={[styles.tag, { borderColor: colors.neon.purple }]}>
            <Text style={[styles.tagText, { color: colors.neon.purple }]}>
              {genderLabel(badge.gender)}
            </Text>
          </View>
        </View>

        {/* Description */}
        <Text style={styles.description}>{badge.description}</Text>

        {/* Threshold info */}
        <View style={styles.thresholdRow}>
          <Text style={styles.thresholdLabel}>Threshold</Text>
          <Text style={styles.thresholdValue}>{badge.threshold}</Text>
        </View>

        {/* Earned date or progress */}
        {earned ? (
          <View style={styles.earnedContainer}>
            <Text style={styles.earnedLabel}>Earned</Text>
            <Text style={styles.earnedDate}>
              {badge.earnedAt
                ? new Date(badge.earnedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Unknown date'}
            </Text>
          </View>
        ) : (
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Progress</Text>
              <Text style={styles.progressText}>
                {progress}/{badge.threshold}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.round(progressPct * 100)}%` },
                ]}
              />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.tertiary,
    marginBottom: spacing.md,
  },
  icon: {
    fontSize: 40,
    lineHeight: 48,
  },
  iconLocked: {
    opacity: 0.35,
  },
  name: {
    color: colors.text.primary,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  tagRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tag: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  tagText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  description: {
    color: colors.text.secondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: spacing.sm,
  },
  thresholdLabel: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
  },
  thresholdValue: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  earnedContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(0,255,136,0.08)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,255,136,0.2)',
  },
  earnedLabel: {
    color: colors.neon.green,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  earnedDate: {
    color: colors.neon.green,
    fontSize: fontSize.sm,
  },
  progressContainer: {
    width: '100%',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
  },
  progressText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background.tertiary,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.neon.pink,
  },
});
