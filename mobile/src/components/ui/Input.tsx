import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { colors } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

interface InputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: TextInputProps['keyboardType'];
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
  multiline = false,
  maxLength,
  keyboardType,
  icon,
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          focused && styles.focused,
          error && styles.errorBorder,
          multiline && styles.multiline,
        ]}
      >
        {icon && <View style={styles.icon}>{icon}</View>}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.text.muted}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          maxLength={maxLength}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            icon ? styles.inputWithIcon : null,
            multiline && styles.multilineInput,
          ]}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    minHeight: 48,
  },
  focused: {
    borderColor: '#ff007f',
  },
  errorBorder: {
    borderColor: '#ff4444',
  },
  multiline: {
    minHeight: 100,
    alignItems: 'flex-start',
  },
  icon: {
    paddingLeft: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  inputWithIcon: {
    paddingLeft: spacing.sm,
  },
  multilineInput: {
    textAlignVertical: 'top',
    paddingTop: spacing.sm + 2,
    minHeight: 90,
  },
  errorText: {
    color: '#ff4444',
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
});
