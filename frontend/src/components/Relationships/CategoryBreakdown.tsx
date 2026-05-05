import { useMemo } from "react";
import type { Partner, EndReason, HowWeMet } from "@/types";

const HOW_WE_MET_LABELS: Record<HowWeMet, string> = {
  app: "Uygulama",
  friends: "Arkadaş",
  work: "İş",
  school: "Okul",
  family: "Aile",
  random: "Tesadüf",
  other: "Diğer",
};

const END_REASON_LABELS: Record<EndReason, string> = {
  distance: "Uzaklık",
  lost_interest: "İlgi kaybı",
  cheating: "Aldatma",
  incompatibility: "Uyumsuzluk",
  mutual: "Karşılıklı",
  other: "Diğer",
};

const COLORS = [
  "#ec4899",
  "#a855f7",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#f97316",
  "#eab308",
];

interface BreakdownProps {
  partners: Partner[];
}

export function CategoryBreakdown({ partners }: BreakdownProps) {
  const meet = useMemo(() => {
    const counts: Partial<Record<HowWeMet, number>> = {};
    for (const p of partners) {
      if (p.howWeMet) counts[p.howWeMet] = (counts[p.howWeMet] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [partners]);

  const ended = useMemo(() => {
    const counts: Partial<Record<EndReason, number>> = {};
    for (const p of partners) {
      if (p.relationshipEnd && p.endReason)
        counts[p.endReason] = (counts[p.endReason] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [partners]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <BreakdownBlock
        title="Tanışma şekli"
        items={meet}
        labelMap={HOW_WE_MET_LABELS as Record<string, string>}
      />
      <BreakdownBlock
        title="Bitiş sebebi"
        items={ended}
        labelMap={END_REASON_LABELS as Record<string, string>}
      />
    </div>
  );
}

function BreakdownBlock({
  title,
  items,
  labelMap,
}: {
  title: string;
  items: Array<[string, number]>;
  labelMap: Record<string, string>;
}) {
  const total = items.reduce((a, [, v]) => a + v, 0);

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-dark-500">Henüz veri yok</p>
      ) : (
        <div className="space-y-2">
          {items.map(([key, count], i) => {
            const pct = Math.round((count / total) * 100);
            return (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-dark-200">{labelMap[key] ?? key}</span>
                  <span className="text-dark-400">
                    {count} <span className="text-dark-500">({pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-dark-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: COLORS[i % COLORS.length],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
