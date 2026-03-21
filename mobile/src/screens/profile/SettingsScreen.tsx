import React, { useState, useCallback } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, neonShadow } from '../../constants/colors';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
  layout,
} from '../../constants/layout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';

const APP_VERSION = '1.0.0';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const user = useAuthStore((s) => s.user);
  const setNicknameStore = useAuthStore((s) => s.setNickname);
  const logout = useAuthStore((s) => s.logout);

  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(user?.nickname ?? '');
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSaveNickname = useCallback(async () => {
    const trimmed = nicknameInput.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 20) {
      setNicknameError('Nickname must be 3-20 characters');
      return;
    }
    setNicknameSaving(true);
    setNicknameError(null);
    try {
      const result = await api.setNickname(trimmed);
      setNicknameStore(result.nickname, result.token);
      setEditingNickname(false);
    } catch (err) {
      setNicknameError(
        err instanceof Error ? err.message : 'Failed to update nickname',
      );
    } finally {
      setNicknameSaving(false);
    }
  }, [nicknameInput, setNicknameStore]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'Your account will be permanently deleted after 30 days. This cannot be reversed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await api.deleteAccount();
                      logout();
                    } catch {
                      Alert.alert('Error', 'Failed to delete account. Please try again.');
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [logout]);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: logout,
      },
    ]);
  }, [logout]);

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '--';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          {user?.nickname && (
            <Text style={styles.headerSubtitle}>@{user.nickname}</Text>
          )}
        </View>

        {/* Account Info */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nickname</Text>
            {editingNickname ? (
              <View style={styles.nicknameEditRow}>
                <TextInput
                  value={nicknameInput}
                  onChangeText={setNicknameInput}
                  style={styles.nicknameInput}
                  maxLength={20}
                  autoFocus
                  placeholderTextColor={colors.text.muted}
                  placeholder="Enter nickname"
                />
                <Pressable
                  onPress={handleSaveNickname}
                  disabled={nicknameSaving}
                  style={styles.nicknameSaveBtn}
                >
                  <Text style={styles.nicknameSaveBtnText}>
                    {nicknameSaving ? '...' : '\u2713'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditingNickname(false);
                    setNicknameInput(user?.nickname ?? '');
                    setNicknameError(null);
                  }}
                  style={styles.nicknameCancelBtn}
                >
                  <Text style={styles.nicknameCancelBtnText}>{'\u2715'}</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.infoValue}>
                {user?.nickname ?? 'Not set'}
              </Text>
            )}
          </View>
          {nicknameError && (
            <Text style={styles.errorText}>{nicknameError}</Text>
          )}
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member Since</Text>
            <Text style={styles.infoValue}>{memberSince}</Text>
          </View>
        </Card>

        {/* Navigation Links */}
        <Card style={styles.section} noPadding>
          <NavItem
            label="My Badges"
            emoji={'\uD83C\uDFC5'}
            onPress={() => navigation.navigate('Badges')}
          />
          <View style={styles.navDivider} />
          <NavItem
            label="Notifications"
            emoji={'\uD83D\uDD14'}
            onPress={() => navigation.navigate('Notifications')}
          />
          <View style={styles.navDivider} />
          <NavItem
            label="Privacy Settings"
            emoji={'\uD83D\uDD12'}
            onPress={() => navigation.navigate('Privacy')}
          />
          <View style={styles.navDivider} />
          <NavItem
            label="My Wrapped"
            emoji={'\uD83C\uDFA8'}
            onPress={() => navigation.navigate('Wrapped')}
          />
        </Card>

        {/* Account Actions */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>
          <View style={styles.actionButtons}>
            <Button
              title="Change Nickname"
              variant="secondary"
              size="sm"
              onPress={() => {
                setEditingNickname(true);
                setNicknameInput(user?.nickname ?? '');
              }}
              fullWidth
            />
            <View style={styles.actionSpacer} />
            <Button
              title="Delete Account"
              variant="danger"
              size="sm"
              onPress={handleDeleteAccount}
              loading={deleting}
              fullWidth
            />
          </View>
        </Card>

        {/* App Info */}
        <Card style={styles.section}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Version</Text>
            <Text style={styles.infoValue}>v{APP_VERSION}</Text>
          </View>
        </Card>

        {/* Logout */}
        <View style={styles.logoutContainer}>
          <Button
            title="Sign Out"
            variant="ghost"
            size="lg"
            onPress={handleLogout}
            fullWidth
          />
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

/* ---- Nav Item ---- */

const NavItem: React.FC<{
  label: string;
  emoji: string;
  onPress: () => void;
}> = ({ label, emoji, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.navItem,
      pressed && styles.navItemPressed,
    ]}
  >
    <View style={styles.navItemLeft}>
      <Text style={styles.navEmoji}>{emoji}</Text>
      <Text style={styles.navLabel}>{label}</Text>
    </View>
    <Text style={styles.navChevron}>{'\u203A'}</Text>
  </Pressable>
);

/* ---- Styles ---- */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  header: {
    marginBottom: spacing.lg,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.bold,
  },
  headerSubtitle: {
    color: colors.neon.pink,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  infoLabel: {
    color: colors.text.muted,
    fontSize: fontSize.md,
  },
  infoValue: {
    color: colors.text.secondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  nicknameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nicknameInput: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.neon.pink,
    color: colors.text.primary,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    width: 120,
  },
  nicknameSaveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,255,136,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nicknameSaveBtnText: {
    color: colors.neon.green,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  nicknameCancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,68,68,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nicknameCancelBtnText: {
    color: colors.neon.red,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  errorText: {
    color: colors.neon.red,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  navItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  navItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  navEmoji: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  navLabel: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  navChevron: {
    color: colors.text.muted,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.regular,
  },
  navDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  actionButtons: {
    gap: spacing.sm,
  },
  actionSpacer: {
    height: spacing.xs,
  },
  logoutContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
