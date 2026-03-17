import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle, Plus, Search, X } from "lucide-react";
import { api } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { NewTopicModal } from "@/components/Forum/NewTopicModal";
import type { ForumTopic } from "@/types";

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "general", label: "General" },
  { value: "tips", label: "Tips" },
  { value: "stories", label: "Stories" },
  { value: "questions", label: "Questions" },
  { value: "off-topic", label: "Off-topic" },
];

const SORTS = [
  { value: "hot", label: "Hot" },
  { value: "new", label: "New" },
  { value: "top", label: "Top" },
];

function categoryBadgeClass(category: string): string {
  switch (category) {
    case "tips":
      return "bg-green-500/15 text-green-400";
    case "stories":
      return "bg-purple-500/15 text-purple-400";
    case "questions":
      return "bg-cyan-500/15 text-cyan-400";
    case "off-topic":
      return "bg-orange-500/15 text-orange-400";
    default:
      return "bg-dark-600 text-dark-300";
  }
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "az once";
  if (diffMin < 60) return `${diffMin} dk once`;
  if (diffHour < 24) return `${diffHour} saat once`;
  if (diffDay === 1) return "dun";
  if (diffDay < 7) return `${diffDay} gun once`;
  return new Date(dateStr).toLocaleDateString("tr-TR");
}

function formatBanRemaining(bannedUntil: string): string {
  const remaining = new Date(bannedUntil).getTime() - Date.now();
  if (remaining <= 0) return "Sure doldu";
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)} gun ${hours % 24} saat`;
  return `${hours} saat ${mins} dakika`;
}

export function ForumPage() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("hot");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [banStatus, setBanStatus] = useState<{ isBanned: boolean; bannedUntil: string | null }>({ isBanned: false, bannedUntil: null });

  useEffect(() => {
    api.getForumBanStatus().then(setBanStatus).catch(() => {});
  }, []);

  const fetchTopics = useCallback(
    async (reset = true) => {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await api.getForumTopics({
          category: category || undefined,
          sort,
          cursor: reset ? undefined : cursor,
          limit: 20,
        });
        if (reset) {
          setTopics(res.topics);
        } else {
          setTopics((prev) => [...prev, ...res.topics]);
        }
        setCursor(res.next_cursor);
        setHasMore(!!res.next_cursor);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, sort, cursor],
  );

  useEffect(() => {
    fetchTopics(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sort]);

  const handleLike = async (e: React.MouseEvent, topicId: string) => {
    e.stopPropagation();
    try {
      const res = await api.toggleForumLike({ target_type: "topic", target_id: topicId });
      setTopics((prev) =>
        prev.map((t) =>
          t.id === topicId ? { ...t, likeCount: res.like_count, liked: res.liked } : t,
        ),
      );
    } catch {
      // silently fail
    }
  };

  // Separate pinned and regular topics
  const pinned = topics.filter((t) => t.isPinned);
  const regular = topics.filter((t) => !t.isPinned);
  const sortedTopics = [...pinned, ...regular];

  // Filter topics by search query
  const query = searchQuery.trim().toLowerCase();
  const filteredTopics = query
    ? sortedTopics.filter((t) => {
        const titleMatch = t.title.toLowerCase().includes(query);
        const authorName = t.isAnonymous ? "anonim" : (t.authorNickname ?? "anonim").toLowerCase();
        const authorMatch = authorName.includes(query);
        return titleMatch || authorMatch;
      })
    : sortedTopics;

  const isFiltering = query.length > 0;

  return (
    <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Forum</h1>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer ${
              category === c.value
                ? "bg-neon-500/20 text-neon-500 border border-neon-500/50"
                : "bg-dark-800 text-dark-400 border border-dark-700 hover:border-dark-500"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Sort tabs + Search + New topic button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6 border-b border-dark-700 pb-3">
        {/* Sort tabs */}
        <div className="flex gap-1 shrink-0">
          {SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSort(s.value)}
              className={`px-4 py-2 text-sm font-medium transition-all cursor-pointer border-b-2 ${
                sort === s.value
                  ? "border-neon-500 text-neon-500"
                  : "border-transparent text-dark-400 hover:text-dark-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Başlık veya yazar ara..."
            className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-9 pr-9 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* New topic button */}
        {!banStatus.isBanned && (
          <Button size="sm" className="shrink-0" onClick={() => setShowModal(true)}>
            <Plus size={16} className="mr-1" />
            Yeni Konu
          </Button>
        )}
      </div>

      {/* Ban info banner */}
      {banStatus.isBanned && banStatus.bannedUntil && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-4 mb-4 text-center">
          <p className="text-red-400 font-semibold text-sm">Forum erisimiz engellendi</p>
          <p className="text-xs text-red-300 mt-1">
            Kalan sure: {formatBanRemaining(banStatus.bannedUntil)}
          </p>
        </div>
      )}

      {/* Result count when filtering */}
      {isFiltering && !loading && (
        <p className="text-xs text-dark-400 mb-3">({filteredTopics.length} sonuç)</p>
      )}

      {/* Topic list */}
      {loading ? (
        <p className="text-sm text-dark-500 text-center py-12">Yukleniyor...</p>
      ) : filteredTopics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-dark-500">
          <MessageCircle size={48} className="mb-4 opacity-50" />
          <p className="text-sm">{isFiltering ? "Sonuç bulunamadı" : "Henuz konu yok"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTopics.map((topic) => (
            <div
              key={topic.id}
              onClick={() => navigate(`/forum/${topic.id}`)}
              className="flex gap-3 bg-dark-900 rounded-xl p-4 hover:bg-dark-800 transition-all cursor-pointer w-full"
            >
              {/* Like button - fixed width */}
              <div className="flex flex-col items-center gap-1 shrink-0 pt-1 w-10">
                <button
                  onClick={(e) => handleLike(e, topic.id)}
                  className={`transition-colors cursor-pointer ${
                    topic.liked ? "text-neon-500" : "text-dark-500 hover:text-neon-400"
                  }`}
                >
                  <Heart size={18} fill={topic.liked ? "currentColor" : "none"} />
                </button>
                <span className={`text-xs font-medium ${topic.liked ? "text-neon-500" : "text-dark-500"}`}>
                  {topic.likeCount}
                </span>
              </div>

              {/* Content - flex-1 takes all available space */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {topic.isPinned && <span className="text-xs" title="Sabitlendi">📌</span>}
                  {topic.isLocked && <span className="text-xs" title="Kilitli">🔒</span>}
                  <span
                    className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full ${categoryBadgeClass(topic.category)}`}
                  >
                    {topic.category}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-white mb-1 truncate">{topic.title}</h3>
                <p className="text-xs text-dark-400 line-clamp-2 mb-2">{topic.bodyPreview}</p>
                <div className="flex items-center gap-3 text-[10px] text-dark-500">
                  <span>
                    {topic.topBadgeIcon && <span className="mr-0.5">{topic.topBadgeIcon}</span>}
                    {topic.isAnonymous ? "Anonim" : topic.authorNickname ?? "Anonim"}
                  </span>
                </div>
              </div>

              {/* Right side - comment count + time, fixed width */}
              <div className="flex flex-col items-end justify-between shrink-0 py-1">
                <span className="flex items-center gap-1 text-xs text-dark-500">
                  <MessageCircle size={12} />
                  {topic.commentCount}
                </span>
                <span className="text-[10px] text-dark-500 whitespace-nowrap">
                  {relativeTime(topic.createdAt)}
                </span>
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && !isFiltering && (
            <div className="flex justify-center pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchTopics(false)}
                disabled={loadingMore}
              >
                {loadingMore ? "Yukleniyor..." : "Daha Fazla"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* New topic modal */}
      <NewTopicModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => fetchTopics(true)}
      />
    </div>
  );
}
