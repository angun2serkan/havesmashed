import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { UserPlus, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FriendList } from "@/components/Friends/FriendList";
import { InviteLink } from "@/components/Friends/InviteLink";
import { api } from "@/services/api";
import { useFriendStore } from "@/stores/friendStore";

export function FriendsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const setConnections = useFriendStore((s) => s.setConnections);

  useEffect(() => {
    // Always load friends on mount
    refreshFriends();

    if (searchParams.get("added") === "true") {
      setAddSuccess(true);
      setSearchParams({}, { replace: true });
      setTimeout(() => setAddSuccess(false), 4000);
    }

    const autoAddCode = searchParams.get("auto_add");
    if (autoAddCode) {
      setSearchParams({}, { replace: true });
      (async () => {
        setAdding(true);
        try {
          await api.addFriendByCode(autoAddCode);
          setAddSuccess(true);
          await refreshFriends();
          setTimeout(() => setAddSuccess(false), 4000);
        } catch (err) {
          setAddError(err instanceof Error ? err.message : "Failed to add friend");
        } finally {
          setAdding(false);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshFriends = async () => {
    try {
      const connections = await api.getConnections();
      setConnections(connections);
    } catch {
      // silently fail
    }
  };

  const handleAddFriend = async () => {
    const trimmed = code.trim();
    if (trimmed.length === 0) return;

    setAdding(true);
    setAddError(null);
    setAddSuccess(false);

    try {
      await api.addFriendByCode(trimmed);
      setAddSuccess(true);
      setCode("");
      await refreshFriends();
      setTimeout(() => setAddSuccess(false), 4000);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add friend");
    } finally {
      setAdding(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    setCode(upper);
    setAddError(null);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-white mb-2">Friends</h1>
      <p className="text-sm text-dark-400 mb-6">
        Invite new users or connect with existing ones
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Add friend + Invite links */}
        <div className="space-y-6">
          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus size={18} className="text-neon-500" />
              <h3 className="text-sm font-semibold text-white">Add Friend</h3>
            </div>

            <p className="text-xs text-dark-400">
              Enter a friend code to connect with an existing user.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="ABC12XY9"
                maxLength={8}
                className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-center text-sm font-mono uppercase tracking-[0.15em] text-white placeholder:text-dark-600 focus:outline-none focus:border-neon-500/50 focus:shadow-[0_0_10px_rgba(255,0,127,0.15)]"
              />
              <Button
                onClick={handleAddFriend}
                disabled={adding || code.length === 0}
                className="bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 border border-neon-500/30"
              >
                {adding ? "Adding..." : "Add"}
              </Button>
            </div>

            {addSuccess && (
              <div className="flex items-center gap-2 bg-green-900/30 border border-green-800/50 rounded-lg px-3 py-2">
                <Check size={16} className="text-green-400 shrink-0" />
                <p className="text-xs text-green-300">Friend added successfully!</p>
              </div>
            )}

            {addError && (
              <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-lg px-3 py-2">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <p className="text-xs text-red-300">{addError}</p>
              </div>
            )}
          </Card>

          <InviteLink />
        </div>

        {/* Right column: Friend list */}
        <div>
          <FriendList />
        </div>
      </div>
    </div>
  );
}
