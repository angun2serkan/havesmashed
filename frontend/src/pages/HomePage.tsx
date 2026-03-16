import { GlobeView } from "@/components/Globe/GlobeView";
import { DateEntryForm } from "@/components/DateEntry/DateEntryForm";
import { StatsCards } from "@/components/Stats/StatsCards";
import { SmashOverlay } from "@/components/SmashOverlay";
import { useLogStore } from "@/stores/logStore";
import { useFriendStore } from "@/stores/friendStore";
import { api } from "@/services/api";
import { useState, useRef, useEffect } from "react";
import { ChevronUp, Star, Calendar, Smile, Dumbbell, MessageCircle } from "lucide-react";
import { getCountryName } from "@/utils/countryName";
import type { Notification } from "@/types";

export function HomePage() {
  const dates = useLogStore((s) => s.dates);
  const setFriendDates = useFriendStore((s) => s.setFriendDates);
  const [panelOpen, setPanelOpen] = useState(false);
  const touchStartY = useRef(0);
  const [smashNotifications, setSmashNotifications] = useState<Notification[]>([]);
  const [showSmash, setShowSmash] = useState(false);

  const setDates = useLogStore((s) => s.setDates);
  const setStats = useLogStore((s) => s.setStats);

  useEffect(() => {
    api.getDates().then((res) => setDates(res.dates)).catch(() => {});
    api.getStats().then(setStats).catch(() => {});
    api.getFriendDates().then(setFriendDates).catch(() => {});
  }, [setDates, setStats, setFriendDates]);

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

      {/* Globe fills entire screen */}
      <GlobeView />

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
          <StatsCards />
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
                      {date.gender} / {date.ageRange}
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
        <StatsCards />
      </div>

      {/* Date entry form modal */}
      <DateEntryForm />
    </div>
  );
}
