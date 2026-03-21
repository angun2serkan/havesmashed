import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Button } from '../ui/Button';
import { colors } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

interface SeedPhraseDisplayProps {
  words: string[];
  onContinue: () => void;
}

export const SeedPhraseDisplay: React.FC<SeedPhraseDisplayProps> = ({
  words,
  onContinue,
}) => {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(words.join(' '));
    setCopied(true);
    Toast.show({
      type: 'success',
      text1: 'Copied to clipboard',
      text2: 'Make sure to save it somewhere safe!',
      visibilityTime: 2000,
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Recovery Phrase</Text>
        <Text style={styles.subtitle}>
          Write these 12 words down and store them somewhere safe. This is the
          only way to access your account.
        </Text>
      </View>

      <View style={styles.grid}>
        {words.map((word, index) => (
          <View key={index} style={styles.wordCard}>
            <Text style={styles.wordNumber}>{index + 1}.</Text>
            <Text style={styles.wordText}>{word}</Text>
          </View>
        ))}
      </View>

      <Button
        title={copied ? 'Copied!' : 'Copy to Clipboard'}
        onPress={handleCopy}
        variant="secondary"
        fullWidth
      />

      <View style={styles.warningContainer}>
        <Text style={styles.warningIcon}>&#9888;</Text>
        <Text style={styles.warningText}>
          Write these words down. You cannot recover them later.
        </Text>
      </View>

      <Pressable
        style={styles.checkboxRow}
        onPress={() => setSaved(!saved)}
      >
        <View style={[styles.checkbox, saved && styles.checkboxChecked]}>
          {saved && <Text style={styles.checkmark}>&#10003;</Text>}
        </View>
        <Text style={styles.checkboxLabel}>
          I have saved my recovery phrase in a secure location. I understand
          that if I lose it, I will permanently lose access to my account.
        </Text>
      </Pressable>

      <Button
        title="I've Saved My Seed Phrase"
        onPress={onContinue}
        disabled={!saved}
        size="lg"
        fullWidth
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  wordCard: {
    width: '31%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  wordNumber: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    minWidth: 18,
  },
  wordText: {
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
    color: colors.text.primary,
    fontWeight: '500',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 127, 0.1)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  warningIcon: {
    fontSize: 18,
    color: '#ff007f',
  },
  warningText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: '#ff007f',
    lineHeight: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: '#ff007f',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#ff007f',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
