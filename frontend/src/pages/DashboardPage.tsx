import { useEffect, useState, useMemo, useCallback } from "react";
import { StatsCards } from "@/components/Stats/StatsCards";
import { ShareWrapped } from "@/components/Stats/ShareWrapped";
import { Card } from "@/components/ui/Card";
import { useLogStore } from "@/stores/logStore";
import { api } from "@/services/api";
import { MapPin, Star, Calendar, Loader2, Smile, Dumbbell, MessageCircle, Filter, X, ChevronLeft, ChevronRight, Users, Trash2 } from "lucide-react";
import { loadTags, getTagById } from "@/data/tags";
import { getCountryName } from "@/utils/countryName";
import type { FriendDate } from "@/types";

function getTagColor(category: string): string {
  if (category === "meeting") return "bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30";
  if (category === "venue") return "bg-neon-500/15 text-neon-400 border-neon-500/30";
  if (category === "activity") return "bg-accent-purple/15 text-accent-purple border-accent-purple/30";
  return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
}

const GENDERS = ["all", "female", "male", "other"] as const;
const PAGE_SIZE = 10;

export function DashboardPage() {
  const dates = useLogStore((s) => s.dates);
  const setDates = useLogStore((s) => s.setDates);
  const setStats = useLogStore((s) => s.setStats);
  const removeDate = useLogStore((s) => s.removeDate);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [gender, setGender] = useState<string>("all");
  const [minRating, setMinRating] = useState<number>(0);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");

  // My Dates pagination (client-side)
  const [myPage, setMyPage] = useState(1);

  // Friend Dates state (cursor-based)
  const [friendDates, setFriendDates] = useState<FriendDate[]>([]);
  const [friendLoading, setFriendLoading] = useState(true);
  const [friendNextCursor, setFriendNextCursor] = useState<string | null>(null);
  const [friendCursorStack, setFriendCursorStack] = useState<string[]>([]);
  const [friendPage, setFriendPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [datesRes, statsRes] = await Promise.all([
          api.getDates(),
          api.getStats(),
          loadTags(),
        ]);
        if (!cancelled) {
          setDates(datesRes.dates);
          setStats(statsRes);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [setDates, setStats]);

  // Fetch friend dates
  const fetchFriendDates = useCallback(async (cursor?: string) => {
    setFriendLoading(true);
    try {
      const res = await api.getFriendDates(undefined, cursor, PAGE_SIZE);
      setFriendDates(res.dates);
      setFriendNextCursor(res.nextCursor);
    } catch {
      // silently fail
    } finally {
      setFriendLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFriendDates();
  }, [fetchFriendDates]);

  // Distinct values for dropdowns
  const countries = useMemo(() => {
    const codes = [...new Set(dates.map((d) => d.countryCode))].sort();
    return codes.map((c) => ({ code: c, name: getCountryName(c) }));
  }, [dates]);

  const cities = useMemo(() => {
    const cityMap = new Map<string, string>();
    for (const d of dates) {
      if (d.cityName && (!country || d.countryCode === country)) {
        cityMap.set(d.cityName, d.countryCode);
      }
    }
    return [...cityMap.keys()].sort();
  }, [dates, country]);

  // Apply filters
  const filteredDates = useMemo(() => {
    return dates.filter((d) => {
      if (dateFrom && d.dateAt < dateFrom) return false;
      if (dateTo && d.dateAt > dateTo) return false;
      if (gender !== "all" && d.gender !== gender) return false;
      if (minRating > 0 && d.rating < minRating) return false;
      if (country && d.countryCode !== country) return false;
      if (city && d.cityName !== city) return false;
      return true;
    });
  }, [dates, dateFrom, dateTo, gender, minRating, country, city]);

  // Reset my page when filters change
  useEffect(() => {
    setMyPage(1);
  }, [dateFrom, dateTo, gender, minRating, country, city]);

  const hasActiveFilters = dateFrom || dateTo || gender !== "all" || minRating > 0 || country || city;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setGender("all");
    setMinRating(0);
    setCountry("");
    setCity("");
  };

  // My Dates pagination calculations
  const myTotalPages = Math.max(1, Math.ceil(filteredDates.length / PAGE_SIZE));
  const myPageDates = filteredDates.slice((myPage - 1) * PAGE_SIZE, myPage * PAGE_SIZE);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Bu date kaydını silmek istediğinden emin misin? Bu işlem geri alınamaz.")) return;
      setDeletingId(id);
      try {
        await api.deleteDate(id);
        removeDate(id);
        api.getStats().then(setStats).catch(() => {});
      } catch (err) {
        alert(err instanceof Error ? err.message : "Silme başarısız");
      } finally {
        setDeletingId(null);
      }
    },
    [removeDate, setStats],
  );

  // Friend Dates pagination handlers
  const handleFriendNext = () => {
    if (!friendNextCursor) return;
    setFriendCursorStack((prev) => [...prev, friendNextCursor!]);
    setFriendPage((p) => p + 1);
    fetchFriendDates(friendNextCursor);
  };

  const handleFriendPrev = () => {
    if (friendPage <= 1) return;
    const newStack = [...friendCursorStack];
    newStack.pop(); // remove current cursor
    const prevCursor = newStack.length > 0 ? newStack[newStack.length - 1] : undefined;
    setFriendCursorStack(newStack);
    setFriendPage((p) => p - 1);
    fetchFriendDates(prevCursor);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <StatsCards />

      <div className="mt-4">
        <ShareWrapped />
      </div>

      {/* Filters - apply to My Dates only */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
            Filters
            {hasActiveFilters && (
              <span className="ml-2 text-neon-400 normal-case">
                ({filteredDates.length} of {dates.length})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
              >
                <X size={12} />
                Clear
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                showFilters || hasActiveFilters
                  ? "bg-neon-500/20 text-neon-400 border border-neon-500/30"
                  : "bg-dark-800 text-dark-400 border border-dark-700 hover:border-dark-500"
              }`}
            >
              <Filter size={12} />
              Filters
              {hasActiveFilters && (
                <span className="w-4 h-4 rounded-full bg-neon-500 text-white text-[10px] flex items-center justify-center">
                  {[dateFrom || dateTo, gender !== "all", minRating > 0, country, city].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <Card className="p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Date From */}
              <div>
                <label className="block text-[10px] text-dark-400 uppercase tracking-wider mb-1">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-2 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-xs text-white focus:outline-none focus:border-neon-500 [color-scheme:dark]"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-[10px] text-dark-400 uppercase tracking-wider mb-1">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-2 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-xs text-white focus:outline-none focus:border-neon-500 [color-scheme:dark]"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-[10px] text-dark-400 uppercase tracking-wider mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-2 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-xs text-white focus:outline-none focus:border-neon-500 appearance-none"
                >
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>{g === "all" ? "All" : g.charAt(0).toUpperCase() + g.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Min Rating */}
              <div>
                <label className="block text-[10px] text-dark-400 uppercase tracking-wider mb-1">Min Rating</label>
                <select
                  value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-xs text-white focus:outline-none focus:border-neon-500 appearance-none"
                >
                  <option value={0}>Any</option>
                  {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                    <option key={n} value={n}>{n}+</option>
                  ))}
                </select>
              </div>

              {/* Country */}
              <div>
                <label className="block text-[10px] text-dark-400 uppercase tracking-wider mb-1">Country</label>
                <select
                  value={country}
                  onChange={(e) => { setCountry(e.target.value); setCity(""); }}
                  className="w-full px-2 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-xs text-white focus:outline-none focus:border-neon-500 appearance-none"
                >
                  <option value="">All</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* City */}
              <div>
                <label className="block text-[10px] text-dark-400 uppercase tracking-wider mb-1">City</label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-2 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-xs text-white focus:outline-none focus:border-neon-500 appearance-none"
                >
                  <option value="">All</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Split layout: My Dates | Friend Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Left Column: My Dates */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
              My Dates
              <span className="ml-2 text-neon-400 normal-case text-xs">
                ({filteredDates.length})
              </span>
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[600px] pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="text-neon-500 animate-spin" />
              </div>
            ) : filteredDates.length === 0 ? (
              <Card className="text-center py-12">
                <MapPin size={40} className="mx-auto text-dark-500 mb-3" />
                <p className="text-dark-400">
                  {hasActiveFilters ? "No dates match your filters" : "No dates yet"}
                </p>
                <p className="text-dark-500 text-sm mt-1">
                  {hasActiveFilters
                    ? "Try adjusting your filters"
                    : "Go to the globe and tap a country to start logging"}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {myPageDates.map((date) => (
                  <Card key={date.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-neon-500/10 flex items-center justify-center shrink-0">
                        <MapPin size={18} className="text-neon-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <p className="text-sm font-medium text-white">
                            {date.personNickname ? `${date.personNickname} — ` : ""}{date.cityName}, {getCountryName(date.countryCode)}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1">
                              <Star size={14} className="text-neon-500" />
                              <span className="text-sm font-bold text-neon-500">
                                {date.rating}/10
                              </span>
                            </div>
                            <button
                              onClick={() => handleDelete(date.id)}
                              disabled={deletingId === date.id}
                              title="Sil"
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {deletingId === date.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-dark-400 mb-2">
                          <span className="capitalize">{date.gender}</span>
                          <span>{date.ageRange}</span>
                          {date.heightRange && <span>{date.heightRange} cm</span>}
                          <span className="flex items-center gap-1">
                            <Calendar size={10} />
                            {date.dateAt}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {date.faceRating !== null && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-pink-500/15 text-pink-400 border border-pink-500/30">
                              <Smile size={10} /> Face: {date.faceRating}
                            </span>
                          )}
                          {date.bodyRating !== null && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30">
                              <Dumbbell size={10} /> Body: {date.bodyRating}
                            </span>
                          )}
                          {date.chatRating !== null && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30">
                              <MessageCircle size={10} /> Chat: {date.chatRating}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                            <Star size={10} /> Overall: {date.rating}
                          </span>
                        </div>

                        {date.description && (
                          <p className="text-xs text-dark-300 mb-2 line-clamp-2">
                            {date.description}
                          </p>
                        )}

                        {date.tagIds.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {date.tagIds.map((tagId) => {
                              const tag = getTagById(tagId);
                              if (!tag) return null;
                              return (
                                <span
                                  key={tagId}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getTagColor(tag.category)}`}
                                >
                                  {tag.name}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* My Dates Pagination */}
          {!loading && filteredDates.length > 0 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-700">
              <button
                onClick={() => setMyPage((p) => Math.max(1, p - 1))}
                disabled={myPage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed bg-dark-800 text-dark-300 border border-dark-700 hover:border-dark-500 disabled:hover:border-dark-700"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <span className="text-xs text-dark-400">
                Page {myPage} of {myTotalPages}
              </span>
              <button
                onClick={() => setMyPage((p) => Math.min(myTotalPages, p + 1))}
                disabled={myPage >= myTotalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed bg-dark-800 text-dark-300 border border-dark-700 hover:border-dark-500 disabled:hover:border-dark-700"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Friend Dates */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider flex items-center gap-2">
              <Users size={14} className="text-accent-purple" />
              Friend Dates
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[600px] pr-1">
            {friendLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="text-accent-purple animate-spin" />
              </div>
            ) : friendDates.length === 0 ? (
              <Card className="text-center py-12">
                <Users size={40} className="mx-auto text-dark-500 mb-3" />
                <p className="text-dark-400">No friend dates yet</p>
                <p className="text-dark-500 text-sm mt-1">
                  Add friends to see their dates here
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {friendDates.map((date) => (
                  <div
                    key={date.id}
                    className="rounded-xl overflow-hidden"
                    style={{ borderLeft: `3px solid ${date.color}` }}
                  >
                  <Card
                    className="p-4 rounded-l-none border-l-0"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${date.color}15` }}
                      >
                        <MapPin size={18} style={{ color: date.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-white">
                            <span
                              className="inline-flex items-center gap-1.5 mr-2"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                                style={{ backgroundColor: date.color }}
                              />
                              <span className="text-xs font-semibold" style={{ color: date.color }}>
                                {date.friendNickname || "Friend"}
                              </span>
                            </span>
                            {date.personNickname ? `${date.personNickname} — ` : ""}{date.cityName}, {getCountryName(date.countryCode)}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            <Star size={14} style={{ color: date.color }} />
                            <span className="text-sm font-bold" style={{ color: date.color }}>
                              {date.rating}/10
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-dark-400 mb-2">
                          <span className="capitalize">{date.gender}</span>
                          <span>{date.ageRange}</span>
                          {date.heightRange && <span>{date.heightRange} cm</span>}
                          <span className="flex items-center gap-1">
                            <Calendar size={10} />
                            {date.dateAt}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {date.faceRating !== null && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-pink-500/15 text-pink-400 border border-pink-500/30">
                              <Smile size={10} /> Face: {date.faceRating}
                            </span>
                          )}
                          {date.bodyRating !== null && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30">
                              <Dumbbell size={10} /> Body: {date.bodyRating}
                            </span>
                          )}
                          {date.chatRating !== null && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30">
                              <MessageCircle size={10} /> Chat: {date.chatRating}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                            <Star size={10} /> Overall: {date.rating}
                          </span>
                        </div>

                        {date.description && (
                          <p className="text-xs text-dark-300 mb-2 line-clamp-2">
                            {date.description}
                          </p>
                        )}

                        {date.tagIds.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {date.tagIds.map((tagId) => {
                              const tag = getTagById(tagId);
                              if (!tag) return null;
                              return (
                                <span
                                  key={tagId}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getTagColor(tag.category)}`}
                                >
                                  {tag.name}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Friend Dates Pagination */}
          {!friendLoading && friendDates.length > 0 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-700">
              <button
                onClick={handleFriendPrev}
                disabled={friendPage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed bg-dark-800 text-dark-300 border border-dark-700 hover:border-dark-500 disabled:hover:border-dark-700"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <span className="text-xs text-dark-400">
                Page {friendPage}
              </span>
              <button
                onClick={handleFriendNext}
                disabled={!friendNextCursor}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed bg-dark-800 text-dark-300 border border-dark-700 hover:border-dark-500 disabled:hover:border-dark-700"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
