import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, neonShadow } from '../../constants/colors';
import { borderRadius, fontSize, spacing } from '../../constants/layout';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const VARIANT_STYLES: Record<
  ButtonVariant,
  { bg: string; text: string; border?: string }
> = {
  primary: { bg: '#ff007f', text: '#ffffff' },
  secondary: { bg: colors.background.secondary, text: '#ff007f', border: '#ff007f' },
  ghost: { bg: 'transparent', text: colors.text.primary },
  danger: { bg: colors.neon.red, text: '#ffffff' },
};

const SIZE_STYLES: Record<
  ButtonSize,
  { paddingV: number; paddingH: number; font: number; iconGap: number }
> = {
  sm: { paddingV: spacing.xs + 2, paddingH: spacing.md, font: fontSize.sm, iconGap: spacing.xs },
  md: { paddingV: spacing.sm + 2, paddingH: spacing.lg, font: fontSize.md, iconGap: spacing.sm },
  lg: { paddingV: spacing.md - 2, paddingH: spacing.xl, font: fontSize.lg, iconGap: spacing.sm },
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];
  const isDisabled = disabled || loading;

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        fullWidth && styles.fullWidth,
        variant === 'primary' && !isDisabled && neonShadow('#ff007f'),
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[
          styles.base,
          {
            backgroundColor: v.bg,
            paddingVertical: s.paddingV,
            paddingHorizontal: s.paddingH,
          },
          v.border && { borderWidth: 1, borderColor: v.border },
          isDisabled && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={v.text} />
        ) : (
          <View style={styles.content}>
            {icon && <View style={{ marginRight: s.iconGap }}>{icon}</View>}
            <Text
              style={[
                styles.text,
                { fontSize: s.font, color: v.text },
              ]}
            >
              {title}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  fullWidth: {
    width: '100%',
  },
});
