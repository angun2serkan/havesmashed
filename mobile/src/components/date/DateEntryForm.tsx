import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../../services/api';
import { useLogStore } from '../../stores/logStore';
import type { City, DateEntry } from '../../types';
import { colors, neonGlow } from '../../constants/colors';
import { borderRadius, fontSize, layout, spacing } from '../../constants/layout';
import { Button } from '../ui/Button';
import { CitySelector } from './CitySelector';

interface DateEntryFormProps {
  visible: boolean;
  onClose: () => void;
  editDate?: DateEntry;
}

type Gender = 'male' | 'female' | 'other';

const AGE_RANGES = [
  '18-20', '21-23', '24-26', '27-29', '30-32', '33-35',
  '36-40', '41-45', '46-50', '51-55', '56-60', '60+',
];

const HEIGHT_RANGES = [
  '150-155', '155-160', '160-165', '165-170', '170-175',
  '175-180', '180-185', '185-190', '190-195', '195-200', '200+',
];

const COUNTRIES = [
  { code: 'TR', name: 'Turkey' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GR', name: 'Greece' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'BE', name: 'Belgium' },
  { code: 'IE', name: 'Ireland' },
  { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'CN', name: 'China' },
  { code: 'TH', name: 'Thailand' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'CA', name: 'Canada' },
  { code: 'MX', name: 'Mexico' },
  { code: 'BR', name: 'Brazil' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CL', name: 'Chile' },
  { code: 'EG', name: 'Egypt' },
  { code: 'MA', name: 'Morocco' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'RS', name: 'Serbia' },
  { code: 'IL', name: 'Israel' },
].sort((a, b) => a.name.localeCompare(b.name));

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T | null;
  onChange: (val: T) => void;
  labels?: Record<T, string>;
}) {
  return (
    <View style={styles.chipGroup}>
      {options.map((opt) => {
        const isActive = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.chip,
              isActive && styles.chipActive,
              isActive && neonGlow(colors.neon.pink, 0.3),
            ]}
          >
            <Text
              style={[styles.chipText, isActive && styles.chipTextActive]}
            >
              {labels?.[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RatingSelector({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <View>
      <View style={styles.ratingHeader}>
        <Text style={styles.sectionLabel}>{label}</Text>
        <Text style={styles.ratingValue}>{value}/10</Text>
      </View>
      <View style={styles.ratingRow}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = n <= value;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              style={[styles.ratingBlock, active && styles.ratingBlockActive]}
            >
              <Text
                style={[
                  styles.ratingBlockText,
                  active && styles.ratingBlockTextActive,
                ]}
              >
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PickerDropdown<T extends string>({
  options,
  value,
  onChange,
  placeholder,
  labelFn,
}: {
  options: T[];
  value: T;
  onChange: (val: T) => void;
  placeholder: string;
  labelFn?: (val: T) => string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} style={styles.dropdownTrigger}>
        <Text
          style={[
            styles.dropdownText,
            !value && { color: colors.text.muted },
          ]}
        >
          {value ? (labelFn ? labelFn(value) : value) : placeholder}
        </Text>
        <Text style={styles.dropdownArrow}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <ScrollView style={styles.dropdownList} nestedScrollEnabled>
          {options.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => {
                onChange(opt);
                setOpen(false);
              }}
              style={[
                styles.dropdownItem,
                opt === value && styles.dropdownItemActive,
              ]}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  opt === value && styles.dropdownItemTextActive,
                ]}
              >
                {labelFn ? labelFn(opt) : opt}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export const DateEntryForm: React.FC<DateEntryFormProps> = ({
  visible,
  onClose,
  editDate,
}) => {
  const addDate = useLogStore((s) => s.addDate);
  const updateDateInStore = useLogStore((s) => s.updateDate);

  const [countryCode, setCountryCode] = useState(editDate?.countryCode ?? '');
  const [cityId, setCityId] = useState<number | null>(editDate?.cityId ?? null);
  const [cityName, setCityName] = useState(editDate?.cityName ?? '');
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [gender, setGender] = useState<Gender | null>(editDate?.gender ?? null);
  const [ageRange, setAgeRange] = useState(editDate?.ageRange ?? '');
  const [heightRange, setHeightRange] = useState(editDate?.heightRange ?? '');
  const [personNickname, setPersonNickname] = useState(
    editDate?.personNickname ?? '',
  );
  const [description, setDescription] = useState(editDate?.description ?? '');
  const [dateAt, setDateAt] = useState(
    editDate?.dateAt ?? new Date().toISOString().split('T')[0]!,
  );
  const [rating, setRating] = useState(editDate?.rating ?? 5);
  const [faceRating, setFaceRating] = useState(editDate?.faceRating ?? 5);
  const [bodyRating, setBodyRating] = useState(editDate?.bodyRating ?? 5);
  const [chatRating, setChatRating] = useState(editDate?.chatRating ?? 5);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(
    new Set(editDate?.tagIds ?? []),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCitySelector, setShowCitySelector] = useState(false);
  const [tags, setTags] = useState<
    Array<{ id: number; name: string; category: string }>
  >([]);

  // Load tags on mount
  useEffect(() => {
    if (visible) {
      api.getTags().then(setTags).catch(() => {});
    }
  }, [visible]);

  // Load cities when country changes
  useEffect(() => {
    if (!countryCode) {
      setCities([]);
      return;
    }
    setCitiesLoading(true);
    api
      .getCities(countryCode)
      .then((result) => {
        setCities(
          result.map((c: { id: number; name: string; country_code?: string; countryCode?: string; longitude: number; latitude: number }) => ({
            id: c.id,
            name: c.name,
            countryCode: c.country_code ?? c.countryCode ?? countryCode,
            longitude: c.longitude,
            latitude: c.latitude,
          })),
        );
      })
      .catch(() => setCities([]))
      .finally(() => setCitiesLoading(false));
  }, [countryCode]);

  // Pre-fill from editDate
  useEffect(() => {
    if (editDate) {
      setCountryCode(editDate.countryCode);
      setCityId(editDate.cityId);
      setCityName(editDate.cityName);
      setGender(editDate.gender);
      setAgeRange(editDate.ageRange);
      setHeightRange(editDate.heightRange ?? '');
      setPersonNickname(editDate.personNickname ?? '');
      setDescription(editDate.description ?? '');
      setDateAt(editDate.dateAt);
      setRating(editDate.rating);
      setFaceRating(editDate.faceRating ?? 5);
      setBodyRating(editDate.bodyRating ?? 5);
      setChatRating(editDate.chatRating ?? 5);
      setSelectedTagIds(new Set(editDate.tagIds));
    }
  }, [editDate]);

  const tagsByCategory = useMemo(() => {
    const map = new Map<string, Array<{ id: number; name: string }>>();
    for (const t of tags) {
      const existing = map.get(t.category) ?? [];
      existing.push(t);
      map.set(t.category, existing);
    }
    return map;
  }, [tags]);

  const toggleTag = useCallback((id: number) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const resetForm = useCallback(() => {
    setCountryCode('');
    setCityId(null);
    setCityName('');
    setGender(null);
    setAgeRange('');
    setHeightRange('');
    setPersonNickname('');
    setDescription('');
    setDateAt(new Date().toISOString().split('T')[0]!);
    setRating(5);
    setFaceRating(5);
    setBodyRating(5);
    setChatRating(5);
    setSelectedTagIds(new Set());
    setError(null);
  }, []);

  const handleSubmit = async () => {
    if (!countryCode || !cityId || !gender || !ageRange) {
      setError('Please fill in country, city, gender, and age range.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editDate) {
        await api.updateDate(editDate.id, {
          country_code: countryCode,
          city_id: cityId,
          gender,
          age_range: ageRange,
          height_range: heightRange || undefined,
          description: description.trim() || undefined,
          rating,
          date_at: dateAt,
          tag_ids: Array.from(selectedTagIds),
        });
        updateDateInStore(editDate.id, {
          countryCode,
          cityId,
          cityName,
          gender,
          ageRange,
          heightRange: heightRange || null,
          personNickname: personNickname.trim() || null,
          description: description.trim() || null,
          rating,
          faceRating,
          bodyRating,
          chatRating,
          dateAt,
          tagIds: Array.from(selectedTagIds),
        });
      } else {
        const { date: newDate } = await api.createDate({
          country_code: countryCode,
          city_id: cityId,
          gender,
          age_range: ageRange,
          height_range: heightRange || undefined,
          person_nickname: personNickname.trim() || undefined,
          description: description.trim() || undefined,
          rating,
          face_rating: faceRating,
          body_rating: bodyRating,
          chat_rating: chatRating,
          date_at: dateAt,
          tag_ids: Array.from(selectedTagIds),
        });
        addDate(newDate);
      }

      resetForm();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save date entry',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCitySelect = (city: City) => {
    setCityId(city.id);
    setCityName(city.name);
    setShowCitySelector(false);
  };

  const countryOptions = COUNTRIES.map((c) => c.code);
  const countryLabelFn = (code: string) =>
    COUNTRIES.find((c) => c.code === code)?.name ?? code;

  const renderTagSection = (category: string, title: string) => {
    const categoryTags = tagsByCategory.get(category) ?? [];
    if (categoryTags.length === 0) return null;

    return (
      <View key={category}>
        <SectionLabel>{title}</SectionLabel>
        <View style={styles.tagGrid}>
          {categoryTags.map((tag) => {
            const selected = selectedTagIds.has(tag.id);
            return (
              <Pressable
                key={tag.id}
                onPress={() => toggleTag(tag.id)}
                style={[styles.tagChip, selected && styles.tagChipActive]}
              >
                <Text
                  style={[
                    styles.tagChipText,
                    selected && styles.tagChipTextActive,
                  ]}
                >
                  {tag.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {editDate ? 'Edit Date' : 'New Date'}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Country */}
            <SectionLabel>Country</SectionLabel>
            <PickerDropdown
              options={countryOptions}
              value={countryCode}
              onChange={(code) => {
                setCountryCode(code);
                setCityId(null);
                setCityName('');
              }}
              placeholder="Select country"
              labelFn={countryLabelFn}
            />

            {/* City */}
            <SectionLabel>City</SectionLabel>
            {citiesLoading ? (
              <ActivityIndicator
                size="small"
                color={colors.neon.pink}
                style={{ alignSelf: 'flex-start', marginVertical: spacing.sm }}
              />
            ) : countryCode ? (
              <Pressable
                onPress={() => setShowCitySelector(true)}
                style={styles.dropdownTrigger}
              >
                <Text
                  style={[
                    styles.dropdownText,
                    !cityName && { color: colors.text.muted },
                  ]}
                >
                  {cityName || 'Select city'}
                </Text>
                <Text style={styles.dropdownArrow}>▼</Text>
              </Pressable>
            ) : (
              <Text style={styles.hintText}>Select a country first</Text>
            )}

            {/* Gender */}
            <SectionLabel>Gender</SectionLabel>
            <ChipGroup
              options={['female', 'male', 'other'] as Gender[]}
              value={gender}
              onChange={setGender}
              labels={{ female: 'Female', male: 'Male', other: 'Other' }}
            />

            {/* Age Range */}
            <SectionLabel>Age Range</SectionLabel>
            <PickerDropdown
              options={AGE_RANGES}
              value={ageRange}
              onChange={setAgeRange}
              placeholder="Select age range"
            />

            {/* Height Range */}
            <SectionLabel>Height (optional)</SectionLabel>
            <PickerDropdown
              options={HEIGHT_RANGES}
              value={heightRange}
              onChange={setHeightRange}
              placeholder="Select height range"
              labelFn={(v) => `${v} cm`}
            />

            {/* Person Nickname */}
            <SectionLabel>Nickname (optional)</SectionLabel>
            <TextInput
              value={personNickname}
              onChangeText={(t) => {
                if (t.length <= 50) setPersonNickname(t);
              }}
              placeholder="e.g. Coffee Girl"
              placeholderTextColor={colors.text.muted}
              style={styles.textInput}
              maxLength={50}
            />

            {/* Date picker */}
            <SectionLabel>Date</SectionLabel>
            <TextInput
              value={dateAt}
              onChangeText={setDateAt}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.text.muted}
              style={styles.textInput}
              keyboardType="numbers-and-punctuation"
            />

            {/* Ratings */}
            <RatingSelector
              label="Overall Rating"
              value={rating}
              onChange={setRating}
            />
            <RatingSelector
              label="Face Rating"
              value={faceRating}
              onChange={setFaceRating}
            />
            <RatingSelector
              label="Body Rating"
              value={bodyRating}
              onChange={setBodyRating}
            />
            <RatingSelector
              label="Chat Rating"
              value={chatRating}
              onChange={setChatRating}
            />

            {/* Tags */}
            {renderTagSection('meeting', 'How You Met')}
            {renderTagSection('venue', 'Venue')}
            {renderTagSection('activity', 'Activities')}
            {renderTagSection('face', 'Face Features')}
            {renderTagSection('personality', 'Personality')}
            {gender === 'female' && renderTagSection('physical_female', 'Physical')}
            {gender === 'male' && renderTagSection('physical_male', 'Physical')}

            {/* Description */}
            <View>
              <View style={styles.descLabelRow}>
                <SectionLabel>Description (optional)</SectionLabel>
                <Text
                  style={[
                    styles.charCount,
                    description.length > 460 && { color: colors.neon.red },
                  ]}
                >
                  {description.length}/500
                </Text>
              </View>
              <TextInput
                value={description}
                onChangeText={(t) => {
                  if (t.length <= 500) setDescription(t);
                }}
                placeholder="How was the date?"
                placeholderTextColor={colors.text.muted}
                style={[styles.textInput, styles.textArea]}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
            </View>

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Submit */}
            <View style={styles.submitRow}>
              <Button
                title={isSubmitting ? 'Saving...' : editDate ? 'Update' : 'Save Date'}
                onPress={handleSubmit}
                loading={isSubmitting}
                disabled={isSubmitting}
                fullWidth
                size="lg"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* City selector modal */}
        {showCitySelector && (
          <Modal
            visible
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setShowCitySelector(false)}
          >
            <CitySelector
              countryCode={countryCode}
              value={cityId}
              onChange={handleCitySelect}
              cities={cities}
              onClose={() => setShowCitySelector(false)}
            />
          </Modal>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  flex: {
    flex: 1,
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
  cancelText: {
    color: colors.neon.pink,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  formContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.md,
  },
  sectionLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: `${colors.neon.pink}20`,
    borderColor: `${colors.neon.pink}50`,
  },
  chipText: {
    fontSize: fontSize.md,
    color: colors.text.secondary,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: colors.neon.pink,
    fontWeight: '700',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    minHeight: 48,
  },
  dropdownText: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    flex: 1,
  },
  dropdownArrow: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
    marginLeft: spacing.sm,
  },
  dropdownList: {
    maxHeight: 200,
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dropdownItemActive: {
    backgroundColor: `${colors.neon.pink}15`,
  },
  dropdownItemText: {
    color: colors.text.secondary,
    fontSize: fontSize.md,
  },
  dropdownItemTextActive: {
    color: colors.neon.pink,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    color: colors.text.primary,
    fontSize: fontSize.md,
    minHeight: 48,
  },
  textArea: {
    minHeight: 100,
    paddingTop: spacing.sm + 4,
  },
  hintText: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingValue: {
    color: colors.neon.pink,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 4,
  },
  ratingBlock: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 34,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBlockActive: {
    backgroundColor: `${colors.neon.pink}20`,
    borderColor: `${colors.neon.pink}50`,
  },
  ratingBlockText: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  ratingBlockTextActive: {
    color: colors.neon.pink,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagChip: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background.tertiary,
  },
  tagChipActive: {
    backgroundColor: `${colors.neon.pink}20`,
    borderColor: `${colors.neon.pink}50`,
  },
  tagChipText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  tagChipTextActive: {
    color: colors.neon.pink,
    fontWeight: '600',
  },
  descLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCount: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
  },
  errorBox: {
    backgroundColor: `${colors.neon.red}15`,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: `${colors.neon.red}30`,
    padding: spacing.md,
  },
  errorText: {
    color: colors.neon.red,
    fontSize: fontSize.md,
  },
  submitRow: {
    marginTop: spacing.md,
  },
});
