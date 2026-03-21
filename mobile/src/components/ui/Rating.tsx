import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing } from '../../constants/layout';

const STAR_FILLED = '#ffd700';
const STAR_EMPTY = '#404060';

interface RatingProps {
  value: number;
  onChange?: (rating: number) => void;
  maxRating?: number;
  size?: number;
  readonly?: boolean;
}

export const Rating: React.FC<RatingProps> = ({
  value,
  onChange,
  maxRating = 10,
  size = 24,
  readonly = false,
}) => {
  const handlePress = (index: number) => {
    if (!readonly && onChange) {
      onChange(index + 1);
    }
  };

  return (
    <View style={styles.container}>
      {Array.from({ length: maxRating }, (_, i) => {
        const filled = i < value;
        return (
          <Pressable
            key={i}
            onPress={() => handlePress(i)}
            disabled={readonly}
            hitSlop={4}
            style={styles.star}
          >
            <Text
              style={{
                fontSize: size,
                color: filled ? STAR_FILLED : STAR_EMPTY,
              }}
            >
              {'\u2605'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    marginRight: spacing.xs / 2,
  },
});
