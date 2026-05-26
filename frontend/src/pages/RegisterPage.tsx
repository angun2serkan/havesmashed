import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SeedPhraseDisplay } from "@/components/Auth/SeedPhraseDisplay";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/services/api";

type Step = "create" | "display";

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();
  const [step, setStep] = useState<Step>("create");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [registrationData, setRegistrationData] = useState<{
    userId: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasInvite = !!searchParams.get("invite_token");

  const handleCreate = async () => {
    setLoading(true);
    setError("");

    try {
      const inviteToken = searchParams.get("invite_token");
      if (!inviteToken) {
        setError("An invite link is required to register.");
        setLoading(false);
        return;
      }

      // SEC-102 + SEC-103: api.register wrapper'ı credentials + CSRF
      // header'ı otomatik yönetir. Eski direct fetch kaldırıldı.
      const data = await api.register(inviteToken);
      setSeedPhrase(data.secret_phrase);
      setRegistrationData({ userId: data.user_id });
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

    setAuth({
      id: registrationData.userId,
      nickname: null,
      createdAt: new Date().toISOString(),
      inviteCount: 0,
      isActive: true,
    });

    navigate("/nickname");
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
            Create your anonymous account
          </p>
        </div>

        <div className="bg-dark-800 border border-dark-600 rounded-xl p-6">
          {step === "create" && (
            hasInvite ? (
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
            ) : (
              <div className="text-center space-y-4 py-4">
                <h2 className="text-xl font-bold text-white mb-2">
                  Invite Required
                </h2>
                <p className="text-sm text-dark-300">
                  You need an invite link to create an account. Ask a friend or an admin for one.
                </p>
              </div>
            )
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
