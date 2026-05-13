import { useState } from "react";
import { Copy, Check, UserPlus, QrCode, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import type { InviteResponse } from "@/types";

export function buildPlatformInviteMessage(
  nickname: string | null | undefined,
  dateCount: number | null | undefined,
  link: string,
): string {
  const name = nickname && nickname.trim().length > 0 ? nickname : "Arkadaşın";
  const count = typeof dateCount === "number" ? dateCount : 0;
  return `Hey ${name} sürekli sikişiyor (${count}) ona yetişmek için hemen Have I Smash'e katıl: ${link}`;
}

export function buildFriendInviteMessage(
  nickname: string | null | undefined,
  dateCount: number | null | undefined,
  code: string,
): string {
  const name = nickname && nickname.trim().length > 0 ? nickname : "Arkadaşın";
  const count = typeof dateCount === "number" ? dateCount : 0;
  return `Hey etrafındaki 5 kişinin ortalaması olduğun söylenir ve ${name} sürekli sikişiyor (${count}) Have I Smash'de arkadaş ol: ${code}`;
}

export function InviteLink() {
  const user = useAuthStore((s) => s.user);
  const [platformInvite, setPlatformInvite] = useState<InviteResponse | null>(null);
  const [platformDateCount, setPlatformDateCount] = useState<number | null>(null);
  const [friendInvite, setFriendInvite] = useState<InviteResponse | null>(null);
  const [friendDateCount, setFriendDateCount] = useState<number | null>(null);
  const [copiedPlatform, setCopiedPlatform] = useState(false);
  const [copiedFriendCode, setCopiedFriendCode] = useState(false);
  const [loadingPlatform, setLoadingPlatform] = useState(false);
  const [loadingFriend, setLoadingFriend] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePlatformInvite = async () => {
    setLoadingPlatform(true);
    setError(null);
    try {
      const [result, stats] = await Promise.all([
        api.createInvite("platform"),
        api.getStats().catch(() => null),
      ]);
      setPlatformInvite(result);
      setPlatformDateCount(stats?.totalDates ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setLoadingPlatform(false);
    }
  };

  const generateFriendCode = async () => {
    setLoadingFriend(true);
    setError(null);
    try {
      const [result, stats] = await Promise.all([
        api.createInvite("friend"),
        api.getStats().catch(() => null),
      ]);
      setFriendInvite(result);
      setFriendDateCount(stats?.totalDates ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate friend code");
    } finally {
      setLoadingFriend(false);
    }
  };

  const handleCopyPlatform = async (message: string) => {
    await navigator.clipboard.writeText(message);
    setCopiedPlatform(true);
    setTimeout(() => setCopiedPlatform(false), 2000);
  };

  const handleCopyFriendCode = async (message: string) => {
    await navigator.clipboard.writeText(message);
    setCopiedFriendCode(true);
    setTimeout(() => setCopiedFriendCode(false), 2000);
  };

  const formatExpiry = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatCode = (code: string) => {
    if (code.length <= 4) return code;
    return `${code.slice(0, 4)} ${code.slice(4)}`;
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
          (() => {
            const message = buildPlatformInviteMessage(
              user?.nickname,
              platformDateCount,
              platformInvite.link,
            );
            return (
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
                    onClick={() => handleCopyPlatform(message)}
                    title="Mesajı panoya kopyala"
                  >
                    {copiedPlatform ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                </div>
                <p className="text-[10px] text-dark-500">
                  Kopyala'ya basınca paylaşım mesajı panoya gider. Süre:{" "}
                  {formatExpiry(platformInvite.expiresInSecs)}
                </p>
              </div>
            );
          })()
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

      {/* Friend Code */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <QrCode size={18} className="text-neon-500" />
          <h3 className="text-sm font-semibold text-white">Friend Code</h3>
        </div>

        <p className="text-xs text-dark-400">
          Share this code or let them scan the QR to connect with existing users.
        </p>

        {friendInvite ? (
          (() => {
            const message = buildFriendInviteMessage(
              user?.nickname,
              friendDateCount,
              friendInvite.token,
            );
            return (
              <div className="space-y-3">
                {/* Code Display */}
                <div className="flex items-center justify-center gap-3 bg-dark-900 border border-neon-500/30 rounded-xl px-4 py-4 shadow-[0_0_20px_rgba(255,0,127,0.15)]">
                  <span className="text-2xl font-mono font-bold tracking-[0.2em] text-white text-glow">
                    {formatCode(friendInvite.token)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopyFriendCode(message)}
                    title="Mesajı panoya kopyala"
                  >
                    {copiedFriendCode ? <Check size={14} /> : <Copy size={14} />}
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
                  Kopyala'ya basınca paylaşım mesajı panoya gider. Süre:{" "}
                  {formatExpiry(friendInvite.expiresInSecs)}
                </p>
              </div>
            );
          })()
        ) : (
          <Button
            onClick={generateFriendCode}
            disabled={loadingFriend}
            className="w-full bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 border border-neon-500/30 shadow-[0_0_15px_rgba(255,0,127,0.15)]"
          >
            {loadingFriend ? "Generating..." : "Generate Friend Code"}
          </Button>
        )}
      </Card>

    </div>
  );
}
