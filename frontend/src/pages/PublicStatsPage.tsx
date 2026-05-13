import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Activity,
  TrendingUp,
  Heart,
  MapPin,
  Shield,
  ArrowRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { api } from "@/services/api";

type Segment = { value: string; size: number };

type PublicStats = {
  as_of: string | null;
  headline: {
    as_of: string;
    total_users: number | null;
    dau: number | null;
    mau: number | null;
    total_dates_logged: number;
    new_users_today: number | null;
  } | null;
  segments: Record<string, Segment[]>;
  trend_30d: Array<{ date: string; dau: number | null; mau: number | null }>;
  k_threshold: number;
  anonymity_note: string;
};

const SEGMENT_LABELS = {
  single_proxy: "Single",
  active_dater_30d: "Active Dater (30g)",
  high_frequency_30d: "High Frequency (30g)",
  partner_gender_majority: "Partner Cinsiyet Çoğunluğu",
  partner_age_range: "Partner Yaş Dağılımı",
  top_city_dates: "Top Şehirler",
  tag_category: "Aktivite/Mekan Kategorileri",
} as const;

const VALUE_LABELS: Record<string, string> = {
  female_majority: "Çoğunluk Kadın",
  male_majority: "Çoğunluk Erkek",
  other_majority: "Çoğunluk Other",
  mixed: "Karışık",
  meeting: "Tanışma",
  venue: "Mekan",
  activity: "Aktivite",
  physical_male: "Fiziksel (E)",
  physical_female: "Fiziksel (K)",
  true: "Evet",
};

function labelValue(key: string, raw: string) {
  if (key === "top_city_dates") {
    const [city] = raw.split(",");
    return city;
  }
  return VALUE_LABELS[raw] ?? raw;
}

export function PublicStatsPage() {
  const [data, setData] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPublicStats()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Yüklenemedi"));
  }, []);

  return (
    <div className="min-h-screen bg-dark-950">
      <div className="max-w-5xl mx-auto px-4 py-12 md:py-20">
        {/* Hero */}
        <div className="text-center mb-12">
          <p className="text-xs font-mono text-neon-500 uppercase tracking-widest mb-3">
            havesmashed · public report
          </p>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Türkiye'nin dating <span className="text-neon-500">nabzı</span>
          </h1>
          <p className="text-base md:text-lg text-dark-300 max-w-2xl mx-auto leading-relaxed">
            Anonim aggregate. Bütün sayılar kohort başına en az{" "}
            <span className="text-white font-semibold">
              {data?.k_threshold ?? 1000}
            </span>{" "}
            kullanıcı temsil eder. Hiçbir kullanıcı verisi paylaşılmaz.
          </p>
          {data?.as_of && (
            <p className="text-xs text-dark-500 mt-4">
              Son güncelleme: {data.as_of}
            </p>
          )}
        </div>

        {error && (
          <Card className="border-red-900/50 mb-8">
            <p className="text-sm text-red-400">{error}</p>
          </Card>
        )}

        {!data && !error && (
          <div className="text-center py-20">
            <p className="text-dark-500">Yükleniyor…</p>
          </div>
        )}

        {data && (
          <>
            {/* Headline numbers */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <BigStat
                label="Kayıtlı Kullanıcı"
                value={data.headline?.total_users ?? null}
                icon={Users}
                color="text-neon-400"
              />
              <BigStat
                label="MAU (30g)"
                value={data.headline?.mau ?? null}
                icon={TrendingUp}
                color="text-accent-cyan"
              />
              <BigStat
                label="DAU"
                value={data.headline?.dau ?? null}
                icon={Activity}
                color="text-accent-green"
              />
              <BigStat
                label="Toplam Date"
                value={data.headline?.total_dates_logged ?? null}
                icon={Heart}
                color="text-pink-400"
              />
            </div>

            {/* Trend sparkline */}
            {data.trend_30d.length > 0 && (
              <Card className="mb-8">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
                  <Activity size={16} className="text-neon-500" />
                  Son 30 gün — DAU / MAU
                </h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trend_30d}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis
                        dataKey="date"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickFormatter={(d: string) => d.slice(5)}
                      />
                      <YAxis stroke="#94a3b8" fontSize={10} />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="dau"
                        stroke="#22c55e"
                        name="DAU"
                        dot={false}
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="mau"
                        stroke="#06b6d4"
                        name="MAU"
                        dot={false}
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Segment grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <SegmentBars
                title={SEGMENT_LABELS.partner_gender_majority}
                rows={data.segments.partner_gender_majority}
              />
              <SegmentBars
                title={SEGMENT_LABELS.partner_age_range}
                rows={data.segments.partner_age_range}
              />
              <SegmentSimple
                title={SEGMENT_LABELS.single_proxy}
                rows={data.segments.single_proxy}
                description="Aktif partner kaydı olmayan kullanıcı sayısı"
              />
              <SegmentSimple
                title={SEGMENT_LABELS.active_dater_30d}
                rows={data.segments.active_dater_30d}
                description="Son 30 günde 3+ date logu"
              />
              <SegmentBars
                title={SEGMENT_LABELS.tag_category}
                rows={data.segments.tag_category}
              />
              <SegmentBars
                title={SEGMENT_LABELS.high_frequency_30d}
                rows={data.segments.high_frequency_30d}
                description="Son 30 günde 5+ date logu"
              />
            </div>

            {/* Top cities */}
            {(data.segments.top_city_dates?.length ?? 0) > 0 && (
              <Card className="mb-8">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
                  <MapPin size={16} className="text-neon-500" />
                  En Aktif Şehirler — Date Sayısı
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(data.segments.top_city_dates ?? []).slice(0, 12).map((s, i) => (
                    <div
                      key={s.value}
                      className="flex items-center justify-between py-2 px-3 bg-dark-800/50 rounded-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-dark-500 font-mono w-6">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-sm text-dark-100 truncate">
                          {labelValue("top_city_dates", s.value)}
                        </span>
                      </div>
                      <span className="text-sm text-white font-mono">
                        {s.size.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Privacy + CTA */}
            <Card className="mb-8 border-accent-cyan/20 bg-accent-cyan/5">
              <div className="flex items-start gap-3">
                <Shield size={20} className="text-accent-cyan shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-white mb-2">
                    Anonimlik garantisi
                  </h2>
                  <p className="text-xs text-dark-300 leading-relaxed mb-2">
                    {data.anonymity_note}
                  </p>
                  <Link
                    to="/privacy"
                    className="inline-flex items-center gap-1 text-xs text-accent-cyan hover:text-cyan-300 transition-colors"
                  >
                    Detaylı gizlilik politikası <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </Card>

            <Card>
              <div className="text-center py-4">
                <p className="text-sm text-dark-300 mb-3">
                  Markalar için anonim reach paketi
                </p>
                <a
                  href="mailto:partners@haveismash.com?subject=havesmashed%20media%20kit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 transition-colors"
                >
                  Reklam paketini iste <ArrowRight size={14} />
                </a>
              </div>
            </Card>
          </>
        )}

        {/* Footer link */}
        <div className="text-center mt-12">
          <Link
            to="/"
            className="text-xs text-dark-500 hover:text-dark-300 transition-colors"
          >
            havesmashed.com
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 1200;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{display.toLocaleString()}</>;
}

function BigStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | null;
  icon: typeof Users;
  color: string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-wide text-dark-400 font-medium">
          {label}
        </span>
        <Icon size={16} className={color} />
      </div>
      <p className={`text-2xl md:text-3xl font-bold ${color}`}>
        {value === null ? (
          <span className="text-dark-500">…</span>
        ) : (
          <AnimatedCounter value={value} />
        )}
      </p>
      {value === null && (
        <p className="text-[10px] text-dark-500 mt-1">k&lt;1000</p>
      )}
    </Card>
  );
}

function SegmentBars({
  title,
  rows,
  description,
}: {
  title: string;
  rows?: Segment[];
  description?: string;
}) {
  const data = rows ?? [];
  const max = Math.max(1, ...data.map((r) => r.size));
  return (
    <Card>
      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
      {description && (
        <p className="text-[11px] text-dark-500 mb-3">{description}</p>
      )}
      {data.length === 0 ? (
        <p className="text-xs text-dark-500 py-4 text-center">
          k&lt;1000 — yayınlanmıyor
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((r) => (
            <div key={r.value}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-dark-200">{labelValue(title, r.value)}</span>
                <span className="text-white font-mono">
                  {r.size.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-neon-500 rounded-full transition-all duration-700"
                  style={{ width: `${(r.size / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SegmentSimple({
  title,
  rows,
  description,
}: {
  title: string;
  rows?: Segment[];
  description: string;
}) {
  const value = rows?.[0]?.size;
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wide text-dark-400 mb-1">
        {title}
      </p>
      <p className="text-3xl font-bold text-neon-400 mb-1">
        {value === undefined ? (
          <span className="text-dark-500">—</span>
        ) : (
          <AnimatedCounter value={value} />
        )}
      </p>
      <p className="text-xs text-dark-500">{description}</p>
      {value === undefined && (
        <p className="text-[10px] text-dark-500 mt-1">k&lt;1000 — yayınlanmıyor</p>
      )}
    </Card>
  );
}
