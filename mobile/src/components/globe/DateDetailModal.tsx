import React, { useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import type { DateEntry } from '../../types';
import { colors, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';
import { Button } from '../ui/Button';

interface DateDetailModalProps {
  date: DateEntry | null;
  visible: boolean;
  onClose: () => void;
  onEdit?: (date: DateEntry) => void;
  onDelete?: (id: string) => void;
  isOwn?: boolean;
  ownerNickname?: string;
  ownerColor?: string;
}

function fmtRating(val: number | null): string {
  return val !== null ? val.toFixed(1) : '--';
}

function RatingPill({
  emoji,
  label,
  value,
  color,
}: {
  emoji: string;
  label: string;
  value: number | null;
  color: string;
}) {
  if (value === null) return null;
  return (
    <View style={[styles.ratingPill, { borderColor: `${color}40` }]}>
      <Text style={styles.ratingPillEmoji}>{emoji}</Text>
      <Text style={[styles.ratingPillText, { color }]}>
        {label}: {value}
      </Text>
    </View>
  );
}

export const DateDetailModal: React.FC<DateDetailModalProps> = ({
  date,
  visible,
  onClose,
  onEdit,
  onDelete,
  isOwn = true,
  ownerNickname = 'You',
  ownerColor = colors.neon.pink,
}) => {
  const bottomSheetRef = React.useRef<BottomSheet>(null);

  React.useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose],
  );

  const snapPoints = React.useMemo(() => ['45%', '75%'], []);

  if (!visible || !date) return null;

  const genderLabel =
    date.gender === 'male'
      ? 'Male'
      : date.gender === 'female'
        ? 'Female'
        : 'Other';

  const formattedDate = new Date(date.dateAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const location = [date.cityName, date.countryCode].filter(Boolean).join(', ');

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onChange={handleSheetChange}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.sheetContent}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header: owner + location */}
          <View
            style={[
              styles.headerCard,
              { borderLeftColor: ownerColor, backgroundColor: `${ownerColor}10` },
            ]}
          >
            <Text style={[styles.ownerName, { color: ownerColor }]}>
              {ownerNickname}
            </Text>
            <Text style={styles.locationText}>{location}</Text>
          </View>

          {/* Info row */}
          <View style={styles.infoRow}>
            <View style={styles.infoPill}>
              <Text style={styles.infoEmoji}>👤</Text>
              <Text style={styles.infoText}>{genderLabel}</Text>
            </View>
            <View style={styles.infoPill}>
              <Text style={styles.infoText}>{date.ageRange}</Text>
            </View>
            {date.heightRange && (
              <View style={styles.infoPill}>
                <Text style={styles.infoEmoji}>📏</Text>
                <Text style={styles.infoText}>{date.heightRange} cm</Text>
              </View>
            )}
            {date.personNickname && (
              <View style={styles.infoPill}>
                <Text style={styles.infoText}>"{date.personNickname}"</Text>
              </View>
            )}
          </View>

          {/* Ratings */}
          <View style={styles.ratingsRow}>
            <RatingPill
              emoji="😊"
              label="Face"
              value={date.faceRating}
              color={colors.neon.pink}
            />
            <RatingPill
              emoji="💪"
              label="Body"
              value={date.bodyRating}
              color="#fb923c"
            />
            <RatingPill
              emoji="💬"
              label="Chat"
              value={date.chatRating}
              color={colors.neon.blue}
            />
            <View
              style={[
                styles.ratingPill,
                { borderColor: `${colors.neon.yellow}40` },
              ]}
            >
              <Text style={styles.ratingPillEmoji}>⭐</Text>
              <Text style={[styles.ratingPillText, { color: colors.neon.yellow }]}>
                Overall: {date.rating}
              </Text>
            </View>
          </View>

          {/* Tags */}
          {date.tagIds.length > 0 && (
            <View style={styles.tagsRow}>
              {date.tagIds.map((tagId) => (
                <View key={tagId} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{tagId}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Description */}
          {date.description ? (
            <View style={styles.descriptionBox}>
              <Text style={styles.descriptionText}>{date.description}</Text>
            </View>
          ) : null}

          {/* Date */}
          <View style={styles.dateRow}>
            <Text style={styles.dateEmoji}>📅</Text>
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>

          {/* Actions (own dates only) */}
          {isOwn && (
            <View style={styles.actionRow}>
              <View style={styles.actionButton}>
                <Button
                  title="Edit"
                  variant="secondary"
                  size="sm"
                  onPress={() => onEdit?.(date)}
                />
              </View>
              <View style={styles.actionButton}>
                <Button
                  title="Delete"
                  variant="danger"
                  size="sm"
                  onPress={() => onDelete?.(date.id)}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  handleIndicator: {
    backgroundColor: colors.text.muted,
    width: 40,
  },
  sheetContent: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerCard: {
    borderLeftWidth: 3,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  ownerName: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  locationText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoEmoji: {
    fontSize: 13,
  },
  infoText: {
    fontSize: fontSize.md,
    color: colors.text.secondary,
  },
  ratingsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  ratingPillEmoji: {
    fontSize: 11,
  },
  ratingPillText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  tagChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  descriptionBox: {
    backgroundColor: `${colors.background.tertiary}80`,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  descriptionText: {
    fontSize: fontSize.md,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  dateEmoji: {
    fontSize: 13,
  },
  dateText: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
