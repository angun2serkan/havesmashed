import { MapPin, Flag, Globe, Star, Smile, Dumbbell, MessageCircle, Flame } from "lucide-react";
import { useLogStore } from "@/stores/logStore";
import type { LucideIcon } from "lucide-react";

// ── Neon Gauge ─────────────────────────────────────────────────

function NeonGauge({
  value,
  max = 10,
  label,
  icon: Icon,
  glowColor,
}: {
  value: number | null;
  max?: number;
  label: string;
  icon: LucideIcon;
  glowColor: string;
}) {
  const v = value ?? 0;
  const ratio = Math.min(v / max, 1);

  const cx = 90;
  const cy = 80;
  const r = 62;
  const strokeW = 6;
  const valueAngle = Math.PI - ratio * Math.PI;

  const arcPath = (start: number, end: number) => {
    const x1 = cx + r * Math.cos(start);
    const y1 = cy - r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy - r * Math.sin(end);
    const large = start - end > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  // Needle
  const needleLen = r - 14;
  const nx = cx + needleLen * Math.cos(valueAngle);
  const ny = cy - needleLen * Math.sin(valueAngle);

  // Scale labels
  const labels = [0, 5, 10];

  return (
    <div className="relative bg-dark-900/80 border border-dark-700/50 rounded-2xl p-4 flex flex-col items-center overflow-hidden group hover:border-dark-600 transition-all duration-300">
      {/* Ambient glow behind gauge */}
      <div
        className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full blur-3xl opacity-20 group-hover:opacity-35 transition-opacity duration-500"
        style={{ backgroundColor: glowColor }}
      />

      <svg width="180" height="100" viewBox="0 0 180 100" className="overflow-visible relative z-10">
        <defs>
          <filter id={`glow-${label}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path
          d={arcPath(Math.PI, 0)}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {v > 0 && (
          <path
            d={arcPath(Math.PI, valueAngle)}
            fill="none"
            stroke={glowColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            style={{ filter: `url(#glow-${label})` }}
          />
        )}

        {/* Outer ring (thin) */}
        <path
          d={arcPath(Math.PI, 0)}
          fill="none"
          stroke="#252540"
          strokeWidth="1"
        />

        {/* Inner ring (thin) */}
        <path
          d={arcPath(Math.PI, 0)}
          fill="none"
          stroke="#252540"
          strokeWidth="1"
          transform={`translate(0,0)`}
          style={{ transform: `scale(0.78)`, transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Scale labels */}
        {labels.map((t) => {
          const a = Math.PI - (t / max) * Math.PI;
          const lr = r + 14;
          const lx = cx + lr * Math.cos(a);
          const ly = cy - lr * Math.sin(a);
          return (
            <text
              key={t}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#4a4a6a"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="600"
            >
              {t}
            </text>
          );
        })}

        {/* Needle with glow */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke={glowColor}
          strokeWidth="2"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
        />

        {/* Center hub */}
        <circle cx={cx} cy={cy} r="6" fill="#111118" stroke={glowColor} strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="2.5" fill={glowColor} style={{ filter: `drop-shadow(0 0 4px ${glowColor})` }} />
      </svg>

      {/* Value + label */}
      <div className="text-center -mt-1 relative z-10">
        <p className="text-2xl font-black tracking-tight" style={{ color: glowColor, textShadow: `0 0 20px ${glowColor}60` }}>
          {value !== null ? value.toFixed(1) : "--"}
        </p>
        <div className="flex items-center justify-center gap-1.5 mt-0.5">
          <Icon size={12} style={{ color: glowColor }} />
          <span className="text-[10px] text-dark-400 font-semibold uppercase tracking-widest">{label}</span>
        </div>
      </div>
    </div>
  );
}

// ── Count stat card ────────────────────────────────────────────

function CountCard({
  value,
  label,
  icon: Icon,
  glowColor,
  subtitle,
}: {
  value: number;
  label: string;
  icon: LucideIcon;
  glowColor: string;
  subtitle?: string;
}) {
  return (
    <div className="relative bg-dark-900/80 border border-dark-700/50 rounded-2xl p-5 flex flex-col items-center overflow-hidden group hover:border-dark-600 transition-all duration-300">
      <div
        className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full blur-3xl opacity-15 group-hover:opacity-30 transition-opacity duration-500"
        style={{ backgroundColor: glowColor }}
      />
      <Icon size={20} className="mb-2 relative z-10" style={{ color: glowColor, filter: `drop-shadow(0 0 6px ${glowColor}80)` }} />
      <p className="text-3xl font-black text-white relative z-10 tracking-tight" style={{ textShadow: `0 0 15px ${glowColor}30` }}>
        {value}
      </p>
      <p className="text-[10px] text-dark-400 mt-1 font-semibold uppercase tracking-widest relative z-10">{label}</p>
      {subtitle && (
        <p className="text-[9px] text-dark-500 mt-0.5 relative z-10">{subtitle}</p>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────

export function StatsCards() {
  const stats = useLogStore((s) => s.stats);

  return (
    <div className="space-y-3">
      {/* Top row: count stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CountCard value={stats.totalDates} label="Total Dates" icon={MapPin} glowColor="#ff007f" />
        <CountCard value={stats.uniqueCountries} label="Countries" icon={Flag} glowColor="#00e5ff" />
        <CountCard value={stats.uniqueCities} label="Cities" icon={Globe} glowColor="#bf00ff" />
        <CountCard value={stats.currentStreak} label="Streak" icon={Flame} glowColor="#fb923c" subtitle={`En uzun: ${stats.longestStreak}`} />
      </div>

      {/* Bottom row: neon gauges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NeonGauge value={stats.averageFaceRating} label="Face" icon={Smile} glowColor="#ff007f" />
        <NeonGauge value={stats.averageBodyRating} label="Body" icon={Dumbbell} glowColor="#fb923c" />
        <NeonGauge value={stats.averageChatRating} label="Chat" icon={MessageCircle} glowColor="#00e5ff" />
        <NeonGauge value={stats.averageRating} label="Overall" icon={Star} glowColor="#facc15" />
      </div>
    </div>
  );
}

// ── Simple stats for Globe/HomePage overlay ────────────────────

function fmtAvg(val: number | null): string {
  return val !== null ? val.toFixed(1) : "--";
}

export function SimpleStatsCards() {
  const stats = useLogStore((s) => s.stats);

  const cards = [
    { label: "Dates", value: String(stats.totalDates), icon: MapPin, color: "#ff007f" },
    { label: "Countries", value: String(stats.uniqueCountries), icon: Flag, color: "#00e5ff" },
    { label: "Cities", value: String(stats.uniqueCities), icon: Globe, color: "#bf00ff" },
    { label: "Avg Rating", value: fmtAvg(stats.averageRating), icon: Star, color: "#facc15" },
    { label: "Streak", value: `${stats.currentStreak}`, icon: Flame, color: "#fb923c" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className="bg-dark-900/90 backdrop-blur-md border border-dark-700/50 rounded-xl p-3 flex items-center gap-3"
        >
          <Icon size={18} style={{ color, filter: `drop-shadow(0 0 4px ${color}80)` }} />
          <div>
            <p className="text-lg font-bold text-white leading-none">{value}</p>
            <p className="text-[10px] text-dark-400 uppercase tracking-wider">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
