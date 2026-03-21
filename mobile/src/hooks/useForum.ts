import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../services/api';
import type { ForumComment, ForumTopic } from '../types';

export function useTopics(category?: string, sort?: string) {
  return useInfiniteQuery<
    { topics: ForumTopic[]; next_cursor?: string },
    Error
  >({
    queryKey: ['forum', 'topics', { category, sort }],
    queryFn: ({ pageParam }) =>
      api.getForumTopics({
        category,
        sort,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}

export function useTopic(topicId: string) {
  return useQuery<{ topic: ForumTopic; comments: ForumComment[] }, Error>({
    queryKey: ['forum', 'topic', topicId],
    queryFn: () => api.getForumTopic(topicId),
    enabled: !!topicId,
  });
}

export function useCreateTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { title: string; body: string; category: string; is_anonymous?: boolean }) =>
      api.createForumTopic(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum', 'topics'] });
    },
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ topicId, data }: { topicId: string; data: { body: string; parent_id?: string } }) =>
      api.createForumComment(topicId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['forum', 'topic', variables.topicId] });
      queryClient.invalidateQueries({ queryKey: ['forum', 'topics'] });
    },
  });
}

export function useToggleLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { target_type: 'topic' | 'comment'; target_id: string }) =>
      api.toggleForumLike(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum'] });
    },
  });
}

export function useReportContent() {
  return useMutation({
    mutationFn: (data: { target_type: 'topic' | 'comment'; target_id: string; reason: string; description?: string }) =>
      api.reportForumContent(data),
  });
}

export function useBanStatus() {
  return useQuery<{ isBanned: boolean; bannedUntil: string | null }, Error>({
    queryKey: ['forum', 'banStatus'],
    queryFn: () => api.getForumBanStatus(),
  });
}
