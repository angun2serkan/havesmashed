import { useState, useRef, useMemo, useEffect } from "react";
import html2canvas from "html2canvas";
import { WrappedCard } from "./WrappedCard";
import { useLogStore } from "@/stores/logStore";
import { useAuthStore } from "@/stores/authStore";
import { getCountryName } from "@/utils/countryName";
import { api } from "@/services/api";
import type { Badge } from "@/types";

export function ShareWrapped() {
  const stats = useLogStore((s) => s.stats);
  const dates = useLogStore((s) => s.dates);
  const user = useAuthStore((s) => s.user);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    api.getMyBadges().then(setBadges).catch(() => {});
  }, []);

  // Compute top city from dates
  const topCity = useMemo(() => {
    const counts: Record<string, number> = {};
    dates.forEach((d) => {
      if (d.cityName) counts[d.cityName] = (counts[d.cityName] ?? 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? null;
  }, [dates]);

  // Compute top country from dates
  const topCountry = useMemo(() => {
    const counts: Record<string, number> = {};
    dates.forEach((d) => {
      counts[d.countryCode] = (counts[d.countryCode] ?? 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const code = entries[0]?.[0];
    return code ? getCountryName(code) : null;
  }, [dates]);

  // Find highest-tier earned badge
  const topBadgeInfo = useMemo(() => {
    const earned = badges.filter((b) => b.earned);
    if (earned.length === 0) return null;
    const tierOrder: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };
    earned.sort((a, b) => (tierOrder[b.tier] ?? 0) - (tierOrder[a.tier] ?? 0));
    const best = earned[0];
    return best ? { icon: best.icon, name: best.name } : null;
  }, [badges]);

  const handleGenerate = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: null,
        useCORS: true,
      });
      const url = canvas.toDataURL("image/png");
      setPreviewUrl(url);
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!previewUrl) return;

    const response = await fetch(previewUrl);
    const blob = await response.blob();
    const file = new File([blob], "havesmashed-wrapped.png", {
      type: "image/png",
    });

    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "My havesmashed Wrapped",
        text: "Check out my dating stats on havesmashed!",
        files: [file],
      });
    } else {
      downloadImage();
    }
  };

  const downloadImage = () => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = "havesmashed-wrapped.png";
    a.click();
  };

  return (
    <>
      {/* Hidden card for rendering */}
      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div ref={cardRef}>
          <WrappedCard
            nickname={user?.nickname ?? "anonymous"}
            stats={stats}
            topCity={topCity}
            topCountry={topCountry}
            dateCount={stats.totalDates}
            topBadge={topBadgeInfo?.icon}
            topBadgeName={topBadgeInfo?.name}
            streak={stats.currentStreak}
          />
        </div>
      </div>

      {/* Button + Preview */}
      {!previewUrl ? (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer
            bg-neon-500 text-white hover:bg-neon-400 glow-sm hover:glow-md active:scale-95
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? "Generating..." : "Share My Stats"}
        </button>
      ) : (
        <div className="space-y-3">
          <img
            src={previewUrl}
            alt="Wrapped"
            className="w-full max-w-sm mx-auto rounded-xl border border-dark-700"
          />
          <div className="flex gap-2 justify-center">
            <button
              onClick={handleShare}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-neon-500 text-white hover:bg-neon-400 glow-sm active:scale-95 transition-all duration-200 cursor-pointer"
            >
              Share
            </button>
            <button
              onClick={downloadImage}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-dark-700 text-dark-100 border border-dark-500 hover:border-neon-500 hover:text-neon-400 transition-all duration-200 cursor-pointer"
            >
              Save
            </button>
            <button
              onClick={() => setPreviewUrl(null)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-dark-300 hover:text-neon-400 hover:bg-dark-800 transition-all duration-200 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
