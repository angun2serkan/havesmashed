import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Badge } from '../types';

export function useMyBadges() {
  return useQuery<Badge[], Error>({
    queryKey: ['badges', 'me'],
    queryFn: () => api.getMyBadges(),
  });
}

export function useFriendBadges(friendId: string) {
  return useQuery<Badge[], Error>({
    queryKey: ['badges', 'friend', friendId],
    queryFn: () => api.getFriendBadges(friendId),
    enabled: !!friendId,
  });
}
