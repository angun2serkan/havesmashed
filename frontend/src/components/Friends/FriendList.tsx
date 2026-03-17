import { useState, useRef, useEffect } from "react";
import { UserCheck, UserX, Clock, Wifi } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useFriendStore } from "@/stores/friendStore";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/services/api";
import type { Badge } from "@/types";

const COLOR_PALETTE = [
  "#FF5733", "#FF007F", "#00E5FF", "#39FF14", "#BF00FF",
  "#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#F7DC6F",
  "#BB8FCE", "#85C1E9",
];

function ColorPicker({
  currentColor,
  connectionId,
}: {
  currentColor: string;
  connectionId: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const updateConnectionColor = useFriendStore((s) => s.updateConnectionColor);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = async (color: string) => {
    setOpen(false);
    updateConnectionColor(connectionId, color);
    try {
      await api.setFriendColor(connectionId, color);
    } catch {
      // revert on failure
      updateConnectionColor(connectionId, currentColor);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-5 h-5 rounded-full border-2 border-dark-600 hover:border-dark-400 transition-colors cursor-pointer shrink-0"
        style={{ backgroundColor: currentColor }}
        aria-label="Change friend color"
      />
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-8 bg-dark-800 border border-dark-600 rounded-lg p-2 shadow-xl z-30 min-w-[140px]">
          <div className="grid grid-cols-4 gap-1.5">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                onClick={() => handleSelect(color)}
                className="w-6 h-6 rounded-full cursor-pointer transition-all duration-150 hover:scale-125"
                style={{
                  backgroundColor: color,
                  boxShadow:
                    color === currentColor
                      ? `0 0 0 2px #1a1a2e, 0 0 0 3px ${color}`
                      : "none",
                }}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FriendBadgeSection({ friendId }: { friendId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleToggle = async () => {
    if (!expanded && !loaded) {
      setLoading(true);
      try {
        const data = await api.getFriendBadges(friendId);
        setBadges(data);
        setLoaded(true);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    setExpanded((prev) => !prev);
  };

  const earnedCount = loaded ? badges.filter((b) => b.earned).length : null;

  return (
    <div className="inline-flex flex-col">
      <button
        onClick={handleToggle}
        className="inline-flex items-center gap-1 text-[10px] text-yellow-400 hover:text-yellow-300 transition-colors cursor-pointer"
      >
        <span>&#127942;</span>
        {loading ? "..." : earnedCount !== null ? earnedCount : ""}
      </button>
      {expanded && loaded && badges.length > 0 && (
        <div className="flex gap-1.5 mt-1.5 overflow-x-auto max-w-[200px] pb-1">
          {badges
            .filter((b) => b.earned)
            .map((badge) => (
              <div
                key={badge.id}
                className="shrink-0 flex flex-col items-center rounded-lg bg-dark-900 border border-dark-700 px-1.5 py-1 min-w-[40px]"
                title={`${badge.name}: ${badge.description}`}
              >
                <span className="text-base leading-none">{badge.icon}</span>
                <span className="text-[8px] text-dark-400 mt-0.5 truncate max-w-[36px]">
                  {badge.name}
                </span>
              </div>
            ))}
          {badges.filter((b) => b.earned).length === 0 && (
            <span className="text-[10px] text-dark-500">Henuz rozet yok</span>
          )}
        </div>
      )}
    </div>
  );
}

export function FriendList() {
  const currentUser = useAuthStore((s) => s.user);
  const connections = useFriendStore((s) => s.connections);
  const pendingRequests = useFriendStore((s) => s.pendingRequests);
  const updateConnectionStatus = useFriendStore((s) => s.updateConnectionStatus);
  const removeConnection = useFriendStore((s) => s.removeConnection);

  const handleRemove = async (id: string) => {
    try {
      await api.deleteConnection(id);
      removeConnection(id);
    } catch {
      // silently fail
    }
  };

  const acceptedFriends = connections.filter((c) => c.status === "accepted");

  return (
    <div className="space-y-4">
      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-3">
            Pending Requests
          </h3>
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <Card key={req.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock size={18} className="text-yellow-400" />
                  <div className="flex flex-col">
                    <span className="text-sm text-white font-medium">
                      {req.friendNickname ?? "Unknown"}
                    </span>
                    <span className="text-[10px] text-dark-500">
                      Wants to connect
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => updateConnectionStatus(req.id, "accepted")}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateConnectionStatus(req.id, "rejected")}
                  >
                    Decline
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Friends */}
      <div>
        <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-3">
          Friends ({acceptedFriends.length})
        </h3>
        {acceptedFriends.length === 0 ? (
          <Card className="text-center py-8">
            <UserCheck size={32} className="mx-auto text-dark-500 mb-3" />
            <p className="text-dark-400 text-sm">No friends yet</p>
            <p className="text-dark-500 text-xs mt-1">
              Share a friend link to connect with others
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {acceptedFriends.map((conn) => {
              const friendId =
                conn.requesterId === currentUser?.id
                  ? conn.responderId
                  : conn.requesterId;
              return (
                <Card
                  key={conn.id}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <ColorPicker
                      currentColor={conn.color}
                      connectionId={conn.id}
                    />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium">
                          {conn.topBadgeIcon && <span className="mr-1">{conn.topBadgeIcon}</span>}
                          {conn.friendNickname ?? "Unknown"}
                        </span>
                        <FriendBadgeSection friendId={friendId} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] text-accent-green">
                          <Wifi size={10} />
                          Connected
                        </span>
                        <span className="text-[10px] text-dark-600">
                          since{" "}
                          {new Date(conn.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(conn.id)}
                    className="text-dark-400 hover:text-red-400"
                  >
                    <UserX size={16} />
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
