import React, { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Button } from '../ui/Button';
import { colors } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

interface SeedPhraseInputProps {
  onSubmit: (phrase: string) => void;
  loading: boolean;
  error?: string;
}

export const SeedPhraseInput: React.FC<SeedPhraseInputProps> = ({
  onSubmit,
  loading,
  error,
}) => {
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const allFilled = words.every((w) => w.trim().length > 0);

  const handleWordChange = (index: number, value: string) => {
    // If user pastes all 12 words at once
    const trimmed = value.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length === 12) {
      setWords(parts.map((p) => p.toLowerCase()));
      inputRefs.current[11]?.focus();
      Toast.show({
        type: 'success',
        text1: 'Phrase pasted',
        text2: 'All 12 words filled automatically.',
        visibilityTime: 1500,
      });
      return;
    }

    // If user types a space, move to next input
    if (trimmed.includes(' ') && parts.length === 2 && parts[1]) {
      const updated = [...words];
      updated[index] = parts[0].toLowerCase();
      if (index < 11) {
        updated[index + 1] = parts[1].toLowerCase();
      }
      setWords(updated);
      if (index < 11) {
        inputRefs.current[index + 1]?.focus();
      }
      return;
    }

    const updated = [...words];
    updated[index] = value.toLowerCase().replace(/\s/g, '');
    setWords(updated);
  };

  const handleSubmitEditing = (index: number) => {
    if (index < 11) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const parts = text.trim().split(/\s+/);
      if (parts.length === 12) {
        setWords(parts.map((p) => p.toLowerCase()));
        Toast.show({
          type: 'success',
          text1: 'Phrase pasted',
          text2: 'All 12 words filled from clipboard.',
          visibilityTime: 1500,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Invalid phrase',
          text2: `Expected 12 words, got ${parts.length}.`,
          visibilityTime: 2000,
        });
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Paste failed',
        text2: 'Could not read clipboard.',
        visibilityTime: 2000,
      });
    }
  };

  const handleSubmit = () => {
    if (!allFilled) return;
    const phrase = words.map((w) => w.trim().toLowerCase()).join(' ');
    onSubmit(phrase);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Enter Recovery Phrase</Text>
        <Text style={styles.subtitle}>
          Enter your 12-word recovery phrase to sign in.
        </Text>
      </View>

      <View style={styles.grid}>
        {words.map((word, index) => (
          <View key={index} style={styles.inputCard}>
            <Text style={styles.inputNumber}>{index + 1}.</Text>
            <TextInput
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              value={word}
              onChangeText={(val) => handleWordChange(index, val)}
              onSubmitEditing={() => handleSubmitEditing(index)}
              returnKeyType={index < 11 ? 'next' : 'done'}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              style={styles.wordInput}
              placeholderTextColor={colors.text.muted}
              placeholder={`word ${index + 1}`}
            />
          </View>
        ))}
      </View>

      <Pressable onPress={handlePaste} style={styles.pasteButton}>
        <Text style={styles.pasteText}>Paste from Clipboard</Text>
      </Pressable>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Button
        title={loading ? 'Signing in...' : 'Sign In'}
        onPress={handleSubmit}
        disabled={!allFilled || loading}
        loading={loading}
        size="lg"
        fullWidth
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inputCard: {
    width: '31%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingLeft: spacing.sm,
    gap: 2,
  },
  inputNumber: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    minWidth: 18,
  },
  wordInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
    paddingVertical: spacing.sm + 2,
    paddingRight: spacing.sm,
  },
  pasteButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pasteText: {
    fontSize: fontSize.sm,
    color: '#ff007f',
    fontWeight: '600',
  },
  errorText: {
    color: '#ff4444',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
