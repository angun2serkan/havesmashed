import { useState } from "react";
import { Share2 } from "lucide-react";
import type { Badge } from "@/types";
import { api } from "@/services/api";
import { ShareDialog } from "@/components/Share/ShareDialog";

interface BadgeGridProps {
  badges: Badge[];
  showLocked?: boolean; // true = show all (locked grayed out), false = only earned
  /** Earned badge'lerdeki share dialog default mesajını kişiselleştirmek için. */
  userNickname?: string | null;
  /** Default mesaj template'ine "32 date" gibi rakam koymak için. Opsiyonel. */
  dateCount?: number | null;
}

type GenderFilter = "all" | "male" | "female" | "lgbt" | "both";

function genderIndicator(gender: string) {
  switch (gender) {
    case "male":
      return <span className="text-[10px] text-blue-400">{"\u2642"}</span>;
    case "female":
      return <span className="text-[10px] text-pink-400">{"\u2640"}</span>;
    case "lgbt":
      return <span className="text-[10px] text-purple-400">{"\uD83C\uDF08"}</span>;
    default:
      return null;
  }
}

function tierStyle(tier: string): { borderColor: string; glowColor: string; label: string } {
  switch (tier) {
    // Premium: brand-sponsorlu badge'ler — magenta/deep purple, en güçlü glow.
    // Görsel olarak gold'un da üstünde, "sözleşmeli ayrıcalık" hissi verir.
    case "premium": return { borderColor: "#d946ef", glowColor: "rgba(217,70,239,0.5)", label: "PREMIUM" };
    case "gold": return { borderColor: "#facc15", glowColor: "rgba(250,204,21,0.3)", label: "GOLD" };
    case "silver": return { borderColor: "#94a3b8", glowColor: "rgba(148,163,184,0.3)", label: "SILVER" };
    default: return { borderColor: "#d97706", glowColor: "rgba(217,119,6,0.2)", label: "BRONZE" };
  }
}

function genderHoverGlow(gender: string): string {
  switch (gender) {
    case "male":
      return "hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]";
    case "female":
      return "hover:shadow-[0_0_20px_rgba(236,72,153,0.4)]";
    case "lgbt":
      return "hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]";
    default:
      return "hover:shadow-[0_0_20px_rgba(255,0,127,0.3)]";
  }
}

const genderFilterOptions: { label: string; value: GenderFilter }[] = [
  { label: "All", value: "all" },
  { label: "\u2642 Male", value: "male" },
  { label: "\u2640 Female", value: "female" },
  { label: "\uD83C\uDF08 LGBT", value: "lgbt" },
  { label: "General", value: "both" },
];

export function BadgeGrid({
  badges,
  showLocked = false,
  userNickname,
  dateCount,
}: BadgeGridProps) {
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [sharingBadge, setSharingBadge] = useState<Badge | null>(null);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://haveismash.com";

  const filtered =
    genderFilter === "all"
      ? badges
      : badges.filter((b) => b.gender === genderFilter);
  const visible = showLocked ? filtered : filtered.filter((b) => b.earned);

  return (
    <div>
      {/* Gender filter tabs - only when showing all badges (settings page) */}
      {showLocked && (
        <div className="flex flex-wrap gap-1 mb-3">
          {genderFilterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGenderFilter(opt.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                genderFilter === opt.value
                  ? "bg-neon-500/20 text-neon-400 border border-neon-500/30"
                  : "bg-dark-900 text-dark-400 border border-dark-700 hover:bg-dark-800 hover:text-dark-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-dark-500 text-center py-4">
          Henuz rozet yok
        </p>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {visible.map((badge) => {
            const ts = badge.earned ? tierStyle(badge.tier) : null;
            return (
            <div
              key={badge.id}
              className={`group relative rounded-xl p-3 text-center transition-all duration-200 ${
                badge.earned
                  ? `bg-dark-800 border ${genderHoverGlow(badge.gender)} hover:scale-105 cursor-default`
                  : "bg-dark-900 border border-dark-700 opacity-40"
              }`}
              style={
                badge.earned && ts
                  ? {
                      borderColor: ts.borderColor,
                      boxShadow: `0 0 15px ${ts.glowColor}`,
                    }
                  : undefined
              }
            >
              {/* Lock overlay for unearned */}
              {!badge.earned && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                  <span className="text-dark-600 text-lg">&#128274;</span>
                </div>
              )}

              {/* Tier label for earned badges */}
              {badge.earned && ts && (
                <span
                  className="absolute top-1 right-1 text-[7px] font-bold uppercase tracking-wider px-1 rounded"
                  style={{ color: ts.borderColor, backgroundColor: `${ts.borderColor}15` }}
                >
                  {ts.label}
                </span>
              )}

              {/* Gender indicator */}
              <div className={`absolute top-1.5 ${badge.earned ? "left-1.5" : "right-1.5"}`}>
                {genderIndicator(badge.gender)}
              </div>

              {/* Emoji icon */}
              <div
                className={`text-3xl leading-none ${
                  badge.earned ? "" : "grayscale opacity-50"
                }`}
              >
                {badge.icon}
              </div>

              {/* Badge name */}
              <p
                className={`text-xs font-medium mt-1 truncate ${
                  badge.earned ? "text-white" : "text-dark-500"
                }`}
              >
                {badge.name}
              </p>

              {/* Description - visible on hover for earned, always dim for locked */}
              <p
                className={`text-[10px] mt-0.5 line-clamp-2 ${
                  badge.earned
                    ? "text-dark-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    : "text-dark-600"
                }`}
              >
                {badge.description}
              </p>

              {/* Earned date */}
              {badge.earned && badge.earnedAt && (
                <p className="text-[10px] text-dark-500 mt-0.5">
                  {new Date(badge.earnedAt).toLocaleDateString()}
                </p>
              )}

              {/* Share button — earned badge'lerde, sadece hover'da görünür */}
              {badge.earned && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSharingBadge(badge);
                  }}
                  className="absolute bottom-1.5 right-1.5 p-1 rounded-full bg-dark-900/80 border border-dark-700 text-dark-400 hover:text-neon-400 hover:border-neon-500/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Paylaş"
                  title="Paylaş"
                >
                  <Share2 size={11} />
                </button>
              )}

              {/* Sponsor strip — only on earned & sponsored badges */}
              {badge.earned && badge.isSponsored && badge.sponsorName && (
                <SponsorStrip badge={badge} />
              )}
            </div>
            );
          })}
        </div>
      )}

      {sharingBadge && (
        <ShareDialog
          mode={{
            type: "badge",
            badge: sharingBadge,
            shareUrl: `${origin}/b/${sharingBadge.id}`,
            userNickname,
            dateCount,
          }}
          onClose={() => setSharingBadge(null)}
        />
      )}
    </div>
  );
}

function SponsorStrip({ badge }: { badge: Badge }) {
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!badge.sponsorClickUrl) return;
    // Fire-and-forget — don't block redirect on tracking failure.
    api.trackSponsorClick(badge.id).catch(() => {});
    const a = document.createElement("a");
    a.href = badge.sponsorClickUrl;
    a.rel = "noreferrer noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full flex items-center justify-center gap-1.5 py-1 rounded-md bg-dark-900/70 border border-dark-700 hover:border-neon-500/40 transition-colors"
      title={`Presented by ${badge.sponsorName}`}
    >
      {badge.sponsorLogoUrl && (
        <img
          src={badge.sponsorLogoUrl}
          alt={badge.sponsorName ?? ""}
          className="h-3 w-auto"
        />
      )}
      <span className="text-[9px] text-dark-300 uppercase tracking-wide truncate">
        Presented by {badge.sponsorName}
      </span>
    </button>
  );
}
