import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLogStore } from '../../stores/logStore';
import { colors, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

interface StatCard {
  key: string;
  emoji: string;
  value: string;
  label: string;
  color: string;
}

function fmtAvg(val: number | null): string {
  return val !== null ? val.toFixed(1) : '--';
}

function StatCardItem({ item }: { item: StatCard }) {
  return (
    <View style={[styles.card, neonGlow(item.color, 0.2)]}>
      {/* Ambient glow */}
      <View
        style={[styles.cardGlow, { backgroundColor: item.color }]}
      />
      <Text style={styles.cardEmoji}>{item.emoji}</Text>
      <Text style={[styles.cardValue, { textShadowColor: `${item.color}40` }]}>
        {item.value}
      </Text>
      <Text style={styles.cardLabel}>{item.label}</Text>
    </View>
  );
}

export const StatsCards: React.FC = () => {
  const stats = useLogStore((s) => s.stats);

  const cards: StatCard[] = [
    {
      key: 'total',
      emoji: '📍',
      value: String(stats.totalDates),
      label: 'Total Dates',
      color: colors.neon.pink,
    },
    {
      key: 'avgRating',
      emoji: '⭐',
      value: fmtAvg(stats.averageRating),
      label: 'Avg Rating',
      color: colors.neon.yellow,
    },
    {
      key: 'countries',
      emoji: '🏳️',
      value: String(stats.uniqueCountries),
      label: 'Countries',
      color: colors.neon.blue,
    },
    {
      key: 'cities',
      emoji: '🌍',
      value: String(stats.uniqueCities),
      label: 'Cities',
      color: colors.neon.purple,
    },
    {
      key: 'streak',
      emoji: '🔥',
      value: String(stats.currentStreak),
      label: 'Current Streak',
      color: '#fb923c',
    },
    {
      key: 'longest',
      emoji: '🏆',
      value: String(stats.longestStreak),
      label: 'Longest Streak',
      color: colors.neon.green,
    },
  ];

  const renderItem = ({ item }: { item: StatCard }) => (
    <StatCardItem item={item} />
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={cards}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        snapToInterval={136}
        decelerationRate="fast"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 110,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  card: {
    width: 120,
    height: 100,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  cardGlow: {
    position: 'absolute',
    bottom: -20,
    left: '50%',
    width: 60,
    height: 60,
    borderRadius: 30,
    opacity: 0.1,
    transform: [{ translateX: -30 }],
  },
  cardEmoji: {
    fontSize: 18,
    marginBottom: spacing.xs,
  },
  cardValue: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  cardLabel: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
    marginTop: 2,
  },
});
