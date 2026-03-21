import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../services/api';
import type { Notification } from '../types';

export function useNotificationsQuery() {
  return useQuery<Notification[], Error>({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications(),
  });
}

export function useUnreadCount() {
  return useQuery<number, Error>({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => api.getUnreadCount(),
    refetchInterval: 30_000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] });
    },
  });
}

export function useNotifications() {
  const notificationsQuery = useNotificationsQuery();
  const unreadCountQuery = useUnreadCount();
  const markAsReadMutation = useMarkAsRead();

  return {
    notifications: notificationsQuery.data ?? [],
    unreadCount: unreadCountQuery.data ?? 0,
    markAsRead: markAsReadMutation.mutate,
    isLoading: notificationsQuery.isLoading,
    refetch: notificationsQuery.refetch,
  };
}
