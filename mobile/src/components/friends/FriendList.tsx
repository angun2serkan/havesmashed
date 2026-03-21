import React, { useMemo } from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Users } from 'lucide-react-native';
import type { Connection } from '../../types';
import { colors } from '../../constants/colors';
import { fontSize, spacing } from '../../constants/layout';
import { FriendCard } from './FriendCard';
import { EmptyState } from '../ui/EmptyState';

interface FriendListProps {
  connections: Connection[];
  onAccept: (connection: Connection) => void;
  onReject: (connection: Connection) => void;
  onDelete: (connection: Connection) => void;
  onPress: (connection: Connection) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

interface SectionData {
  title: string;
  data: Connection[];
}

export const FriendList: React.FC<FriendListProps> = ({
  connections,
  onAccept,
  onReject,
  onDelete,
  onPress,
  refreshing = false,
  onRefresh,
}) => {
  const sections = useMemo<SectionData[]>(() => {
    const pending = connections.filter((c) => c.status === 'pending');
    const accepted = connections.filter((c) => c.status === 'accepted');
    const result: SectionData[] = [];

    if (pending.length > 0) {
      result.push({ title: `Pending Requests (${pending.length})`, data: pending });
    }
    if (accepted.length > 0) {
      result.push({ title: `Friends (${accepted.length})`, data: accepted });
    }

    return result;
  }, [connections]);

  if (connections.length === 0 && !refreshing) {
    return (
      <EmptyState
        icon={<Users size={40} color={colors.text.muted} />}
        title="No friends yet"
        description="Share a friend code or invite link to connect with others"
      />
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.cardWrapper}>
          <FriendCard
            connection={item}
            onPress={onPress}
            onAccept={onAccept}
            onReject={onReject}
            onDelete={onDelete}
          />
        </View>
      )}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.neon.pink}
            colors={[colors.neon.pink]}
          />
        ) : undefined
      }
      contentContainerStyle={styles.listContent}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing.xl,
  },
  cardWrapper: {
    paddingHorizontal: spacing.md,
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  separator: {
    height: spacing.sm,
  },
  sectionSeparator: {
    height: spacing.sm,
  },
});
