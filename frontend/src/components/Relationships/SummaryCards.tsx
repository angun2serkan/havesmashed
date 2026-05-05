import { useMemo } from "react";
import { Heart, Clock, TrendingUp, Smile, Calendar, Activity } from "lucide-react";
import type { Partner } from "@/types";

function diffMonths(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return (
    (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  );
}

function ageOnDate(birthday: string, on: string): number {
  const bd = new Date(birthday);
  const d = new Date(on);
  let age = d.getFullYear() - bd.getFullYear();
  const m = d.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < bd.getDate())) age--;
  return age;
}

interface SummaryCardsProps {
  partners: Partner[];
  userBirthday: string | null;
}

export function SummaryCards({ partners, userBirthday }: SummaryCardsProps) {
  const stats = useMemo(() => {
    if (partners.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);

    const durations = partners.map((p) =>
      diffMonths(p.relationshipStart, p.relationshipEnd ?? today),
    );
    const longest = Math.max(...durations);
    const longestPartner = partners[durations.indexOf(longest)];
    const totalMonths = durations.reduce((a, b) => a + b, 0);
    const avg = Math.round(totalMonths / partners.length);

    const ongoing = partners.filter((p) => !p.relationshipEnd);

    // Average age gap (using user age at relationship start)
    let avgGap: number | null = null;
    if (userBirthday) {
      const gaps = partners.map((p) => {
        const userAge = ageOnDate(userBirthday, p.relationshipStart);
        const partnerAge = ageOnDate(p.birthday, p.relationshipStart);
        return partnerAge - userAge;
      });
      const sum = gaps.reduce((a, b) => a + b, 0);
      avgGap = Math.round((sum / gaps.length) * 10) / 10;
    }

    const scored = partners.filter((p) => p.satisfactionScore != null);
    const avgScore =
      scored.length > 0
        ? Math.round(
            (scored.reduce((a, b) => a + (b.satisfactionScore ?? 0), 0) /
              scored.length) *
              10,
          ) / 10
        : null;

    return {
      total: partners.length,
      longest,
      longestPartner,
      avg,
      totalMonths,
      ongoing,
      avgGap,
      avgScore,
    };
  }, [partners, userBirthday]);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Stat
        icon={<Heart size={14} className="text-pink-400" />}
        label="Partner"
        value={stats.total.toString()}
      />
      <Stat
        icon={<TrendingUp size={14} className="text-neon-500" />}
        label="En uzun"
        value={formatMonths(stats.longest)}
        sub={stats.longestPartner?.name}
      />
      <Stat
        icon={<Clock size={14} className="text-accent-cyan" />}
        label="Ortalama"
        value={formatMonths(stats.avg)}
      />
      <Stat
        icon={<Calendar size={14} className="text-accent-purple" />}
        label="Toplam"
        value={formatMonths(stats.totalMonths)}
      />
      {stats.avgGap !== null && (
        <Stat
          icon={<Activity size={14} className="text-orange-400" />}
          label="Ort. yaş farkı"
          value={`${stats.avgGap > 0 ? "+" : ""}${stats.avgGap}`}
          sub="yıl"
        />
      )}
      {stats.avgScore !== null && (
        <Stat
          icon={<Smile size={14} className="text-yellow-400" />}
          label="Memnuniyet"
          value={`${stats.avgScore}/10`}
        />
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-dark-400 mb-1">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold text-white truncate">{value}</div>
      {sub && <div className="text-[10px] text-dark-500 truncate">{sub}</div>}
    </div>
  );
}

function formatMonths(m: number): string {
  if (m < 12) return `${m} ay`;
  const years = Math.floor(m / 12);
  const months = m % 12;
  if (months === 0) return `${years} yıl`;
  return `${years}y ${months}a`;
}
