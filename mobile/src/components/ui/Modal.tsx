import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal as RNModal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../constants/colors';
import { borderRadius, fontSize, spacing, layout } from '../../constants/layout';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  showClose?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  children,
  showClose = true,
}) => {
  const slideAnim = useRef(new Animated.Value(layout.screenHeight)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    } else {
      slideAnim.setValue(layout.screenHeight);
    }
  }, [visible, slideAnim]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: layout.screenHeight,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <Animated.View
          style={[
            styles.content,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {(title || showClose) && (
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>
                {title ?? ''}
              </Text>
              {showClose && (
                <Pressable
                  onPress={handleClose}
                  style={styles.closeButton}
                  hitSlop={12}
                >
                  <Text style={styles.closeText}>✕</Text>
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.body}>{children}</View>
        </Animated.View>
      </View>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: layout.screenHeight * 0.85,
    minHeight: 200,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
    flex: 1,
    marginRight: spacing.md,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.text.secondary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
