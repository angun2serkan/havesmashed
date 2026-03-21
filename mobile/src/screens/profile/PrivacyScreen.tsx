import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
  layout,
} from '../../constants/layout';
import { Card } from '../../components/ui/Card';
import { api } from '../../services/api';
import type { Connection } from '../../types';

interface PrivacySettings {
  shareCountries: boolean;
  shareCities: boolean;
  shareDates: boolean;
  shareStats: boolean;
}

type PrivacyKey = keyof PrivacySettings;

interface SettingRow {
  key: PrivacyKey;
  snakeKey: string;
  label: string;
  description: string;
}

const SETTINGS_CONFIG: SettingRow[] = [
  {
    key: 'shareCountries',
    snakeKey: 'share_countries',
    label: 'Share Countries',
    description: 'Friends can see which countries you have visited.',
  },
  {
    key: 'shareCities',
    snakeKey: 'share_cities',
    label: 'Share Cities',
    description: 'Friends can see the cities where you had dates.',
  },
  {
    key: 'shareDates',
    snakeKey: 'share_dates',
    label: 'Share Dates',
    description: 'Friends can see your date entries on the map.',
  },
  {
    key: 'shareStats',
    snakeKey: 'share_stats',
    label: 'Share Stats',
    description: 'Friends can view your stats and averages.',
  },
];

export const PrivacyScreen: React.FC = () => {
  const navigation = useNavigation();
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    shareCountries: true,
    shareCities: false,
    shareDates: false,
    shareStats: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [friends, setFriends] = useState<Connection[]>([]);
  const [expandedFriend, setExpandedFriend] = useState<string | null>(null);

  useEffect(() => {
    loadPrivacy();
    loadFriends();
  }, []);

  const loadPrivacy = useCallback(async () => {
    try {
      const data = await api.getPrivacy();
      setPrivacy(data);
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFriends = useCallback(async () => {
    try {
      const data = await api.getConnections('accepted');
      setFriends(data);
    } catch {
      // Silently fail
    }
  }, []);

  const handleToggle = useCallback(
    async (key: PrivacyKey, snakeKey: string, value: boolean) => {
      setSaving(key);
      const prev = privacy[key];
      setPrivacy((p) => ({ ...p, [key]: value }));
      try {
        await api.updatePrivacy({ [snakeKey]: value });
      } catch {
        setPrivacy((p) => ({ ...p, [key]: prev }));
      } finally {
        setSaving(null);
      }
    },
    [privacy],
  );

  const toggleFriendExpand = useCallback(
    (friendId: string) => {
      setExpandedFriend((prev) => (prev === friendId ? null : friendId));
    },
    [],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backButton}
        >
          <Text style={styles.backText}>{'\u2039'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Settings</Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.neon.pink} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Global Defaults */}
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>
              {'\uD83D\uDD12'} Global Defaults
            </Text>
            <Text style={styles.sectionDescription}>
              These settings control what your friends can see by default.
            </Text>

            {SETTINGS_CONFIG.map((setting, idx) => (
              <View key={setting.key}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>{setting.label}</Text>
                    <Text style={styles.toggleDescription}>
                      {setting.description}
                    </Text>
                  </View>
                  <View style={styles.toggleRight}>
                    {saving === setting.key && (
                      <ActivityIndicator
                        size="small"
                        color={colors.text.muted}
                        style={styles.savingIndicator}
                      />
                    )}
                    <Switch
                      value={privacy[setting.key]}
                      onValueChange={(val) =>
                        handleToggle(setting.key, setting.snakeKey, val)
                      }
                      disabled={saving !== null}
                      trackColor={{
                        false: colors.background.tertiary,
                        true: 'rgba(255,0,127,0.4)',
                      }}
                      thumbColor={
                        privacy[setting.key] ? colors.neon.pink : colors.text.muted
                      }
                      ios_backgroundColor={colors.background.tertiary}
                    />
                  </View>
                </View>
              </View>
            ))}
          </Card>

          {/* Per-Friend Overrides */}
          {friends.length > 0 && (
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>
                {'\uD83D\uDC65'} Per-Friend Overrides
              </Text>
              <Text style={styles.sectionDescription}>
                Override privacy settings for individual friends. Tap a friend to
                expand their settings.
              </Text>

              {friends.map((friend, idx) => (
                <View key={friend.id}>
                  {idx > 0 && <View style={styles.divider} />}
                  <Pressable
                    onPress={() => toggleFriendExpand(friend.id)}
                    style={styles.friendRow}
                  >
                    <View style={styles.friendInfo}>
                      <View
                        style={[
                          styles.friendDot,
                          { backgroundColor: friend.color },
                        ]}
                      />
                      <Text style={styles.friendName}>
                        {friend.friendNickname ?? 'Friend'}
                      </Text>
                    </View>
                    <Text style={styles.expandChevron}>
                      {expandedFriend === friend.id ? '\u2304' : '\u203A'}
                    </Text>
                  </Pressable>

                  {expandedFriend === friend.id && (
                    <View style={styles.friendSettings}>
                      <Text style={styles.friendSettingsNote}>
                        Per-friend overrides will be available in a future
                        update. Currently using global defaults.
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </Card>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    height: 52,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: colors.text.primary,
    fontSize: 26,
    fontWeight: fontWeight.semibold,
    marginTop: -2,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  headerRight: {
    width: 36,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    marginBottom: 2,
  },
  toggleDescription: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  toggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savingIndicator: {
    marginRight: spacing.sm,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  friendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  friendName: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  expandChevron: {
    color: colors.text.muted,
    fontSize: fontSize.xxl,
  },
  friendSettings: {
    paddingLeft: spacing.lg + spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  friendSettingsNote: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
