import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import {
  Copy,
  Check,
  UserPlus,
  Link as LinkIcon,
  Share2,
} from 'lucide-react-native';
import { api } from '../../services/api';
import type { InviteResponse } from '../../types';
import { colors, neonShadow } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

export const InviteSection: React.FC = () => {
  const [platformInvite, setPlatformInvite] = useState<InviteResponse | null>(null);
  const [friendInvite, setFriendInvite] = useState<InviteResponse | null>(null);
  const [friendCode, setFriendCode] = useState('');
  const [loadingPlatform, setLoadingPlatform] = useState(false);
  const [loadingFriend, setLoadingFriend] = useState(false);
  const [addingFriend, setAddingFriend] = useState(false);
  const [copiedPlatform, setCopiedPlatform] = useState(false);
  const [copiedFriendCode, setCopiedFriendCode] = useState(false);

  const generatePlatformInvite = async () => {
    setLoadingPlatform(true);
    try {
      const result = await api.createInvite('platform');
      setPlatformInvite(result);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setLoadingPlatform(false);
    }
  };

  const generateFriendCode = async () => {
    setLoadingFriend(true);
    try {
      const result = await api.createInvite('friend');
      setFriendInvite(result);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate friend code');
    } finally {
      setLoadingFriend(false);
    }
  };

  const handleAddFriend = async () => {
    const trimmed = friendCode.trim();
    if (trimmed.length === 0) return;

    setAddingFriend(true);
    try {
      await api.addFriendByCode(trimmed);
      setFriendCode('');
      Alert.alert('Success', 'Friend request sent!');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add friend');
    } finally {
      setAddingFriend(false);
    }
  };

  const handleCopyPlatform = async () => {
    if (!platformInvite) return;
    await Clipboard.setStringAsync(platformInvite.link);
    setCopiedPlatform(true);
    setTimeout(() => setCopiedPlatform(false), 2000);
  };

  const handleCopyFriendCode = async () => {
    if (!friendInvite) return;
    await Clipboard.setStringAsync(friendInvite.token);
    setCopiedFriendCode(true);
    setTimeout(() => setCopiedFriendCode(false), 2000);
  };

  const handleShareInvite = async (link: string) => {
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      // expo-sharing requires a file URI; use the system share sheet via Share instead
    }
    // Fallback: copy to clipboard
    await Clipboard.setStringAsync(link);
    Alert.alert('Copied', 'Invite link copied to clipboard');
  };

  const handleCodeChange = (value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setFriendCode(upper);
  };

  const formatExpiry = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatCode = (code: string) => {
    if (code.length <= 4) return code;
    return `${code.slice(0, 4)} ${code.slice(4)}`;
  };

  return (
    <View style={styles.container}>
      {/* Add Friend by Code */}
      <Card>
        <View style={styles.sectionHeader}>
          <UserPlus size={16} color={colors.neon.pink} />
          <Text style={styles.sectionTitle}>Add Friend</Text>
        </View>
        <Text style={styles.description}>
          Enter a friend code to connect with an existing user.
        </Text>
        <View style={styles.codeInputRow}>
          <TextInput
            value={friendCode}
            onChangeText={handleCodeChange}
            placeholder="ABC12XY9"
            placeholderTextColor={colors.text.muted}
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.codeInput}
          />
          <Button
            title={addingFriend ? 'Adding...' : 'Add'}
            onPress={handleAddFriend}
            disabled={addingFriend || friendCode.length === 0}
            size="sm"
            variant="secondary"
          />
        </View>
      </Card>

      {/* Platform Invite */}
      <Card>
        <View style={styles.sectionHeader}>
          <LinkIcon size={16} color={colors.neon.pink} />
          <Text style={styles.sectionTitle}>Invite to App</Text>
        </View>
        <Text style={styles.description}>
          Generate a platform invite link for a new user. Limited to 3/month, 10 total.
        </Text>

        {platformInvite ? (
          <View style={styles.resultContainer}>
            <View style={styles.linkRow}>
              <Text style={styles.linkText} numberOfLines={1}>
                {platformInvite.link}
              </Text>
              <Pressable onPress={handleCopyPlatform} style={styles.iconBtn}>
                {copiedPlatform ? (
                  <Check size={16} color={colors.neon.green} />
                ) : (
                  <Copy size={16} color={colors.text.secondary} />
                )}
              </Pressable>
              <Pressable
                onPress={() => handleShareInvite(platformInvite.link)}
                style={styles.iconBtn}
              >
                <Share2 size={16} color={colors.text.secondary} />
              </Pressable>
            </View>
            <Text style={styles.expiryText}>
              Expires in {formatExpiry(platformInvite.expiresInSecs)}
            </Text>
          </View>
        ) : (
          <Button
            title={loadingPlatform ? 'Generating...' : 'Generate Invite Link'}
            onPress={generatePlatformInvite}
            loading={loadingPlatform}
            variant="secondary"
            fullWidth
          />
        )}
      </Card>

      {/* Friend Code */}
      <Card>
        <View style={styles.sectionHeader}>
          <UserPlus size={16} color={colors.neon.pink} />
          <Text style={styles.sectionTitle}>Your Friend Code</Text>
        </View>
        <Text style={styles.description}>
          Share this code with existing users to connect.
        </Text>

        {friendInvite ? (
          <View style={styles.resultContainer}>
            <View style={[styles.codeDisplay, neonShadow(colors.neon.pink)]}>
              <Text style={styles.codeText}>
                {formatCode(friendInvite.token)}
              </Text>
              <Pressable onPress={handleCopyFriendCode} style={styles.iconBtn}>
                {copiedFriendCode ? (
                  <Check size={18} color={colors.neon.green} />
                ) : (
                  <Copy size={18} color={colors.text.secondary} />
                )}
              </Pressable>
            </View>
            <Text style={styles.expiryText}>
              Expires in {formatExpiry(friendInvite.expiresInSecs)}
            </Text>
          </View>
        ) : (
          <Button
            title={loadingFriend ? 'Generating...' : 'Generate Friend Code'}
            onPress={generateFriendCode}
            loading={loadingFriend}
            variant="secondary"
            fullWidth
          />
        )}
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  description: {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  codeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  codeInput: {
    flex: 1,
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontFamily: 'monospace',
    textAlign: 'center',
    letterSpacing: 3,
    fontWeight: '600',
  },
  resultContainer: {
    gap: spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  linkText: {
    flex: 1,
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  iconBtn: {
    padding: spacing.xs,
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,0,127,0.3)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  codeText: {
    color: colors.text.primary,
    fontSize: fontSize.xxl,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 4,
  },
  expiryText: {
    color: colors.text.muted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
});
