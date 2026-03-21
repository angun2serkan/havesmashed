import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { colors, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, layout, spacing } from '../../constants/layout';
import { api } from '../../services/api';
import { loadTags, getTagById } from '../../data/tags';
import { getCountryName } from '../../utils/countryNames';
import { useLogStore } from '../../stores/logStore';
import { Card } from '../../components/ui/Card';
import { Tag } from '../../components/ui/Tag';
import { DateCard } from '../../components/date/DateCard';
import type { DateEntry } from '../../types';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// -- Types -------------------------------------------------------------------

type SortOption = 'newest' | 'oldest' | 'highest' | 'lowest';
type GenderFilter = 'all' | 'male' | 'female' | 'other';

interface Filters {
  search: string;
  dateFrom: string;
  dateTo: string;
  gender: GenderFilter;
  minRating: number;
  maxRating: number;
  country: string;
  city: string;
  tagIds: number[];
  sort: SortOption;
}

const INITIAL_FILTERS: Filters = {
  search: '',
  dateFrom: '',
  dateTo: '',
  gender: 'all',
  minRating: 0,
  maxRating: 10,
  country: '',
  city: '',
  tagIds: [],
  sort: 'newest',
};

const GENDERS: { label: string; value: GenderFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Best Rated', value: 'highest' },
  { label: 'Lowest Rated', value: 'lowest' },
];

const RATING_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const PAGE_SIZE = 20;

// -- Tag categories for filter chips -----------------------------------------

const TAG_CATEGORIES = [
  'meeting',
  'venue',
  'activity',
  'physical_male',
  'physical_female',
  'face',
  'personality',
];

// -- Helpers -----------------------------------------------------------------

function matchesSearch(date: DateEntry, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const cityMatch = date.cityName.toLowerCase().includes(q);
  const countryMatch = getCountryName(date.countryCode).toLowerCase().includes(q);
  const descMatch = date.description?.toLowerCase().includes(q) ?? false;
  const nickMatch = date.personNickname?.toLowerCase().includes(q) ?? false;
  return cityMatch || countryMatch || descMatch || nickMatch;
}

function applyFilters(dates: DateEntry[], filters: Filters): DateEntry[] {
  let result = dates;

  if (filters.search) {
    result = result.filter((d) => matchesSearch(d, filters.search));
  }
  if (filters.dateFrom) {
    result = result.filter((d) => d.dateAt >= filters.dateFrom);
  }
  if (filters.dateTo) {
    result = result.filter((d) => d.dateAt <= filters.dateTo);
  }
  if (filters.gender !== 'all') {
    result = result.filter((d) => d.gender === filters.gender);
  }
  if (filters.minRating > 0) {
    result = result.filter((d) => d.rating >= filters.minRating);
  }
  if (filters.maxRating < 10) {
    result = result.filter((d) => d.rating <= filters.maxRating);
  }
  if (filters.country) {
    result = result.filter((d) => d.countryCode === filters.country);
  }
  if (filters.city) {
    result = result.filter((d) => d.cityName === filters.city);
  }
  if (filters.tagIds.length > 0) {
    const tagSet = new Set(filters.tagIds);
    result = result.filter((d) =>
      d.tagIds.some((tid) => tagSet.has(tid)),
    );
  }

  // Sort
  switch (filters.sort) {
    case 'newest':
      result = [...result].sort((a, b) => b.dateAt.localeCompare(a.dateAt));
      break;
    case 'oldest':
      result = [...result].sort((a, b) => a.dateAt.localeCompare(b.dateAt));
      break;
    case 'highest':
      result = [...result].sort((a, b) => b.rating - a.rating);
      break;
    case 'lowest':
      result = [...result].sort((a, b) => a.rating - b.rating);
      break;
  }

  return result;
}

function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.search !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.gender !== 'all' ||
    filters.minRating > 0 ||
    filters.maxRating < 10 ||
    filters.country !== '' ||
    filters.city !== '' ||
    filters.tagIds.length > 0
  );
}

// -- Component ---------------------------------------------------------------

export const DashboardScreen: React.FC = () => {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [allTags, setAllTags] = useState<
    Array<{ id: number; name: string; category: string }>
  >([]);

  const openDateForm = useLogStore((s) => s.openDateForm);
  const queryClient = useQueryClient();

  // Load tags on mount
  useEffect(() => {
    let cancelled = false;
    async function init() {
      await loadTags();
      if (!cancelled) {
        // Gather all tags from known categories
        const tags: Array<{ id: number; name: string; category: string }> = [];
        for (const cat of TAG_CATEGORIES) {
          const { getTagsByCategory } = await import('../../data/tags');
          const catTags = getTagsByCategory(cat);
          tags.push(...catTags);
        }
        setAllTags(tags);
        setTagsLoaded(true);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Infinite query for cursor-based pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['dates'],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const result = await api.getDates(pageParam, PAGE_SIZE);
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  // Flatten all pages into a single array
  const allDates = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.dates);
  }, [data]);

  // Sync to zustand store
  const setDates = useLogStore((s) => s.setDates);
  useEffect(() => {
    setDates(allDates);
  }, [allDates, setDates]);

  // Derive countries and cities from loaded data
  const countries = useMemo(() => {
    const codes = [...new Set(allDates.map((d) => d.countryCode))].sort();
    return codes.map((c) => ({ code: c, name: getCountryName(c) }));
  }, [allDates]);

  const cities = useMemo(() => {
    const citySet = new Set<string>();
    for (const d of allDates) {
      if (d.cityName && (!filters.country || d.countryCode === filters.country)) {
        citySet.add(d.cityName);
      }
    }
    return [...citySet].sort();
  }, [allDates, filters.country]);

  // Apply client-side filters and sort
  const filteredDates = useMemo(
    () => applyFilters(allDates, filters),
    [allDates, filters],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.gender !== 'all') count++;
    if (filters.minRating > 0 || filters.maxRating < 10) count++;
    if (filters.country) count++;
    if (filters.city) count++;
    if (filters.tagIds.length > 0) count++;
    return count;
  }, [filters]);

  // -- Callbacks -------------------------------------------------------------

  const updateFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        // Reset city when country changes
        if (key === 'country') {
          next.city = '';
        }
        return next;
      });
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, []);

  const toggleFilterPanel = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowFilters((prev) => !prev);
  }, []);

  const toggleTag = useCallback((tagId: number) => {
    setFilters((prev) => {
      const exists = prev.tagIds.includes(tagId);
      return {
        ...prev,
        tagIds: exists
          ? prev.tagIds.filter((id) => id !== tagId)
          : [...prev.tagIds, tagId],
      };
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    await queryClient.resetQueries({ queryKey: ['dates'] });
    refetch();
  }, [queryClient, refetch]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleDatePress = useCallback((_date: DateEntry) => {
    // Will navigate to detail screen once navigation is wired
    // For now this is a placeholder
  }, []);

  // -- Render helpers --------------------------------------------------------

  const renderHeader = () => (
    <View>
      {/* Stats Summary */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{filteredDates.length}</Text>
          <Text style={styles.statLabel}>
            {hasActiveFilters(filters)
              ? `of ${allDates.length}`
              : 'Total'}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {new Set(filteredDates.map((d) => d.countryCode)).size}
          </Text>
          <Text style={styles.statLabel}>Countries</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {new Set(filteredDates.map((d) => d.cityName)).size}
          </Text>
          <Text style={styles.statLabel}>Cities</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {filteredDates.length > 0
              ? (
                  filteredDates.reduce((sum, d) => sum + d.rating, 0) /
                  filteredDates.length
                ).toFixed(1)
              : '-'}
          </Text>
          <Text style={styles.statLabel}>Avg Rating</Text>
        </View>
      </View>

      {/* Sort Options */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.sortRow}
        contentContainerStyle={styles.sortContent}
      >
        {SORT_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => updateFilter('sort', opt.value)}
            style={[
              styles.sortChip,
              filters.sort === opt.value && styles.sortChipActive,
            ]}
          >
            <Text
              style={[
                styles.sortChipText,
                filters.sort === opt.value && styles.sortChipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Filter Panel */}
      {showFilters && (
        <View style={styles.filterPanel}>
          {/* Date Range */}
          <View style={styles.filterRow}>
            <View style={styles.filterHalf}>
              <Text style={styles.filterLabel}>From</Text>
              <TextInput
                style={styles.filterInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.text.muted}
                value={filters.dateFrom}
                onChangeText={(v) => updateFilter('dateFrom', v)}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>
            <View style={styles.filterHalf}>
              <Text style={styles.filterLabel}>To</Text>
              <TextInput
                style={styles.filterInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.text.muted}
                value={filters.dateTo}
                onChangeText={(v) => updateFilter('dateTo', v)}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>
          </View>

          {/* Gender Chips */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Gender</Text>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => (
                <Pressable
                  key={g.value}
                  onPress={() => updateFilter('gender', g.value)}
                  style={[
                    styles.chip,
                    filters.gender === g.value && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      filters.gender === g.value && styles.chipTextActive,
                    ]}
                  >
                    {g.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Rating Range */}
          <View style={styles.filterRow}>
            <View style={styles.filterHalf}>
              <Text style={styles.filterLabel}>Min Rating</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <View style={styles.chipRow}>
                  {RATING_VALUES.map((r) => (
                    <Pressable
                      key={`min-${r}`}
                      onPress={() => updateFilter('minRating', r)}
                      style={[
                        styles.ratingChip,
                        filters.minRating === r && styles.chipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.ratingChipText,
                          filters.minRating === r && styles.chipTextActive,
                        ]}
                      >
                        {r === 0 ? 'Any' : String(r)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View style={styles.filterHalf}>
              <Text style={styles.filterLabel}>Max Rating</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <View style={styles.chipRow}>
                  {RATING_VALUES.filter((r) => r > 0).map((r) => (
                    <Pressable
                      key={`max-${r}`}
                      onPress={() => updateFilter('maxRating', r)}
                      style={[
                        styles.ratingChip,
                        filters.maxRating === r && styles.chipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.ratingChipText,
                          filters.maxRating === r && styles.chipTextActive,
                        ]}
                      >
                        {String(r)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>

          {/* Country Dropdown (as scrollable chips for native) */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Country</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <View style={styles.chipRow}>
                <Pressable
                  onPress={() => updateFilter('country', '')}
                  style={[
                    styles.chip,
                    filters.country === '' && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      filters.country === '' && styles.chipTextActive,
                    ]}
                  >
                    All
                  </Text>
                </Pressable>
                {countries.map((c) => (
                  <Pressable
                    key={c.code}
                    onPress={() => updateFilter('country', c.code)}
                    style={[
                      styles.chip,
                      filters.country === c.code && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        filters.country === c.code && styles.chipTextActive,
                      ]}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* City Dropdown */}
          {cities.length > 0 && (
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>City</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => updateFilter('city', '')}
                    style={[
                      styles.chip,
                      filters.city === '' && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        filters.city === '' && styles.chipTextActive,
                      ]}
                    >
                      All
                    </Text>
                  </Pressable>
                  {cities.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => updateFilter('city', c)}
                      style={[
                        styles.chip,
                        filters.city === c && styles.chipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          filters.city === c && styles.chipTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Tag Filters */}
          {tagsLoaded && allTags.length > 0 && (
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Tags</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <View style={styles.chipRow}>
                  {allTags.map((tag) => (
                    <Tag
                      key={tag.id}
                      label={tag.name}
                      selected={filters.tagIds.includes(tag.id)}
                      onPress={() => toggleTag(tag.id)}
                      color={colors.neon.purple}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Clear Filters */}
          {hasActiveFilters(filters) && (
            <Pressable onPress={clearFilters} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Clear All Filters</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>{'\uD83D\uDCCD'}</Text>
        <Text style={styles.emptyTitle}>
          {hasActiveFilters(filters)
            ? 'No dates match your filters'
            : 'No dates yet'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {hasActiveFilters(filters)
            ? 'Try adjusting your filters or search terms'
            : 'Tap the + button to log your first date'}
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!isFetchingNextPage) return <View style={styles.listFooter} />;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.neon.pink} />
        <Text style={styles.footerText}>Loading more...</Text>
      </View>
    );
  };

  const renderDateItem = useCallback(
    ({ item }: { item: DateEntry }) => (
      <DateCard date={item} onPress={() => handleDatePress(item)} />
    ),
    [handleDatePress],
  );

  const keyExtractor = useCallback((item: DateEntry) => item.id, []);

  // -- Main Render -----------------------------------------------------------

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Dates</Text>
        <Pressable
          onPress={toggleFilterPanel}
          style={[
            styles.filterButton,
            (showFilters || hasActiveFilters(filters)) &&
              styles.filterButtonActive,
          ]}
        >
          <Text style={styles.filterIcon}>{'\u2699'}</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by city, country, description..."
          placeholderTextColor={colors.text.muted}
          value={filters.search}
          onChangeText={(v) => updateFilter('search', v)}
          returnKeyType="search"
          autoCorrect={false}
        />
        {filters.search.length > 0 && (
          <Pressable
            onPress={() => updateFilter('search', '')}
            hitSlop={8}
          >
            <Text style={styles.searchClear}>{'\u2715'}</Text>
          </Pressable>
        )}
      </View>

      {/* Date List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.neon.pink} />
          <Text style={styles.loadingText}>Loading your dates...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredDates}
          renderItem={renderDateItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isFetchingNextPage}
              onRefresh={handleRefresh}
              tintColor={colors.neon.pink}
              colors={[colors.neon.pink]}
              progressBackgroundColor={colors.background.secondary}
            />
          }
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={7}
        />
      )}

      {/* FAB - Add New Date */}
      <Pressable
        onPress={openDateForm}
        style={({ pressed }) => [
          styles.fab,
          neonGlow(colors.neon.pink, 0.8),
          pressed && styles.fabPressed,
        ]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
};

// -- Styles ------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background.primary,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    borderColor: colors.neon.pink,
    backgroundColor: `${colors.neon.pink}15`,
  },
  filterIcon: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.neon.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: layout.screenPadding,
    marginBottom: spacing.sm,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchIcon: {
    fontSize: fontSize.md,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.md,
    paddingVertical: 0,
  },
  searchClear: {
    color: colors.text.muted,
    fontSize: fontSize.md,
    padding: spacing.xs,
  },

  // Stats
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },

  // Sort
  sortRow: {
    marginBottom: spacing.md,
  },
  sortContent: {
    gap: spacing.sm,
  },
  sortChip: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: {
    backgroundColor: `${colors.neon.pink}20`,
    borderColor: colors.neon.pink,
  },
  sortChipText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  sortChipTextActive: {
    color: colors.neon.pink,
  },

  // Filter Panel
  filterPanel: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  filterSection: {
    marginBottom: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  filterHalf: {
    flex: 1,
  },
  filterLabel: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  filterInput: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text.primary,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    height: 38,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chip: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: `${colors.neon.pink}20`,
    borderColor: colors.neon.pink,
  },
  chipText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.neon.pink,
  },
  ratingChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 32,
    alignItems: 'center',
  },
  ratingChipText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  clearButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.neon.red,
    marginTop: spacing.xs,
  },
  clearButtonText: {
    color: colors.neon.red,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // List
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 100,
  },
  listFooter: {
    height: spacing.lg,
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  footerText: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.text.muted,
    fontSize: fontSize.md,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    color: colors.text.muted,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    right: layout.screenPadding,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.neon.pink,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.9,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
  },
});
