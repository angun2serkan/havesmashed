import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

const FRIEND_COLORS = [
  '#FF007F', // neon pink
  '#00E5FF', // cyan
  '#BF00FF', // purple
  '#00FF88', // green
  '#FF8C00', // orange
  '#FFD700', // yellow
  '#FF4444', // red
  '#45B7D1', // blue
  '#FF5733', // coral
  '#4ECDC4', // teal
  '#F7DC6F', // light gold
  '#BB8FCE', // lavender
] as const;

interface ColorPickerProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  selectedColor,
  onColorChange,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Friend Color</Text>
      <View style={styles.grid}>
        {FRIEND_COLORS.map((color) => {
          const isSelected = color === selectedColor;
          return (
            <Pressable
              key={color}
              onPress={() => onColorChange(color)}
              style={[
                styles.colorCircle,
                { backgroundColor: color },
                isSelected && styles.selectedCircle,
                isSelected && { borderColor: color },
              ]}
            >
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 2,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCircle: {
    borderWidth: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: fontSize.lg,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
