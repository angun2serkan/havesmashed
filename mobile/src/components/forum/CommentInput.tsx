import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Send, X } from 'lucide-react-native';

// ─── Props ───────────────────────────────────────────────────────────────────

interface CommentInputProps {
  onSubmit: (body: string, parentId?: string, isAnonymous?: boolean) => void;
  replyTo?: { id: string; authorNickname: string } | null;
  onCancelReply?: () => void;
  loading?: boolean;
  parentId?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const CommentInput: React.FC<CommentInputProps> = ({
  onSubmit,
  replyTo,
  onCancelReply,
  loading = false,
  parentId,
}) => {
  const [body, setBody] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed, parentId ?? replyTo?.id, isAnonymous);
    setBody('');
  };

  return (
    <View style={styles.container}>
      {/* Reply-to indicator */}
      {replyTo && (
        <View style={styles.replyBanner}>
          <Text style={styles.replyText} numberOfLines={1}>
            Replying to{' '}
            <Text style={styles.replyAuthor}>{replyTo.authorNickname}</Text>
          </Text>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <X size={14} color="#8888aa" />
          </Pressable>
        </View>
      )}

      {/* Anonymous toggle */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Post anonymously</Text>
        <Switch
          value={isAnonymous}
          onValueChange={setIsAnonymous}
          trackColor={{ false: '#2a2a3e', true: 'rgba(255,0,127,0.4)' }}
          thumbColor={isAnonymous ? '#ff007f' : '#606070'}
        />
      </View>

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write a comment..."
          placeholderTextColor="#606070"
          multiline
          maxLength={2000}
          style={styles.input}
          editable={!loading}
        />
        <Pressable
          onPress={handleSubmit}
          disabled={!body.trim() || loading}
          style={[
            styles.sendButton,
            (!body.trim() || loading) && styles.sendButtonDisabled,
          ]}
          hitSlop={8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ff007f" />
          ) : (
            <Send size={18} color="#ff007f" />
          )}
        </Pressable>
      </View>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#12121a',
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,0,127,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  replyText: {
    color: '#8888aa',
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  replyAuthor: {
    color: '#ff007f',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  toggleLabel: {
    color: '#8888aa',
    fontSize: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e0e0e0',
    fontSize: 14,
    maxHeight: 100,
    minHeight: 42,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,0,127,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
