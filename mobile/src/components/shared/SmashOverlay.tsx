import React, { useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { colors } from '../../constants/colors';
import { fontSize, spacing } from '../../constants/layout';

interface SmashOverlayProps {
  friendName: string;
  visible: boolean;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3000;

export const SmashOverlay: React.FC<SmashOverlayProps> = ({
  friendName,
  visible,
  onDismiss,
}) => {
  // Animated values
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.2);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(1);
  const emojiTranslateY = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);

    // Pulse the SMASH text
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );

    // Glow pulsation
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 500 }),
        withTiming(0.15, { duration: 500 }),
      ),
      -1,
      true,
    );

    // Expanding ring
    ringScale.value = withRepeat(
      withSequence(
        withTiming(2.5, { duration: 1500, easing: Easing.out(Easing.ease) }),
        withTiming(0.8, { duration: 0 }),
      ),
      -1,
      false,
    );

    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1500 }),
        withTiming(1, { duration: 0 }),
      ),
      -1,
      false,
    );

    // Emoji bounce
    emojiTranslateY.value = withRepeat(
      withSequence(
        withTiming(-14, { duration: 400, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 400, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      true,
    );

    return () => clearTimeout(timer);
  }, [visible, pulseScale, glowOpacity, ringScale, ringOpacity, emojiTranslateY, onDismiss]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const emojiStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: emojiTranslateY.value }],
  }));

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} statusBarTranslucent onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        {/* Expanding ring effect */}
        <Animated.View style={[styles.ring, ringStyle]} />

        {/* Glow background */}
        <Animated.View style={[styles.glowCircle, glowStyle]} />

        {/* Celebration emoji */}
        <Animated.Text style={[styles.emoji, emojiStyle]}>
          {'\uD83D\uDD25'}
        </Animated.Text>

        {/* SMASH text with pulse */}
        <Animated.View style={pulseStyle}>
          <Text style={styles.smashText}>SMASH!</Text>
        </Animated.View>

        {/* Notification card */}
        <Animated.View
          entering={FadeIn.delay(300).duration(400)}
          style={styles.notificationCard}
        >
          <Text style={styles.friendName}>{friendName}</Text>
          <Text style={styles.message}>just logged a new date!</Text>
        </Animated.View>

        {/* Decorative sparkles */}
        <Text style={styles.sparkleLeft}>{'\u2728'}</Text>
        <Text style={styles.sparkleRight}>{'\uD83C\uDF89'}</Text>

        <Animated.View entering={FadeIn.delay(700).duration(300)}>
          <Text style={styles.tapText}>Tap to continue</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: colors.neon.pink,
  },
  glowCircle: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.neon.pink,
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  smashText: {
    fontSize: 52,
    fontWeight: '900',
    color: colors.neon.pink,
    textShadowColor: colors.neon.pink,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
    letterSpacing: 3,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  notificationCard: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: `${colors.neon.pink}40`,
    borderRadius: 16,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    maxWidth: 300,
    alignItems: 'center',
    shadowColor: colors.neon.pink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  friendName: {
    color: colors.neon.pink,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  message: {
    color: colors.text.secondary,
    fontSize: fontSize.lg,
    fontWeight: '500',
    textAlign: 'center',
  },
  sparkleLeft: {
    position: 'absolute',
    top: '30%',
    left: 40,
    fontSize: 32,
  },
  sparkleRight: {
    position: 'absolute',
    top: '28%',
    right: 40,
    fontSize: 32,
  },
  tapText: {
    color: colors.text.muted,
    fontSize: fontSize.md,
    marginTop: spacing.xxl,
  },
});
