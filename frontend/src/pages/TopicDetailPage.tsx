import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Reply, Lock, Flag } from "lucide-react";
import { api } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { ReportModal } from "@/components/Forum/ReportModal";
import type { ForumTopic, ForumComment } from "@/types";

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

function depthClasses(depth: number): string {
  if (depth === 1) return "ml-6 pl-4 border-l-2 border-dark-600";
  if (depth >= 2) return "ml-12 pl-4 border-l-2 border-dark-700";
  return "";
}

function formatBanRemaining(bannedUntil: string): string {
  const remaining = new Date(bannedUntil).getTime() - Date.now();
  if (remaining <= 0) return "Sure doldu";
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)} gun ${hours % 24} saat`;
  return `${hours} saat ${mins} dakika`;
}

export function TopicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<ForumTopic | null>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [banStatus, setBanStatus] = useState<{ isBanned: boolean; bannedUntil: string | null }>({ isBanned: false, bannedUntil: null });
  const [reportTarget, setReportTarget] = useState<{ type: "topic" | "comment"; id: string } | null>(null);

  useEffect(() => {
    api.getForumBanStatus().then(setBanStatus).catch(() => {});
  }, []);

  const fetchTopic = async () => {
    if (!id) return;
    try {
      const res = await api.getForumTopic(id);
      setTopic(res.topic);
      setComments(res.comments);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleTopicLike = async () => {
    if (!topic) return;
    try {
      const res = await api.toggleForumLike({ target_type: "topic", target_id: topic.id });
      setTopic((prev) => (prev ? { ...prev, likeCount: res.like_count, liked: res.liked } : prev));
    } catch {
      // silently fail
    }
  };

  const handleCommentLike = async (commentId: string) => {
    try {
      const res = await api.toggleForumLike({ target_type: "comment", target_id: commentId });
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, likeCount: res.like_count, liked: res.liked } : c,
        ),
      );
    } catch {
      // silently fail
    }
  };

  const handleSubmitComment = async () => {
    if (!id || !commentBody.trim()) return;
    setSubmitting(true);
    try {
      await api.createForumComment(id, { body: commentBody.trim() });
      setCommentBody("");
      await fetchTopic();
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!id || !replyBody.trim()) return;
    setSubmittingReply(true);
    try {
      await api.createForumComment(id, { body: replyBody.trim(), parent_id: parentId });
      setReplyBody("");
      setReplyTo(null);
      await fetchTopic();
    } catch {
      // silently fail
    } finally {
      setSubmittingReply(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
        <p className="text-sm text-dark-500 text-center py-12">Yukleniyor...</p>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
        <p className="text-sm text-dark-500 text-center py-12">Konu bulunamadi.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
      {/* Back button */}
      <button
        onClick={() => navigate("/forum")}
        className="flex items-center gap-1 text-sm text-dark-400 hover:text-neon-500 transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft size={16} />
        Forum
      </button>

      {/* Topic */}
      <div className="bg-dark-900 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {topic.isPinned && <span className="text-xs">📌</span>}
          {topic.isLocked && <span className="text-xs">🔒</span>}
          <span
            className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full ${categoryBadgeClass(topic.category)}`}
          >
            {topic.category}
          </span>
          <span className="text-[10px] text-dark-500">
            {topic.topBadgeIcon && <span className="mr-0.5">{topic.topBadgeIcon}</span>}
            {topic.isAnonymous ? "Anonim" : topic.authorNickname ?? "Anonim"}
          </span>
          <span className="text-[10px] text-dark-500">{relativeTime(topic.createdAt)}</span>
        </div>

        <h1 className="text-xl font-bold text-white mb-3">{topic.title}</h1>
        <p className="text-sm text-dark-300 whitespace-pre-wrap mb-4">{topic.body}</p>

        <div className="flex items-center gap-4 pt-3 border-t border-dark-700">
          <button
            onClick={handleTopicLike}
            className={`flex items-center gap-1.5 text-sm transition-colors cursor-pointer ${
              topic.liked ? "text-neon-500" : "text-dark-500 hover:text-neon-400"
            }`}
          >
            <Heart size={16} fill={topic.liked ? "currentColor" : "none"} />
            <span>{topic.likeCount}</span>
          </button>
          <button
            onClick={() => setReportTarget({ type: "topic", id: topic.id })}
            className="flex items-center gap-1.5 text-sm text-dark-500 hover:text-red-400 transition-colors cursor-pointer"
          >
            <Flag size={16} />
            <span>Raporla</span>
          </button>
        </div>
      </div>

      {/* Locked banner */}
      {topic.isLocked && (
        <div className="flex items-center gap-2 bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 mb-6">
          <Lock size={16} className="text-dark-400" />
          <span className="text-sm text-dark-400">Bu konu kilitli</span>
        </div>
      )}

      {/* Ban banner */}
      {banStatus.isBanned && banStatus.bannedUntil && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-4 mb-6 text-center">
          <p className="text-red-400 font-semibold">Forum erisimiz engellendi</p>
          <p className="text-sm text-red-300 mt-1">
            Kalan sure: {formatBanRemaining(banStatus.bannedUntil)}
          </p>
        </div>
      )}

      {/* Comment input */}
      {!topic.isLocked && !banStatus.isBanned && (
        <div className="bg-dark-900 rounded-xl p-4 mb-6">
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Yorumunuzu yazin..."
            rows={3}
            className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors resize-none mb-3"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmitComment}
              disabled={submitting || !commentBody.trim()}
            >
              {submitting ? "Gonderiliyor..." : "Gonder"}
            </Button>
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-dark-300 mb-3">
          Yorumlar ({comments.length})
        </h2>
        {comments.length === 0 ? (
          <p className="text-xs text-dark-500 py-4">Henuz yorum yok.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className={`py-3 ${depthClasses(comment.depth)}`}>
              {comment.deleted ? (
                <p className="text-sm text-dark-500 italic">[Bu yorum silindi]</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-dark-300">
                      {comment.topBadgeIcon && <span className="mr-0.5">{comment.topBadgeIcon}</span>}
                      {comment.authorNickname}
                    </span>
                    <span className="text-[10px] text-dark-500">
                      {relativeTime(comment.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-dark-200 mb-2">{comment.body}</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleCommentLike(comment.id)}
                      className={`flex items-center gap-1 text-xs transition-colors cursor-pointer ${
                        comment.liked ? "text-neon-500" : "text-dark-500 hover:text-neon-400"
                      }`}
                    >
                      <Heart size={12} fill={comment.liked ? "currentColor" : "none"} />
                      <span>{comment.likeCount}</span>
                    </button>
                    {!topic.isLocked && !banStatus.isBanned && comment.depth < 2 && (
                      <button
                        onClick={() => {
                          setReplyTo(replyTo === comment.id ? null : comment.id);
                          setReplyBody("");
                        }}
                        className="flex items-center gap-1 text-xs text-dark-500 hover:text-neon-400 transition-colors cursor-pointer"
                      >
                        <Reply size={12} />
                        Yanitla
                      </button>
                    )}
                    <button
                      onClick={() => setReportTarget({ type: "comment", id: comment.id })}
                      className="flex items-center gap-1 text-xs text-dark-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Flag size={12} />
                      Raporla
                    </button>
                  </div>

                  {/* Inline reply input */}
                  {replyTo === comment.id && (
                    <div className="mt-3 ml-2">
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="Yanitinizi yazin..."
                        rows={2}
                        className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors resize-none mb-2"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReplyTo(null);
                            setReplyBody("");
                          }}
                        >
                          Iptal
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSubmitReply(comment.id)}
                          disabled={submittingReply || !replyBody.trim()}
                        >
                          {submittingReply ? "..." : "Gonder"}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Report modal */}
      {reportTarget && (
        <ReportModal
          isOpen={true}
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
        />
      )}
    </div>
  );
}
