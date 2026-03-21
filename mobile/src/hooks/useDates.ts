import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../services/api';
import type { DateEntry, Stats } from '../types';

interface DateFilters {
  limit?: number;
}

export function useDatesQuery(filters?: DateFilters) {
  return useInfiniteQuery<
    { dates: DateEntry[]; next_cursor?: string },
    Error
  >({
    queryKey: ['dates', filters],
    queryFn: ({ pageParam }) =>
      api.getDates(pageParam as string | undefined, filters?.limit),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}

export function useCreateDate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof api.createDate>[0]) =>
      api.createDate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dates'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['badges', 'me'] });
    },
  });
}

export function useUpdateDate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateDate>[1] }) =>
      api.updateDate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dates'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useDeleteDate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteDate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dates'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['badges', 'me'] });
    },
  });
}

export function useDateStats() {
  return useQuery<Stats, Error>({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
  });
}
