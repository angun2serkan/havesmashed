import { useState } from "react";
import type { Badge } from "@/types";

interface BadgeGridProps {
  badges: Badge[];
  showLocked?: boolean; // true = show all (locked grayed out), false = only earned
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

function genderGlow(gender: string): string {
  switch (gender) {
    case "male":
      return "border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.3)]";
    case "female":
      return "border-pink-500/40 shadow-[0_0_15px_rgba(236,72,153,0.3)]";
    case "lgbt":
      return "border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.3)]";
    default:
      return "border-neon-500/30 shadow-[0_0_15px_rgba(255,0,127,0.2)]";
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

export function BadgeGrid({ badges, showLocked = false }: BadgeGridProps) {
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");

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
          {visible.map((badge) => (
            <div
              key={badge.id}
              className={`group relative rounded-xl p-3 text-center transition-all duration-200 ${
                badge.earned
                  ? `bg-dark-800 border ${genderGlow(badge.gender)} ${genderHoverGlow(badge.gender)} hover:scale-105 cursor-default`
                  : "bg-dark-900 border border-dark-700 opacity-40"
              }`}
            >
              {/* Lock overlay for unearned */}
              {!badge.earned && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                  <span className="text-dark-600 text-lg">&#128274;</span>
                </div>
              )}

              {/* Gender indicator */}
              <div className="absolute top-1.5 right-1.5">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
