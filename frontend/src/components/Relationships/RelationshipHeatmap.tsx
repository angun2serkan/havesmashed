import { useMemo } from "react";
import type { Partner } from "@/types";

const MONTH_LABELS = ["O", "Ş", "M", "N", "M", "H", "T", "A", "E", "E", "K", "A"];
const MONTH_FULL = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function monthsInRelationship(partners: Partner[]): Set<string> {
  const result = new Set<string>();
  const today = new Date();
  for (const p of partners) {
    const start = new Date(p.relationshipStart);
    const end = p.relationshipEnd ? new Date(p.relationshipEnd) : today;
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const stop = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= stop) {
      result.add(`${cur.getFullYear()}-${cur.getMonth()}`);
      cur.setMonth(cur.getMonth() + 1);
    }
  }
  return result;
}

interface RelationshipHeatmapProps {
  partners: Partner[];
}

export function RelationshipHeatmap({ partners }: RelationshipHeatmapProps) {
  const { years, activeSet } = useMemo(() => {
    if (partners.length === 0) {
      return { years: [] as number[], activeSet: new Set<string>() };
    }
    const startYears = partners.map((p) => new Date(p.relationshipStart).getFullYear());
    const minYear = Math.min(...startYears);
    const maxYear = new Date().getFullYear();
    const yrs: number[] = [];
    for (let y = minYear; y <= maxYear; y++) yrs.push(y);
    return { years: yrs, activeSet: monthsInRelationship(partners) };
  }, [partners]);

  if (partners.length === 0) {
    return (
      <div className="text-dark-400 text-sm text-center py-6">
        Heatmap için partner ekle
      </div>
    );
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}`;

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-3 text-[10px] text-dark-400">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-pink-500/80 inline-block" />
          <span>İlişkide</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-dark-700 inline-block" />
          <span>Single</span>
        </div>
      </div>

      <div className="space-y-1">
        {/* Month header */}
        <div className="grid grid-cols-[3rem_repeat(12,_1fr)] gap-0.5 text-[10px] text-dark-400">
          <div></div>
          {MONTH_LABELS.map((m, i) => (
            <div key={i} className="text-center" title={MONTH_FULL[i]}>
              {m}
            </div>
          ))}
        </div>

        {years.map((y) => (
          <div key={y} className="grid grid-cols-[3rem_repeat(12,_1fr)] gap-0.5">
            <div className="text-[10px] text-dark-400 text-right pr-1 self-center">
              {y}
            </div>
            {Array.from({ length: 12 }).map((_, m) => {
              const key = `${y}-${m}`;
              const isFuture =
                y > today.getFullYear() ||
                (y === today.getFullYear() && m > today.getMonth());
              const isActive = activeSet.has(key);
              const isCurrent = key === todayKey;

              return (
                <div
                  key={m}
                  title={`${MONTH_FULL[m]} ${y}${isActive ? " — ilişkide" : isFuture ? "" : " — single"}`}
                  className={`aspect-square rounded-sm transition-colors ${
                    isFuture
                      ? "bg-transparent"
                      : isActive
                      ? "bg-pink-500/80 hover:bg-pink-400"
                      : "bg-dark-700 hover:bg-dark-600"
                  } ${isCurrent ? "ring-1 ring-neon-500" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
