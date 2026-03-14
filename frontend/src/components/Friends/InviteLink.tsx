import { useState } from "react";
import { Link2, Copy, Check, UserPlus, QrCode, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/services/api";
import type { InviteResponse } from "@/types";

export function InviteLink() {
  const [platformInvite, setPlatformInvite] = useState<InviteResponse | null>(null);
  const [friendInvite, setFriendInvite] = useState<InviteResponse | null>(null);
  const [copiedPlatform, setCopiedPlatform] = useState(false);
  const [copiedFriend, setCopiedFriend] = useState(false);
  const [loadingPlatform, setLoadingPlatform] = useState(false);
  const [loadingFriend, setLoadingFriend] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePlatformInvite = async () => {
    setLoadingPlatform(true);
    setError(null);
    try {
      const result = await api.createInvite("platform");
      setPlatformInvite(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setLoadingPlatform(false);
    }
  };

  const generateFriendLink = async () => {
    setLoadingFriend(true);
    setError(null);
    try {
      const result = await api.createInvite("friend");
      setFriendInvite(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create friend link");
    } finally {
      setLoadingFriend(false);
    }
  };

  const handleCopy = async (link: string, type: "platform" | "friend") => {
    await navigator.clipboard.writeText(link);
    if (type === "platform") {
      setCopiedPlatform(true);
      setTimeout(() => setCopiedPlatform(false), 2000);
    } else {
      setCopiedFriend(true);
      setTimeout(() => setCopiedFriend(false), 2000);
    }
  };

  const formatExpiry = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-lg px-3 py-2">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Platform Invite */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus size={18} className="text-neon-500" />
          <h3 className="text-sm font-semibold text-white">Invite to App</h3>
        </div>

        <p className="text-xs text-dark-400">
          Generate a platform invite link for a new user to register.
          Limited to 3/month, 10 total.
        </p>

        {platformInvite ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={platformInvite.link}
                className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs font-mono text-dark-200 truncate"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleCopy(platformInvite.link, "platform")}
              >
                {copiedPlatform ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            </div>
            <p className="text-[10px] text-dark-500">
              Expires in {formatExpiry(platformInvite.expiresInSecs)}
            </p>
          </div>
        ) : (
          <Button
            onClick={generatePlatformInvite}
            disabled={loadingPlatform}
            className="w-full bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 border border-neon-500/30 shadow-[0_0_15px_rgba(255,0,127,0.15)]"
          >
            {loadingPlatform ? "Generating..." : "Generate Platform Invite"}
          </Button>
        )}
      </Card>

      {/* Friend Add Link */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Link2 size={18} className="text-neon-500" />
          <h3 className="text-sm font-semibold text-white">Friend Link</h3>
        </div>

        <p className="text-xs text-dark-400">
          Create a friend add link to connect with existing users.
          Share the link or let them scan the QR code.
        </p>

        {friendInvite ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={friendInvite.link}
                className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs font-mono text-dark-200 truncate"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleCopy(friendInvite.link, "friend")}
              >
                {copiedFriend ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center gap-2 py-3">
              <div className="flex items-center gap-1.5 text-dark-400 mb-1">
                <QrCode size={14} />
                <span className="text-xs font-medium">Scan to Add</span>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-[0_0_20px_rgba(255,0,127,0.2)]">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(friendInvite.link)}&bgcolor=FFFFFF&color=000000`}
                  alt="Friend invite QR code"
                  width={180}
                  height={180}
                  className="rounded"
                />
              </div>
            </div>

            <p className="text-[10px] text-dark-500 text-center">
              Expires in {formatExpiry(friendInvite.expiresInSecs)}
            </p>
          </div>
        ) : (
          <Button
            onClick={generateFriendLink}
            disabled={loadingFriend}
            className="w-full bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 border border-neon-500/30 shadow-[0_0_15px_rgba(255,0,127,0.15)]"
          >
            {loadingFriend ? "Generating..." : "Create Friend Link"}
          </Button>
        )}
      </Card>
    </div>
  );
}
