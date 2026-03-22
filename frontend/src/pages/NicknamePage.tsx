import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";

const NICKNAME_REGEX = /^[a-zA-Z0-9_.]{3,30}$/;

export function NicknamePage() {
  const navigate = useNavigate();
  const { token, setNickname: storeSetNickname } = useAuthStore();
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValid = NICKNAME_REGEX.test(nickname);

  const handleSubmit = async () => {
    if (!isValid) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/nickname", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nickname }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to set nickname");
      }

      storeSetNickname(json.data.nickname, json.data.token);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set nickname. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-neon-500 text-glow mb-1">
            havesmashed
          </h1>
          <p className="text-dark-400 text-sm">
            Almost there!
          </p>
        </div>

        <div className="bg-dark-800 border border-dark-600 rounded-xl p-6">
          <div className="space-y-6">
            <div className="text-center">
              <UserPen size={48} className="mx-auto text-neon-500 mb-3" />
              <h2 className="text-xl font-bold text-white mb-2">
                Choose a Nickname
              </h2>
              <p className="text-sm text-dark-300">
                Pick a unique nickname for your profile. This is how others will
                see you.
              </p>
            </div>

            <div>
              <input
                type="text"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isValid) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="your_nickname"
                maxLength={30}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-3 text-sm font-mono text-white placeholder:text-dark-500 focus:outline-none focus:border-neon-500"
              />

              <ul className="mt-3 space-y-1 text-xs text-dark-400">
                <li className={nickname.length >= 3 && nickname.length <= 30 ? "text-green-400" : ""}>
                  3-30 characters
                </li>
                <li className={nickname.length > 0 && /^[a-zA-Z0-9_.]+$/.test(nickname) ? "text-green-400" : ""}>
                  Letters, numbers, underscores, and dots only
                </li>
              </ul>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!isValid || loading}
              className="w-full"
              size="lg"
            >
              {loading ? "Setting nickname..." : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
