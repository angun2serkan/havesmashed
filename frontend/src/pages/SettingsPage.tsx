import { useState, useEffect } from "react";
import { Shield, Trash2, User, Pencil, Check, X, Award } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { BadgeGrid } from "@/components/Badges/BadgeGrid";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/services/api";
import type { Badge } from "@/types";

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setNickname = useAuthStore((s) => s.setNickname);
  const logout = useAuthStore((s) => s.logout);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(user?.nickname ?? "");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [badgesLoading, setBadgesLoading] = useState(true);

  useEffect(() => {
    api
      .getMyBadges()
      .then(setBadges)
      .catch(() => {})
      .finally(() => setBadgesLoading(false));
  }, []);

  const handleSaveNickname = async () => {
    const trimmed = nicknameInput.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 20) {
      setNicknameError("Nickname must be 3-20 characters");
      return;
    }
    setNicknameSaving(true);
    setNicknameError(null);
    try {
      const result = await api.setNickname(trimmed);
      setNickname(result.nickname, result.token);
      setEditingNickname(false);
    } catch (err) {
      setNicknameError(err instanceof Error ? err.message : "Failed to update nickname");
    } finally {
      setNicknameSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await api.deleteAccount();
      logout();
    } catch {
      // Error handling could be added here
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">
        <Card>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
            <User size={16} className="text-neon-500" />
            Account
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-dark-400">Nickname</span>
              {editingNickname ? (
                <div className="flex items-center gap-2">
                  <input
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    className="bg-dark-900 border border-dark-600 rounded-lg px-2 py-1 text-sm text-white w-36 focus:border-neon-500 focus:outline-none"
                    maxLength={20}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveNickname}
                    disabled={nicknameSaving}
                    className="text-accent-green hover:text-green-300 transition-colors cursor-pointer"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingNickname(false);
                      setNicknameInput(user?.nickname ?? "");
                      setNicknameError(null);
                    }}
                    className="text-dark-400 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-dark-200 font-medium">
                    {user?.nickname ?? "Not set"}
                  </span>
                  <button
                    onClick={() => {
                      setEditingNickname(true);
                      setNicknameInput(user?.nickname ?? "");
                    }}
                    className="text-dark-500 hover:text-neon-400 transition-colors cursor-pointer"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>
            {nicknameError && (
              <p className="text-xs text-red-400">{nicknameError}</p>
            )}
            <div className="flex justify-between">
              <span className="text-dark-400">Member Since</span>
              <span className="text-dark-200">
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : "--"}
              </span>
            </div>
          </div>
        </Card>

        {/* Badges */}
        <Card>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
            <Award size={16} className="text-neon-500" />
            Rozetler
          </h3>
          {badgesLoading ? (
            <p className="text-sm text-dark-500 text-center py-4">
              Yukleniyor...
            </p>
          ) : (
            <BadgeGrid badges={badges} showLocked={true} />
          )}
        </Card>

        </div>

        {/* Right column */}
        <div className="space-y-4">
        {/* Privacy */}
        <Card>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
            <Shield size={16} className="text-accent-cyan" />
            Default Privacy
          </h3>
          <div className="space-y-3">
            {[
              { label: "Share Countries", defaultChecked: true },
              { label: "Share Cities", defaultChecked: false },
              { label: "Share Dates", defaultChecked: false },
              { label: "Share Stats", defaultChecked: true },
            ].map(({ label, defaultChecked }) => (
              <label
                key={label}
                className="flex items-center justify-between cursor-pointer"
              >
                <span className="text-sm text-dark-200">{label}</span>
                <input
                  type="checkbox"
                  defaultChecked={defaultChecked}
                  className="accent-neon-500"
                />
              </label>
            ))}
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-900/50">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-400 mb-3">
            <Trash2 size={16} />
            Danger Zone
          </h3>

          {showDeleteConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-dark-300">
                Your account will be deactivated and permanently deleted after
                30 days. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-500 shadow-none"
                  onClick={handleDeleteAccount}
                >
                  Delete Account
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-dark-400">Delete your account</p>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            </div>
          )}
        </Card>

        <Button
          variant="secondary"
          className="w-full"
          onClick={logout}
        >
          Sign Out
        </Button>
        </div>
      </div>
    </div>
  );
}
