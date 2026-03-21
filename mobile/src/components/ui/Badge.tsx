import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  text: string;
  color?: string;
  size?: BadgeSize;
}

const SIZE_MAP: Record<BadgeSize, { pv: number; ph: number; font: number }> = {
  sm: { pv: 2, ph: spacing.sm, font: fontSize.xs },
  md: { pv: spacing.xs, ph: spacing.sm + 2, font: fontSize.sm },
};

export const Badge: React.FC<BadgeProps> = ({
  text,
  color = '#ff007f',
  size = 'md',
}) => {
  const s = SIZE_MAP[size];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${color}20`,
          paddingVertical: s.pv,
          paddingHorizontal: s.ph,
        },
      ]}
    >
      <Text style={[styles.text, { color, fontSize: s.font }]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
  },
});
