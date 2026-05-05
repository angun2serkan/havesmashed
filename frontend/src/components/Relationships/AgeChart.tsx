import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
} from "recharts";
import type { Partner } from "@/types";

const PARTNER_COLORS = [
  "#ec4899", // pink
  "#a855f7", // purple
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f97316", // orange
  "#eab308", // yellow
  "#ef4444", // red
];

const USER_COLOR = "#fbbf24"; // amber — distinct from partner palette

function ageAt(birthday: string, year: number): number {
  const bd = new Date(birthday);
  return year - bd.getFullYear();
}

function yearOf(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}

interface AgeChartProps {
  partners: Partner[];
  userBirthday: string | null;
}

export function AgeChart({ partners, userBirthday }: AgeChartProps) {
  const { data, yDomain, singleRanges } = useMemo(() => {
    if (partners.length === 0) {
      return {
        data: [] as Array<Record<string, number | string>>,
        yDomain: [0, 0] as [number, number],
        singleRanges: [] as Array<[number, number]>,
      };
    }

    const currentYear = new Date().getFullYear();
    const startYears = partners.map((p) => yearOf(p.relationshipStart));
    const endYears = partners.map((p) =>
      p.relationshipEnd ? yearOf(p.relationshipEnd) : currentYear,
    );

    const minYear = Math.min(...startYears);
    const maxYear = Math.max(...endYears, currentYear);

    const rows: Array<Record<string, number | string>> = [];
    const allAges: number[] = [];
    const yearsWithPartner: boolean[] = [];

    for (let y = minYear; y <= maxYear; y++) {
      const row: Record<string, number | string> = { year: y };
      let hasPartnerThisYear = false;

      if (userBirthday) {
        const ua = ageAt(userBirthday, y);
        row["Sen"] = ua;
        allAges.push(ua);
      }

      for (const p of partners) {
        const ps = yearOf(p.relationshipStart);
        const pe = p.relationshipEnd ? yearOf(p.relationshipEnd) : currentYear;
        if (y >= ps && y <= pe) {
          const a = ageAt(p.birthday, y);
          row[p.name] = a;
          allAges.push(a);
          hasPartnerThisYear = true;
        }
      }

      yearsWithPartner.push(hasPartnerThisYear);
      rows.push(row);
    }

    // Compute tight Y domain — pad by 2 for visual breathing room
    const minAge = allAges.length > 0 ? Math.min(...allAges) : 0;
    const maxAge = allAges.length > 0 ? Math.max(...allAges) : 0;
    const domain: [number, number] = [
      Math.max(0, Math.floor(minAge) - 2),
      Math.ceil(maxAge) + 2,
    ];

    // Group consecutive single-years into [from, to] ranges
    const ranges: Array<[number, number]> = [];
    let runStart: number | null = null;
    for (let i = 0; i < yearsWithPartner.length; i++) {
      const year = minYear + i;
      if (!yearsWithPartner[i]) {
        if (runStart === null) runStart = year;
      } else if (runStart !== null) {
        ranges.push([runStart, minYear + i - 1]);
        runStart = null;
      }
    }
    if (runStart !== null) ranges.push([runStart, maxYear]);

    return { data: rows, yDomain: domain, singleRanges: ranges };
  }, [partners, userBirthday]);

  if (partners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-dark-400 text-sm">
        Grafik için en az bir partner ekle
      </div>
    );
  }

  return (
    <div className="w-full h-80">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3042" />

          {/* Single-period background bands — drawn before lines so they sit behind */}
          {singleRanges.map(([from, to], i) => (
            <ReferenceArea
              key={`single-${i}`}
              x1={from}
              x2={to}
              fill="#475569"
              fillOpacity={0.18}
              stroke="none"
              ifOverflow="visible"
              label={
                from === to
                  ? { value: "single", position: "insideTop", fill: "#94a3b8", fontSize: 9 }
                  : { value: "single", position: "insideTop", fill: "#94a3b8", fontSize: 10 }
              }
            />
          ))}

          <XAxis
            dataKey="year"
            stroke="#7a849a"
            tick={{ fill: "#7a849a", fontSize: 11 }}
            allowDecimals={false}
          />
          <YAxis
            stroke="#7a849a"
            tick={{ fill: "#7a849a", fontSize: 11 }}
            domain={yDomain}
            allowDecimals={false}
            label={{ value: "Yaş", angle: -90, position: "insideLeft", fill: "#7a849a", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: "#1a1f2e",
              border: "1px solid #2a3042",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#e5e7eb" }}
            labelFormatter={(label) => `Yıl: ${label}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />

          {/* Partner lines first so user line draws on top */}
          {partners.map((p, i) => {
            const color = PARTNER_COLORS[i % PARTNER_COLORS.length];
            return (
              <Line
                key={p.id}
                type="monotone"
                dataKey={p.name}
                stroke={color}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
                activeDot={{ r: 6, stroke: "#0f1116", strokeWidth: 2 }}
                connectNulls={false}
              />
            );
          })}

          {userBirthday && (
            <Line
              type="monotone"
              dataKey="Sen"
              stroke={USER_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{
                r: 4,
                fill: "#0f1116",
                stroke: USER_COLOR,
                strokeWidth: 2,
              }}
              activeDot={{ r: 6, fill: USER_COLOR, stroke: "#0f1116", strokeWidth: 2 }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
