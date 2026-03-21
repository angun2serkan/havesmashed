import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Connection } from '../../types';
import { colors, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

interface GlobeFilterBarProps {
  activeFilter: string; // 'mine' | 'all' | friend UUID
  onFilterChange: (filter: string) => void;
  connections: Connection[];
  currentUserId?: string;
}

interface FilterChip {
  key: string;
  label: string;
  color: string;
}

export const GlobeFilterBar: React.FC<GlobeFilterBarProps> = ({
  activeFilter,
  onFilterChange,
  connections,
  currentUserId,
}) => {
  const chips: FilterChip[] = React.useMemo(() => {
    const list: FilterChip[] = [
      { key: 'mine', label: 'My Dates', color: colors.neon.pink },
      { key: 'all', label: 'All Friends', color: colors.neon.blue },
    ];

    const accepted = connections.filter((c) => c.status === 'accepted');
    for (const conn of accepted) {
      const friendId =
        conn.requesterId === currentUserId
          ? conn.responderId
          : conn.requesterId;
      list.push({
        key: friendId,
        label: conn.friendNickname || 'Anonim',
        color: conn.color || '#FF5733',
      });
    }

    return list;
  }, [connections, currentUserId]);

  const renderChip = ({ item }: { item: FilterChip }) => {
    const isActive = activeFilter === item.key;

    return (
      <Pressable
        onPress={() => onFilterChange(item.key)}
        style={[
          styles.chip,
          isActive
            ? [styles.chipActive, { backgroundColor: item.color }]
            : { borderColor: item.color },
          isActive && neonGlow(item.color, 0.4),
        ]}
      >
        {!isActive && (
          <View style={[styles.dot, { backgroundColor: item.color }]} />
        )}
        <Text
          style={[
            styles.chipText,
            isActive ? styles.chipTextActive : { color: item.color },
          ]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={chips}
        renderItem={renderChip}
        keyExtractor={(item) => item.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 44,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  chipActive: {
    borderWidth: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs + 2,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    maxWidth: 100,
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
