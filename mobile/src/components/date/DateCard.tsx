import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';
import { getTagById } from '../../data/tags';
import { getCountryName } from '../../utils/countryNames';
import type { DateEntry } from '../../types';

interface DateCardProps {
  date: DateEntry;
  onPress: () => void;
}

const GENDER_ICONS: Record<string, string> = {
  female: '\u2640',
  male: '\u2642',
  other: '\u26A5',
};

const MAX_VISIBLE_TAGS = 4;

function getRatingAccent(rating: number): string {
  if (rating >= 8) return colors.neon.green;
  if (rating >= 5) return colors.neon.yellow;
  return colors.neon.red;
}

function getTagColor(category: string): string {
  switch (category) {
    case 'meeting':
      return colors.neon.blue;
    case 'venue':
      return colors.neon.pink;
    case 'activity':
      return colors.neon.purple;
    default:
      return colors.neon.yellow;
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function renderStars(rating: number): string {
  const filled = Math.round(rating / 2);
  const empty = 5 - filled;
  return '\u2605'.repeat(filled) + '\u2606'.repeat(empty);
}

export const DateCard: React.FC<DateCardProps> = ({ date, onPress }) => {
  const accent = getRatingAccent(date.rating);

  const tags = useMemo(() => {
    return date.tagIds
      .slice(0, MAX_VISIBLE_TAGS)
      .map((id) => getTagById(id))
      .filter(Boolean) as Array<{ id: number; name: string; category: string }>;
  }, [date.tagIds]);

  const remainingTagCount = Math.max(0, date.tagIds.length - MAX_VISIBLE_TAGS);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: accent },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.locationRow}>
          {date.personNickname ? (
            <Text style={styles.nickname} numberOfLines={1}>
              {date.personNickname}
            </Text>
          ) : null}
          <Text style={styles.location} numberOfLines={1}>
            {date.cityName}, {getCountryName(date.countryCode)}
          </Text>
        </View>
        <View style={styles.ratingContainer}>
          <Text style={[styles.ratingStars, { color: accent }]}>
            {renderStars(date.rating)}
          </Text>
          <Text style={[styles.ratingNumber, { color: accent }]}>
            {date.rating}/10
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.genderIcon}>{GENDER_ICONS[date.gender] ?? '?'}</Text>
        <Text style={styles.metaText}>{date.gender}</Text>
        <Text style={styles.metaSeparator}>{'\u00B7'}</Text>
        <Text style={styles.metaText}>{date.ageRange}</Text>
        {date.heightRange && (
          <>
            <Text style={styles.metaSeparator}>{'\u00B7'}</Text>
            <Text style={styles.metaText}>{date.heightRange} cm</Text>
          </>
        )}
        <Text style={styles.metaSeparator}>{'\u00B7'}</Text>
        <Text style={styles.metaText}>{formatDate(date.dateAt)}</Text>
      </View>

      {date.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {date.description}
        </Text>
      ) : null}

      {tags.length > 0 && (
        <View style={styles.tagsRow}>
          {tags.map((tag) => {
            const tagColor = getTagColor(tag.category);
            return (
              <View
                key={tag.id}
                style={[
                  styles.tagPill,
                  { borderColor: tagColor, backgroundColor: `${tagColor}15` },
                ]}
              >
                <Text style={[styles.tagText, { color: tagColor }]}>
                  {tag.name}
                </Text>
              </View>
            );
          })}
          {remainingTagCount > 0 && (
            <View style={styles.tagMore}>
              <Text style={styles.tagMoreText}>+{remainingTagCount}</Text>
            </View>
          )}
        </View>
      )}

      {(date.faceRating !== null ||
        date.bodyRating !== null ||
        date.chatRating !== null) && (
        <View style={styles.subRatingsRow}>
          {date.faceRating !== null && (
            <View style={[styles.subRating, { backgroundColor: `${colors.neon.pink}15` }]}>
              <Text style={[styles.subRatingText, { color: colors.neon.pink }]}>
                {'\uD83D\uDE0A'} {date.faceRating}
              </Text>
            </View>
          )}
          {date.bodyRating !== null && (
            <View style={[styles.subRating, { backgroundColor: `${colors.neon.purple}15` }]}>
              <Text style={[styles.subRatingText, { color: colors.neon.purple }]}>
                {'\uD83D\uDCAA'} {date.bodyRating}
              </Text>
            </View>
          )}
          {date.chatRating !== null && (
            <View style={[styles.subRating, { backgroundColor: `${colors.neon.blue}15` }]}>
              <Text style={[styles.subRatingText, { color: colors.neon.blue }]}>
                {'\uD83D\uDCAC'} {date.chatRating}
              </Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    borderLeftWidth: 3,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs + 2,
  },
  locationRow: {
    flex: 1,
    marginRight: spacing.sm,
  },
  nickname: {
    color: colors.neon.pink,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: 2,
  },
  location: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  ratingContainer: {
    alignItems: 'flex-end',
  },
  ratingStars: {
    fontSize: fontSize.sm,
    letterSpacing: 1,
  },
  ratingNumber: {
    fontSize: fontSize.md,
    fontWeight: '700',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  genderIcon: {
    color: colors.text.secondary,
    fontSize: fontSize.md,
    marginRight: spacing.xs,
  },
  metaText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textTransform: 'capitalize',
  },
  metaSeparator: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    marginHorizontal: spacing.xs,
  },
  description: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
  },
  tagPill: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm + 2,
    marginRight: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  tagText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  tagMore: {
    borderRadius: borderRadius.full,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: colors.background.tertiary,
    marginBottom: spacing.xs,
  },
  tagMoreText: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  subRatingsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  subRating: {
    borderRadius: borderRadius.md,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  subRatingText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
