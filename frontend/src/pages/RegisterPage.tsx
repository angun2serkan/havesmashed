import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SeedPhraseDisplay } from "@/components/Auth/SeedPhraseDisplay";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

type Step = "create" | "display";

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();
  const [step, setStep] = useState<Step>("create");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [registrationData, setRegistrationData] = useState<{
    userId: string;
    token: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    setLoading(true);
    setError("");

    try {
      const inviteId = searchParams.get("invite_id");
      const body: Record<string, string> = {};
      if (inviteId) body.invite_id = inviteId;

      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Registration failed");
      }

      setSeedPhrase(json.data.secret_phrase);
      setRegistrationData({
        userId: json.data.user_id,
        token: json.data.token,
      });
      setStep("display");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Registration failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!registrationData) return;

    setAuth(
      {
        id: registrationData.userId,
        nickname: null,
        createdAt: new Date().toISOString(),
        inviteCount: 0,
        isActive: true,
      },
      registrationData.token,
    );

    navigate("/nickname");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-neon-500 text-glow mb-1">
            havesmashed
          </h1>
          <p className="text-dark-400 text-sm">
            Create your anonymous account
          </p>
        </div>

        <div className="bg-dark-800 border border-dark-600 rounded-xl p-6">
          {step === "create" && (
            <div className="text-center space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-2">
                  Anonymous Registration
                </h2>
                <p className="text-sm text-dark-300">
                  No email, no password. We'll generate a 12-word recovery
                  phrase that acts as your identity.
                </p>
              </div>
              <Button
                onClick={handleCreate}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </Button>
            </div>
          )}

          {step === "display" && (
            <SeedPhraseDisplay
              phrase={seedPhrase}
              onConfirm={handleConfirm}
            />
          )}

          {error && (
            <p className="text-red-400 text-sm mt-3 text-center">{error}</p>
          )}
        </div>

        <p className="text-center text-dark-400 text-sm mt-6">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-neon-500 hover:text-neon-400 transition-colors"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
