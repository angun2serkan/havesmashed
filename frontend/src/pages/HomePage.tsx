import { lazy, Suspense, useCallback } from "react";
import { DateEntryForm } from "@/components/DateEntry/DateEntryForm";
import { SimpleStatsCards } from "@/components/Stats/StatsCards";
import { SmashOverlay } from "@/components/SmashOverlay";
import { useLogStore } from "@/stores/logStore";

const GlobeView = lazy(() =>
  import("@/components/Globe/GlobeView").then((m) => ({ default: m.GlobeView }))
);
import { DateDetailModal } from "@/components/Globe/DateDetailModal";
import { CityInsightsModal } from "@/components/Globe/CityInsightsModal";
import type { DateDetailData } from "@/components/Globe/DateDetailModal";
import type { GlobePoint } from "@/components/Globe/GlobeView";
import { useFriendStore } from "@/stores/friendStore";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/services/api";
import { useState, useRef, useEffect } from "react";
import { ChevronUp, Star, Calendar, Smile, Dumbbell, MessageCircle, MapPin, Flag, Globe, Filter } from "lucide-react";
import { getCountryName } from "@/utils/countryName";
import type { Notification, FriendStats } from "@/types";

function fmtAvg(val: number | null): string {
  return val !== null ? val.toFixed(1) : "--";
}

export function HomePage() {
  const dates = useLogStore((s) => s.dates);
  const setFriendDates = useFriendStore((s) => s.setFriendDates);
  const connections = useFriendStore((s) => s.connections);
  const setConnections = useFriendStore((s) => s.setConnections);
  const currentUser = useAuthStore((s) => s.user);
  const [panelOpen, setPanelOpen] = useState(false);
  const touchStartY = useRef(0);
  const [smashNotifications, setSmashNotifications] = useState<Notification[]>([]);
  const [showSmash, setShowSmash] = useState(false);

  const setDates = useLogStore((s) => s.setDates);
  const setStats = useLogStore((s) => s.setStats);

  // Globe filter: "mine" | "all" | friend UUID
  const [globeFilter, setGlobeFilter] = useState<"mine" | "all" | string>("all");

  // Friend stats overlay
  const [selectedFriendStats, setSelectedFriendStats] = useState<FriendStats | null>(null);
  const [selectedFriendName, setSelectedFriendName] = useState("");
  const [selectedFriendColor, setSelectedFriendColor] = useState("");

  // Date detail modal
  const [selectedDate, setSelectedDate] = useState<DateDetailData | null>(null);
  const [dateModalOpen, setDateModalOpen] = useState(false);

  // City insights modal
  const [insightsCityId, setInsightsCityId] = useState<number | null>(null);
  const [insightsCityName, setInsightsCityName] = useState("");

  useEffect(() => {
    api.getDates().then((res) => setDates(res.dates)).catch(() => {});
    api.getStats().then(setStats).catch(() => {});
    api.getFriendDates().then(setFriendDates).catch(() => {});
    // Load connections for the filter dropdown
    api.getConnections("accepted").then(setConnections).catch(() => {});
  }, [setDates, setStats, setFriendDates, setConnections]);

  useEffect(() => {
    // Check for friend_date notifications on mount
    const lastCheck = sessionStorage.getItem("lastSmashCheck");
    const now = Date.now();

    // Only check once per session (don't show again if user navigates away and back)
    if (lastCheck && now - parseInt(lastCheck) < 60000) return;

    api
      .getNotifications()
      .then((notifs) => {
        const friendDateNotifs = notifs.filter(
          (n) => n.notificationType === "friend_date" && !n.isRead,
        );
        if (friendDateNotifs.length > 0) {
          setSmashNotifications(friendDateNotifs);
          setShowSmash(true);
          sessionStorage.setItem("lastSmashCheck", String(now));
        }
      })
      .catch(() => {});
  }, []);

  // Handle filter changes
  const handleFilterChange = useCallback(
    (value: string) => {
      setGlobeFilter(value);

      if (value === "mine") {
        // Show no friend dates — set empty array
        setFriendDates([]);
        setSelectedFriendStats(null);
        setSelectedFriendName("");
        setSelectedFriendColor("");
      } else if (value === "all") {
        // Refetch all friend dates
        api.getFriendDates().then(setFriendDates).catch(() => {});
        setSelectedFriendStats(null);
        setSelectedFriendName("");
        setSelectedFriendColor("");
      } else {
        // Specific friend UUID
        const friendId = value;
        api.getFriendDates(friendId).then(setFriendDates).catch(() => {});
        api.getFriendStats(friendId).then(setSelectedFriendStats).catch(() => {});

        // Find friend info from connections
        const conn = connections.find((c) => {
          const fId =
            c.requesterId === currentUser?.id ? c.responderId : c.requesterId;
          return fId === friendId;
        });
        setSelectedFriendName(conn?.friendNickname ?? "Anonim");
        setSelectedFriendColor(conn?.color ?? "#FF5733");
      }
    },
    [setFriendDates, connections, currentUser],
  );

  // Get the friend user ID from a connection
  const getFriendUserId = useCallback(
    (conn: (typeof connections)[number]) => {
      return conn.requesterId === currentUser?.id
        ? conn.responderId
        : conn.requesterId;
    },
    [currentUser],
  );

  const handleDateClick = useCallback((point: GlobePoint) => {
    setSelectedDate(point.dateData);
    setDateModalOpen(true);
  }, []);

  const handleSmashDismiss = () => {
    setShowSmash(false);
    // Mark all friend_date notifications as read
    for (const n of smashNotifications) {
      api.markNotificationRead(n.id).catch(() => {});
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]!.clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaY = touchStartY.current - e.changedTouches[0]!.clientY;
    if (deltaY > 60) setPanelOpen(true);
    if (deltaY < -60) setPanelOpen(false);
  };

  const acceptedConnections = connections.filter((c) => c.status === "accepted");

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {showSmash && smashNotifications.length > 0 && (
        <SmashOverlay
          notifications={smashNotifications}
          onDismiss={handleSmashDismiss}
        />
      )}

      {/* Globe fills entire screen — lazy loaded */}
      <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-dark-950"><div className="text-neon-500 animate-pulse text-lg">Loading Globe...</div></div>}>
        <GlobeView
          onDateClick={handleDateClick}
          onCityInsights={(id, name) => {
            setInsightsCityId(id);
            setInsightsCityName(name);
          }}
        />
      </Suspense>

      {/* Friend filter dropdown overlay */}
      <div className="absolute top-4 right-4 z-20">
        <div className="relative">
          <Filter
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none"
          />
          <select
            value={globeFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="bg-dark-900/90 backdrop-blur-md border border-dark-600 rounded-lg pl-8 pr-3 py-2 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-neon-500/50 hover:border-dark-500 transition-colors min-w-[140px]"
          >
            <option value="mine">Sadece Ben</option>
            <option value="all">Herkes</option>
            {acceptedConnections.map((c) => (
              <option key={c.id} value={getFriendUserId(c)}>
                {c.friendNickname ?? "Anonim"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Friend stats overlay — shown when a specific friend is selected */}
      {selectedFriendStats && selectedFriendName && (
        <div className="absolute top-16 right-4 z-20 w-64">
          <div
            className="bg-dark-900/90 backdrop-blur-md border rounded-xl p-3 space-y-2"
            style={{ borderColor: `${selectedFriendColor}40` }}
          >
            <p
              className="text-sm font-bold"
              style={{ color: selectedFriendColor }}
            >
              {selectedFriendName}
              <span className="text-dark-400 font-normal ml-1 text-xs">istatistikleri</span>
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-2 bg-dark-800/80 rounded-lg px-2 py-1.5">
                <MapPin size={12} style={{ color: selectedFriendColor }} />
                <div>
                  <p className="text-sm font-bold text-white leading-none">
                    {selectedFriendStats.totalDates}
                  </p>
                  <p className="text-[8px] text-dark-400 uppercase">Dates</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-dark-800/80 rounded-lg px-2 py-1.5">
                <Flag size={12} className="text-cyan-400" />
                <div>
                  <p className="text-sm font-bold text-white leading-none">
                    {selectedFriendStats.uniqueCountries}
                  </p>
                  <p className="text-[8px] text-dark-400 uppercase">Countries</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-dark-800/80 rounded-lg px-2 py-1.5">
                <Globe size={12} className="text-purple-400" />
                <div>
                  <p className="text-sm font-bold text-white leading-none">
                    {selectedFriendStats.uniqueCities}
                  </p>
                  <p className="text-[8px] text-dark-400 uppercase">Cities</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-dark-800/80 rounded-lg px-2 py-1.5">
                <Star size={12} className="text-yellow-400" />
                <div>
                  <p className="text-sm font-bold text-white leading-none">
                    {fmtAvg(selectedFriendStats.averageRating)}
                  </p>
                  <p className="text-[8px] text-dark-400 uppercase">Avg Rating</p>
                </div>
              </div>
            </div>
            {selectedFriendStats.badges.length > 0 && (
              <div className="pt-2 border-t border-dark-700">
                <p className="text-[8px] text-dark-500 uppercase mb-1">Rozetler</p>
                <div className="flex flex-wrap gap-1">
                  {selectedFriendStats.badges.map((b) => (
                    <span key={b.id} className="text-lg" title={b.name}>{b.icon}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile swipe-up panel */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 bg-dark-900/95 backdrop-blur-md border-t border-dark-700 rounded-t-2xl transition-transform duration-300 z-20 ${
          panelOpen ? "translate-y-0" : "translate-y-[calc(100%-3rem)]"
        }`}
        style={{ height: "60vh" }}
      >
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="w-full flex items-center justify-center py-2 cursor-pointer"
        >
          <ChevronUp
            size={20}
            className={`text-dark-400 transition-transform ${panelOpen ? "rotate-180" : ""}`}
          />
        </button>
        <div className="px-4 pb-20 overflow-y-auto h-[calc(100%-2rem)]">
          <SimpleStatsCards />
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
              Recent Dates
            </h3>
            {dates.length === 0 ? (
              <p className="text-dark-500 text-sm py-4 text-center">
                Tap a country on the globe to add your first date
              </p>
            ) : (
              dates.slice(0, 10).map((date) => (
                <div
                  key={date.id}
                  className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium">
                      {date.personNickname ? `${date.personNickname} — ` : ""}{date.cityName ? `${date.cityName}, ` : ""}{getCountryName(date.countryCode)}
                    </span>
                    <span className="text-xs text-dark-500 flex items-center gap-1">
                      <Calendar size={10} />
                      {date.dateAt}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-dark-400 capitalize">
                      {date.gender} / {date.ageRange}{date.heightRange ? ` / ${date.heightRange} cm` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      {date.faceRating !== null && (
                        <span className="text-[10px] text-pink-400 flex items-center gap-0.5">
                          <Smile size={9} />{date.faceRating}
                        </span>
                      )}
                      {date.bodyRating !== null && (
                        <span className="text-[10px] text-orange-400 flex items-center gap-0.5">
                          <Dumbbell size={9} />{date.bodyRating}
                        </span>
                      )}
                      {date.chatRating !== null && (
                        <span className="text-[10px] text-accent-cyan flex items-center gap-0.5">
                          <MessageCircle size={9} />{date.chatRating}
                        </span>
                      )}
                      <span className="text-xs text-neon-500 flex items-center gap-0.5">
                        <Star size={10} />{date.rating}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Desktop stats overlay */}
      <div className="hidden md:block absolute bottom-6 left-6 z-10 w-96">
        <SimpleStatsCards />
      </div>

      {/* Date entry form modal */}
      <DateEntryForm />

      {/* Date detail modal — opens on globe point click */}
      <DateDetailModal
        isOpen={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
        date={selectedDate}
      />

      {/* City insights modal — rendered at page level for proper centering */}
      {insightsCityId && (
        <CityInsightsModal
          isOpen={true}
          onClose={() => setInsightsCityId(null)}
          cityId={insightsCityId}
          cityName={insightsCityName}
        />
      )}
    </div>
  );
}
