import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { City } from '../../types';
import { colors } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

interface CitySelectorProps {
  countryCode: string;
  value: number | null;
  onChange: (city: City) => void;
  cities: City[];
  onClose?: () => void;
}

export const CitySelector: React.FC<CitySelectorProps> = ({
  countryCode,
  value,
  onChange,
  cities,
  onClose,
}) => {
  const [search, setSearch] = useState('');

  const filteredCities = useMemo(() => {
    if (!search.trim()) return cities;
    const q = search.toLowerCase().trim();
    return cities.filter((c) => c.name.toLowerCase().includes(q));
  }, [cities, search]);

  const renderItem = ({ item }: { item: City }) => {
    const isSelected = item.id === value;
    return (
      <Pressable
        onPress={() => onChange(item)}
        style={[styles.cityItem, isSelected && styles.cityItemActive]}
      >
        <Text
          style={[
            styles.cityName,
            isSelected && styles.cityNameActive,
          ]}
        >
          {item.name}
        </Text>
        {isSelected && <Text style={styles.checkmark}>✓</Text>}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Select City</Text>
        {onClose && (
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search cities..."
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable
            onPress={() => setSearch('')}
            style={styles.clearButton}
            hitSlop={8}
          >
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* City list */}
      <FlatList
        data={filteredCities}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {cities.length === 0
                ? 'No cities available for this country'
                : 'No cities match your search'}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  closeText: {
    color: colors.neon.pink,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.md,
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.md,
    paddingVertical: spacing.sm + 4,
  },
  clearButton: {
    padding: spacing.xs,
  },
  clearText: {
    color: colors.text.muted,
    fontSize: fontSize.md,
  },
  list: {
    flex: 1,
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cityItemActive: {
    backgroundColor: `${colors.neon.pink}10`,
  },
  cityName: {
    color: colors.text.secondary,
    fontSize: fontSize.md,
  },
  cityNameActive: {
    color: colors.neon.pink,
    fontWeight: '600',
  },
  checkmark: {
    color: colors.neon.pink,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
});
