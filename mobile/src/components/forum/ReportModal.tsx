import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { api } from '../../services/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
] as const;

// ─── Props ───────────────────────────────────────────────────────────────────

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetType: 'topic' | 'comment';
  targetId: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ReportModal: React.FC<ReportModalProps> = ({
  visible,
  onClose,
  targetType,
  targetId,
}) => {
  const [reason, setReason] = useState<string>('spam');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await api.reportForumContent({
        target_type: targetType,
        target_id: targetId,
        reason,
        description: description.trim() || undefined,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      if (msg.toLowerCase().includes('already')) {
        setError('You have already reported this content.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setReason('spam');
    setDescription('');
    setError('');
    setSuccess(false);
    onClose();
  };

  return (
    <Modal visible={visible} onClose={handleClose} title="Report Content">
      {success ? (
        <View style={styles.successContainer}>
          <Text style={styles.successTitle}>Report submitted</Text>
          <Text style={styles.successDescription}>
            Your report has been received and will be reviewed. Thank you.
          </Text>
          <Button title="Close" onPress={handleClose} size="sm" />
        </View>
      ) : (
        <View>
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Reason selection */}
          <Text style={styles.sectionLabel}>Reason</Text>
          <View style={styles.reasonList}>
            {REASONS.map((r) => (
              <Pressable
                key={r.value}
                style={styles.reasonRow}
                onPress={() => setReason(r.value)}
              >
                <View
                  style={[
                    styles.radio,
                    reason === r.value && styles.radioSelected,
                  ]}
                >
                  {reason === r.value && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.reasonLabel}>{r.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Description */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
            Description (optional)
          </Text>
          <TextInput
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, 500))}
            placeholder="Provide additional details..."
            placeholderTextColor="#606070"
            multiline
            maxLength={500}
            style={styles.descriptionInput}
          />
          <Text style={styles.charCount}>{description.length}/500</Text>

          {/* Submit */}
          <View style={styles.submitRow}>
            <Button
              title="Cancel"
              onPress={handleClose}
              variant="ghost"
              size="sm"
            />
            <Button
              title={submitting ? 'Submitting...' : 'Submit Report'}
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting}
              size="sm"
            />
          </View>
        </View>
      )}
    </Modal>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  successContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successTitle: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  successDescription: {
    color: '#8888aa',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 19,
  },
  errorBanner: {
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 13,
  },
  sectionLabel: {
    color: '#a0a0b0',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 10,
  },
  reasonList: {
    gap: 10,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2a2a3e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#ff007f',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff007f',
  },
  reasonLabel: {
    color: '#e0e0e0',
    fontSize: 14,
  },
  descriptionInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e0e0e0',
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    color: '#606070',
    fontSize: 10,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 16,
  },
  submitRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
