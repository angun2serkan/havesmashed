import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { api } from "@/services/api";
import type { Notification } from "@/types";

function typeBadge(notificationType: string) {
  switch (notificationType) {
    case "friend_date":
      return (
        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-neon-500/20 text-neon-500">
          Friend Date
        </span>
      );
    case "badge":
      return (
        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/20 text-yellow-400">
          Badge
        </span>
      );
    default:
      return (
        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-dark-600/50 text-dark-400">
          System
        </span>
      );
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

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getNotifications()
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
        <h1 className="text-2xl font-bold text-white mb-6">Notifications</h1>
        <p className="text-sm text-dark-500 text-center py-12">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-white mb-6">Notifications</h1>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-dark-500">
          <Bell size={48} className="mb-4 opacity-50" />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-lg">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.isRead && handleMarkRead(n.id)}
              className={`w-full text-left rounded-xl p-4 transition-all ${
                n.isRead
                  ? "bg-dark-900 opacity-70"
                  : "bg-dark-800 border-l-2 border-neon-500 cursor-pointer"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3
                    className={`text-sm ${
                      n.isRead
                        ? "text-dark-300 font-normal"
                        : "text-white font-bold"
                    }`}
                  >
                    {n.title}
                  </h3>
                  {typeBadge(n.notificationType)}
                </div>
                <span className="text-[10px] text-dark-500 whitespace-nowrap shrink-0">
                  {relativeTime(n.createdAt)}
                </span>
              </div>
              <p
                className={`text-xs mt-1 ${
                  n.isRead ? "text-dark-500" : "text-dark-300"
                }`}
              >
                {n.message}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
