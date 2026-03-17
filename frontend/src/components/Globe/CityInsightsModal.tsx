import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/services/api";
import type { CityInsights } from "@/types";
import {
  Loader2,
  Star,
  Smile,
  Dumbbell,
  MessageCircle,
  Activity,
  MapPin,
  Users,
  Ruler,
  TrendingUp,
} from "lucide-react";

interface CityInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: number;
  cityName: string;
}

function RatingBadge({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
  borderColor,
}: {
  label: string;
  value: number | null;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border ${bgColor} ${borderColor}`}
    >
      <Icon size={14} className={color} />
      <span className={`text-lg font-bold ${color}`}>
        {value !== null ? value.toFixed(1) : "—"}
      </span>
      <span className="text-[10px] text-dark-400 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

function TopList({
  title,
  items,
  icon: Icon,
  color,
}: {
  title: string;
  items: Array<{ name: string; count: number }>;
  icon: React.ElementType;
  color: string;
}) {
  const max = items[0]?.count ?? 1;
  return (
    <div>
      <h4 className="text-xs text-dark-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Icon size={12} style={{ color }} />
        {title}
      </h4>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={item.name} className="relative">
            <div
              className="absolute inset-0 rounded"
              style={{
                width: `${(item.count / max) * 100}%`,
                backgroundColor: `${color}15`,
              }}
            />
            <div className="relative flex items-center justify-between px-2 py-1 text-xs">
              <span className="text-dark-200">
                {i + 1}. {item.name}
              </span>
              <span className="text-dark-400 font-mono">{item.count}</span>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-dark-600">Veri yok</p>
        )}
      </div>
    </div>
  );
}

function GenderColumn({
  label,
  count,
  avgRating,
  avgFace,
  avgBody,
  avgChat,
  color,
  bgClass,
  borderClass,
}: {
  label: string;
  count: number;
  avgRating: number | null;
  avgFace: number | null;
  avgBody: number | null;
  avgChat: number | null;
  color: string;
  bgClass: string;
  borderClass: string;
}) {
  return (
    <div className={`flex-1 rounded-lg border p-3 ${bgClass} ${borderClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${color}`}>
          {label}
        </span>
        <span className={`text-xs font-mono ${color}`}>{count} date</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-dark-400">Avg Rating</span>
          <span className={`font-bold ${color}`}>
            {avgRating !== null ? avgRating.toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-dark-400">Face</span>
          <span className={`font-mono ${color}`}>
            {avgFace !== null ? avgFace.toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-dark-400">Body</span>
          <span className={`font-mono ${color}`}>
            {avgBody !== null ? avgBody.toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-dark-400">Chat</span>
          <span className={`font-mono ${color}`}>
            {avgChat !== null ? avgChat.toFixed(1) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CityInsightsModal({
  isOpen,
  onClose,
  cityId,
  cityName,
}: CityInsightsModalProps) {
  const [data, setData] = useState<CityInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !cityId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    api
      .getCityInsights(cityId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Bir hata olustu");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, cityId]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${cityName} — City Stats`}>
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={28} className="text-neon-500 animate-spin" />
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {data && data.totalDates < 5 && (
        <div className="text-center py-8">
          <MapPin size={32} className="mx-auto text-dark-500 mb-3" />
          <p className="text-dark-400 text-sm">
            Bu sehir icin henuz yeterli veri yok (minimum 5 date gerekli)
          </p>
        </div>
      )}

      {data && data.totalDates >= 5 && (
        <div className="space-y-5">
          {/* Header: total dates */}
          <div className="flex items-center gap-2 text-dark-300 text-sm">
            <Users size={14} className="text-neon-500" />
            <span>
              Toplam <span className="text-white font-bold">{data.totalDates}</span> date
            </span>
          </div>

          {/* Section 1: Overall Ratings */}
          <div>
            <h3 className="text-xs text-dark-400 uppercase tracking-wider mb-2">
              Overall Ratings
            </h3>
            <div className="grid grid-cols-4 gap-2">
              <RatingBadge
                label="Overall"
                value={data.avgRating}
                icon={Star}
                color="text-yellow-400"
                bgColor="bg-yellow-500/10"
                borderColor="border-yellow-500/20"
              />
              <RatingBadge
                label="Face"
                value={data.avgFace}
                icon={Smile}
                color="text-pink-400"
                bgColor="bg-pink-500/10"
                borderColor="border-pink-500/20"
              />
              <RatingBadge
                label="Body"
                value={data.avgBody}
                icon={Dumbbell}
                color="text-orange-400"
                bgColor="bg-orange-500/10"
                borderColor="border-orange-500/20"
              />
              <RatingBadge
                label="Chat"
                value={data.avgChat}
                icon={MessageCircle}
                color="text-accent-cyan"
                bgColor="bg-accent-cyan/10"
                borderColor="border-accent-cyan/20"
              />
            </div>
          </div>

          {/* Section 2: Gender Breakdown */}
          <div>
            <h3 className="text-xs text-dark-400 uppercase tracking-wider mb-2">
              Gender Breakdown
            </h3>
            <div className="flex gap-2">
              <GenderColumn
                label="Kadinlar"
                count={data.genderBreakdown.femaleCount}
                avgRating={data.genderBreakdown.avgRatingFemale}
                avgFace={data.genderBreakdown.avgFaceFemale}
                avgBody={data.genderBreakdown.avgBodyFemale}
                avgChat={data.genderBreakdown.avgChatFemale}
                color="text-pink-400"
                bgClass="bg-pink-500/5"
                borderClass="border-pink-500/20"
              />
              <GenderColumn
                label="Erkekler"
                count={data.genderBreakdown.maleCount}
                avgRating={data.genderBreakdown.avgRatingMale}
                avgFace={data.genderBreakdown.avgFaceMale}
                avgBody={data.genderBreakdown.avgBodyMale}
                avgChat={data.genderBreakdown.avgChatMale}
                color="text-blue-400"
                bgClass="bg-blue-500/5"
                borderClass="border-blue-500/20"
              />
            </div>
          </div>

          {/* Section 3: Top Lists */}
          <div className="grid grid-cols-1 gap-4">
            <TopList
              title="Top Activities"
              items={data.topActivities}
              icon={Activity}
              color="#bf00ff"
            />
            <TopList
              title="Top Venues"
              items={data.topVenues}
              icon={MapPin}
              color="#ff007f"
            />
            <TopList
              title="Top Meetings"
              items={data.topMeetings}
              icon={Users}
              color="#00e5ff"
            />
          </div>

          {/* Section 4: Height Distribution */}
          {data.heightDistribution.length > 0 && (
            <div>
              <h3 className="text-xs text-dark-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Ruler size={12} className="text-accent-green" />
                Height Distribution
              </h3>
              <div className="space-y-1">
                {data.heightDistribution.map((h) => {
                  const max = Math.max(
                    ...data.heightDistribution.map((x) => x.count),
                  );
                  return (
                    <div key={h.range} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-dark-300 text-right shrink-0">
                        {h.range}
                      </span>
                      <div className="flex-1 h-4 bg-dark-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-accent-green/30 rounded"
                          style={{
                            width: `${(h.count / max) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-dark-400 font-mono text-right">
                        {h.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 5: Monthly Trend */}
          {data.monthlyTrend.length > 0 && (
            <div>
              <h3 className="text-xs text-dark-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp size={12} className="text-neon-500" />
                Monthly Trend
              </h3>
              <div className="space-y-1">
                {data.monthlyTrend.map((m) => {
                  const max = Math.max(
                    ...data.monthlyTrend.map((x) => x.count),
                  );
                  return (
                    <div key={m.month} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-dark-300 text-right shrink-0 font-mono">
                        {m.month}
                      </span>
                      <div className="flex-1 h-3 bg-dark-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-neon-500/30 rounded"
                          style={{
                            width: `${(m.count / max) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-dark-400 font-mono text-right">
                        {m.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
