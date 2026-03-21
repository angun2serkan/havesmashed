import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

interface TagProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}

export const Tag: React.FC<TagProps> = ({
  label,
  selected = false,
  onPress,
  color = '#ff007f',
}) => {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tag,
        selected
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: 'transparent', borderColor: color },
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: selected ? '#ffffff' : color },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tag: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
