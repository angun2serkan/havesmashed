import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SeedPhraseInput } from "@/components/Auth/SeedPhraseInput";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/services/api";

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (secretPhrase: string) => {
    setLoading(true);
    setError("");

    try {
      // SEC-102 + SEC-103: api.login wrapper'ı credentials + CSRF header'ı
      // otomatik yönetir. Eski direct fetch path'i kaldırıldı.
      const { user_id, nickname } = await api.login(secretPhrase);

      setAuth({
        id: user_id,
        nickname: nickname || null,
        createdAt: new Date().toISOString(),
        inviteCount: 0,
        isActive: true,
      });

      const searchParams = new URLSearchParams(window.location.search);
      const friendCode = searchParams.get("friend_code");

      if (friendCode) {
        try {
          await api.addFriendByCode(friendCode);
          navigate("/friends?added=true");
        } catch {
          navigate("/friends");
        }
      } else if (!nickname) {
        navigate("/nickname");
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sign in. Please check your recovery phrase.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="havesmashed"
            className="w-28 h-28 mx-auto mb-3 object-contain drop-shadow-[0_0_16px_rgba(244,114,182,0.35)]"
          />
          <p className="text-dark-400 text-sm">
            Your anonymous travel map
          </p>
        </div>

        <div className="bg-dark-800 border border-dark-600 rounded-xl p-6">
          <SeedPhraseInput onSubmit={handleLogin} loading={loading} />
          {error && (
            <p className="text-red-400 text-sm mt-3 text-center">{error}</p>
          )}
        </div>

        <p className="text-center text-dark-500 text-xs mt-6">
          Registration is invite-only. Ask a friend or admin for an invite link.
        </p>
      </div>
    </div>
  );
}
