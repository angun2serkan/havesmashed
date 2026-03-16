import { useEffect } from "react";
import type { Notification } from "@/types";

interface SmashOverlayProps {
  notifications: Notification[]; // friend_date type only
  onDismiss: () => void;
}

export function SmashOverlay({ notifications, onDismiss }: SmashOverlayProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    const handleKey = () => onDismiss();
    window.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onDismiss]);

  const first = notifications[0];
  const rest = notifications.length - 1;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center cursor-pointer"
      onClick={onDismiss}
    >
      {/* GIF placeholder */}
      <div className="mb-8">
        <img
          src="/smash.gif"
          alt="Smash!"
          className="max-w-xs md:max-w-sm rounded-xl"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="text-6xl font-bold text-neon-500 text-glow animate-pulse text-center">
          SMASH!
        </div>
      </div>

      {/* Notification card */}
      {first && (
        <div className="bg-dark-800 border border-neon-500/30 rounded-xl p-5 max-w-sm text-center shadow-[0_0_30px_rgba(255,0,127,0.3)]">
          <p className="text-white font-semibold text-lg">{first.title}</p>
          <p className="text-dark-300 text-sm mt-1">{first.message}</p>
          {rest > 0 && (
            <p className="text-dark-500 text-xs mt-3">and {rest} more...</p>
          )}
        </div>
      )}

      <p className="text-dark-500 text-sm mt-8 animate-pulse">
        Tap to continue
      </p>
    </div>
  );
}
