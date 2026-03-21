import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { api } from '../../services/api';
import type { CityInsights } from '../../types';
import { colors, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

interface CityInsightsModalProps {
  cityId: number | null;
  visible: boolean;
  onClose: () => void;
}

type GenderFilter = 'all' | 'female' | 'male';

function fmtRating(val: number | null): string {
  return val !== null ? val.toFixed(1) : '--';
}

function RatingBox({
  label,
  value,
  emoji,
  color,
}: {
  label: string;
  value: number | null;
  emoji: string;
  color: string;
}) {
  return (
    <View style={[styles.ratingBox, { borderColor: `${color}40` }]}>
      <Text style={styles.ratingEmoji}>{emoji}</Text>
      <Text style={[styles.ratingValue, { color }]}>{fmtRating(value)}</Text>
      <Text style={styles.ratingLabel}>{label}</Text>
    </View>
  );
}

function TopListSection({
  title,
  items,
  color,
}: {
  title: string;
  items: Array<{ name: string; count: number }>;
  color: string;
}) {
  if (items.length === 0) return null;
  const max = items[0]?.count ?? 1;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item, i) => (
        <View key={item.name} style={styles.topListItem}>
          <View
            style={[
              styles.topListBar,
              {
                width: `${(item.count / max) * 100}%`,
                backgroundColor: `${color}15`,
              },
            ]}
          />
          <Text style={styles.topListRank}>{i + 1}.</Text>
          <Text style={styles.topListName}>{item.name}</Text>
          <Text style={styles.topListCount}>{item.count}</Text>
        </View>
      ))}
    </View>
  );
}

function GenderColumn({
  label,
  count,
  avgRating,
  avgFace,
  avgBody,
  avgChat,
  color,
}: {
  label: string;
  count: number;
  avgRating: number | null;
  avgFace: number | null;
  avgBody: number | null;
  avgChat: number | null;
  color: string;
}) {
  return (
    <View style={[styles.genderColumn, { borderColor: `${color}30` }]}>
      <View style={styles.genderHeader}>
        <Text style={[styles.genderLabel, { color }]}>{label}</Text>
        <Text style={[styles.genderCount, { color }]}>{count}</Text>
      </View>
      <View style={styles.genderRow}>
        <Text style={styles.genderStatLabel}>Avg</Text>
        <Text style={[styles.genderStatValue, { color }]}>
          {fmtRating(avgRating)}
        </Text>
      </View>
      <View style={styles.genderRow}>
        <Text style={styles.genderStatLabel}>Face</Text>
        <Text style={[styles.genderStatValue, { color }]}>
          {fmtRating(avgFace)}
        </Text>
      </View>
      <View style={styles.genderRow}>
        <Text style={styles.genderStatLabel}>Body</Text>
        <Text style={[styles.genderStatValue, { color }]}>
          {fmtRating(avgBody)}
        </Text>
      </View>
      <View style={styles.genderRow}>
        <Text style={styles.genderStatLabel}>Chat</Text>
        <Text style={[styles.genderStatValue, { color }]}>
          {fmtRating(avgChat)}
        </Text>
      </View>
    </View>
  );
}

export const CityInsightsModal: React.FC<CityInsightsModalProps> = ({
  cityId,
  visible,
  onClose,
}) => {
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const [data, setData] = useState<CityInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');

  useEffect(() => {
    if (!visible || !cityId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setData(null);

    api
      .getCityInsights(cityId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to load insights');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, cityId, genderFilter]);

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
      setGenderFilter('all');
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

  const snapPoints = React.useMemo(() => ['50%', '85%'], []);

  if (!visible) return null;

  const genderFilters: Array<{ key: GenderFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'female', label: 'Female' },
    { key: 'male', label: 'Male' },
  ];

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
          {/* Gender filter chips */}
          <View style={styles.filterRow}>
            {genderFilters.map(({ key, label }) => {
              const isActive = genderFilter === key;
              const chipColor =
                key === 'female'
                  ? colors.neon.pink
                  : key === 'male'
                    ? colors.neon.blue
                    : colors.neon.pink;
              return (
                <Pressable
                  key={key}
                  onPress={() => setGenderFilter(key)}
                  style={[
                    styles.filterChip,
                    isActive && {
                      backgroundColor: `${chipColor}20`,
                      borderColor: `${chipColor}50`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive && { color: chipColor },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loading && (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.neon.pink} />
            </View>
          )}

          {error && (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {data && data.totalDates < 5 && (
            <View style={styles.centerBox}>
              <Text style={styles.emptyEmoji}>📍</Text>
              <Text style={styles.emptyText}>
                Not enough data yet (minimum 5 dates required)
              </Text>
            </View>
          )}

          {data && data.totalDates >= 5 && (
            <>
              {/* Total dates */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total dates:</Text>
                <Text style={styles.totalValue}>{data.totalDates}</Text>
              </View>

              {/* Ratings grid */}
              <View style={styles.ratingsGrid}>
                <RatingBox
                  label="Overall"
                  value={data.avgRating}
                  emoji="⭐"
                  color={colors.neon.yellow}
                />
                <RatingBox
                  label="Face"
                  value={data.avgFace}
                  emoji="😊"
                  color={colors.neon.pink}
                />
                <RatingBox
                  label="Body"
                  value={data.avgBody}
                  emoji="💪"
                  color="#fb923c"
                />
                <RatingBox
                  label="Chat"
                  value={data.avgChat}
                  emoji="💬"
                  color={colors.neon.blue}
                />
              </View>

              {/* Gender breakdown */}
              {genderFilter === 'all' && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Gender Breakdown</Text>
                  <View style={styles.genderRow2}>
                    <GenderColumn
                      label="Female"
                      count={data.genderBreakdown.femaleCount}
                      avgRating={data.genderBreakdown.avgRatingFemale}
                      avgFace={data.genderBreakdown.avgFaceFemale}
                      avgBody={data.genderBreakdown.avgBodyFemale}
                      avgChat={data.genderBreakdown.avgChatFemale}
                      color={colors.neon.pink}
                    />
                    <GenderColumn
                      label="Male"
                      count={data.genderBreakdown.maleCount}
                      avgRating={data.genderBreakdown.avgRatingMale}
                      avgFace={data.genderBreakdown.avgFaceMale}
                      avgBody={data.genderBreakdown.avgBodyMale}
                      avgChat={data.genderBreakdown.avgChatMale}
                      color={colors.neon.blue}
                    />
                  </View>
                </View>
              )}

              {/* Top lists */}
              <TopListSection
                title="Top Activities"
                items={data.topActivities}
                color={colors.neon.purple}
              />
              <TopListSection
                title="Top Venues"
                items={data.topVenues}
                color={colors.neon.pink}
              />
              <TopListSection
                title="Top Meetings"
                items={data.topMeetings}
                color={colors.neon.blue}
              />

              {/* Height distribution */}
              {data.heightDistribution.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Height Distribution</Text>
                  {data.heightDistribution.map((h) => {
                    const max = Math.max(
                      ...data.heightDistribution.map((x) => x.count),
                    );
                    return (
                      <View key={h.range} style={styles.barRow}>
                        <Text style={styles.barLabel}>{h.range}</Text>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                width: `${(h.count / max) * 100}%`,
                                backgroundColor: `${colors.neon.green}40`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.barCount}>{h.count}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Monthly trend */}
              {data.monthlyTrend.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Monthly Trend</Text>
                  {data.monthlyTrend.map((m) => {
                    const max = Math.max(
                      ...data.monthlyTrend.map((x) => x.count),
                    );
                    return (
                      <View key={m.month} style={styles.barRow}>
                        <Text style={styles.barLabel}>{m.month}</Text>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                width: `${(m.count / max) * 100}%`,
                                backgroundColor: `${colors.neon.pink}30`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.barCount}>{m.count}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
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
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
  },
  filterChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text.muted,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  errorText: {
    color: colors.neon.red,
    fontSize: fontSize.md,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  totalLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.md,
  },
  totalValue: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  ratingsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  ratingBox: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
  },
  ratingEmoji: {
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  ratingValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  ratingLabel: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  genderRow2: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  genderColumn: {
    flex: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    backgroundColor: colors.background.tertiary,
  },
  genderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  genderLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  genderCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  genderStatLabel: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
  },
  genderStatValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  topListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.sm,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: borderRadius.sm,
    marginBottom: 2,
  },
  topListBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: borderRadius.sm,
  },
  topListRank: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    width: 20,
  },
  topListName: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    flex: 1,
  },
  topListCount: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    fontVariant: ['tabular-nums'],
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  barLabel: {
    width: 70,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 14,
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.sm,
  },
  barCount: {
    width: 30,
    fontSize: fontSize.sm,
    color: colors.text.muted,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
