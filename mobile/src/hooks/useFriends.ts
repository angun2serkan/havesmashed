import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../services/api';
import { useFriendStore } from '../stores/friendStore';
import type { Connection, FriendDate, FriendStats } from '../types';

export function useConnections() {
  const { setConnections, setPendingRequests } = useFriendStore();

  return useQuery<Connection[], Error>({
    queryKey: ['connections'],
    queryFn: async () => {
      const connections = await api.getConnections();
      const accepted = connections.filter((c) => c.status === 'accepted');
      const pending = connections.filter((c) => c.status === 'pending');
      setConnections(accepted);
      setPendingRequests(pending);
      return connections;
    },
  });
}

export function useFriendDates(friendId?: string) {
  const { setFriendDates } = useFriendStore();

  return useQuery<FriendDate[], Error>({
    queryKey: ['friendDates', friendId],
    queryFn: async () => {
      const dates = await api.getFriendDates(friendId);
      setFriendDates(dates);
      return dates;
    },
  });
}

export function useFriendStats(friendId: string) {
  return useQuery<FriendStats, Error>({
    queryKey: ['friendStats', friendId],
    queryFn: () => api.getFriendStats(friendId),
    enabled: !!friendId,
  });
}

export function useAcceptConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.respondToConnection('accept'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.invalidateQueries({ queryKey: ['friendDates'] });
    },
  });
}

export function useRejectConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.respondToConnection('reject'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
}

export function useDeleteConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.invalidateQueries({ queryKey: ['friendDates'] });
    },
  });
}

export function useUpdateFriendColor() {
  const queryClient = useQueryClient();
  const { updateConnectionColor } = useFriendStore();

  return useMutation({
    mutationFn: ({ connectionId, color }: { connectionId: string; color: string }) =>
      api.setFriendColor(connectionId, color),
    onSuccess: (_data, variables) => {
      updateConnectionColor(variables.connectionId, variables.color);
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.invalidateQueries({ queryKey: ['friendDates'] });
    },
  });
}

export function useAddFriend() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) => api.addFriendByCode(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
}
