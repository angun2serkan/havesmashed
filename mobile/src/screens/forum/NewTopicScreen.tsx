import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { api } from '../../services/api';
import { Button } from '../../components/ui/Button';
import type { ForumStackScreenProps } from '../../app/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'tips', label: 'Tips' },
  { value: 'stories', label: 'Stories' },
  { value: 'questions', label: 'Questions' },
  { value: 'off-topic', label: 'Off-topic' },
];

const TITLE_MAX = 200;
const BODY_MAX = 5000;

// ─── Component ───────────────────────────────────────────────────────────────

type Props = ForumStackScreenProps<'NewTopic'>;

export default function NewTopicScreen({ navigation }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await api.createForumTopic({
        title: title.trim(),
        body: body.trim(),
        category,
        is_anonymous: isAnonymous,
      });
      // Navigate to the newly created topic or go back
      if (result?.id) {
        navigation.replace('TopicDetail', {
          topicId: result.id,
          title: title.trim(),
        });
      } else {
        navigation.goBack();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (title.trim() || body.trim()) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to go back?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ],
      );
    } else {
      navigation.goBack();
    }
  };

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !submitting;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton} hitSlop={12}>
            <ArrowLeft size={20} color="#e0e0e0" />
          </Pressable>
          <Text style={styles.headerTitle}>New Topic</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Error */}
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Title */}
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
            placeholder="Topic title..."
            placeholderTextColor="#606070"
            maxLength={TITLE_MAX}
            style={styles.titleInput}
          />
          <Text style={styles.charCount}>
            {title.length}/{TITLE_MAX}
          </Text>

          {/* Category */}
          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.value}
                onPress={() => setCategory(c.value)}
                style={[
                  styles.categoryChip,
                  category === c.value && styles.categoryChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    category === c.value && styles.categoryChipTextActive,
                  ]}
                >
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Body */}
          <Text style={styles.label}>Content</Text>
          <TextInput
            value={body}
            onChangeText={(t) => setBody(t.slice(0, BODY_MAX))}
            placeholder="Write your topic content..."
            placeholderTextColor="#606070"
            multiline
            maxLength={BODY_MAX}
            style={styles.bodyInput}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>
            {body.length}/{BODY_MAX}
          </Text>

          {/* Anonymous toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelContainer}>
              <Text style={styles.toggleLabel}>Post anonymously</Text>
              <Text style={styles.toggleHint}>
                Your nickname will be hidden from other users
              </Text>
            </View>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              trackColor={{ false: '#2a2a3e', true: 'rgba(255,0,127,0.4)' }}
              thumbColor={isAnonymous ? '#ff007f' : '#606070'}
            />
          </View>

          {/* Submit */}
          <View style={styles.submitContainer}>
            <Button
              title={submitting ? 'Creating...' : 'Create Topic'}
              onPress={handleSubmit}
              loading={submitting}
              disabled={!canSubmit}
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  errorBanner: {
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 13,
  },
  label: {
    color: '#a0a0b0',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  titleInput: {
    backgroundColor: '#12121a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#e0e0e0',
    fontSize: 15,
    minHeight: 48,
  },
  charCount: {
    color: '#606070',
    fontSize: 10,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 16,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#12121a',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  categoryChipActive: {
    backgroundColor: 'rgba(255,0,127,0.12)',
    borderColor: 'rgba(255,0,127,0.5)',
  },
  categoryChipText: {
    color: '#8888aa',
    fontSize: 13,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#ff007f',
  },
  bodyInput: {
    backgroundColor: '#12121a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#e0e0e0',
    fontSize: 14,
    minHeight: 160,
    lineHeight: 21,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#12121a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 24,
  },
  toggleLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '500',
  },
  toggleHint: {
    color: '#606070',
    fontSize: 11,
    marginTop: 2,
  },
  submitContainer: {
    marginTop: 8,
  },
});
