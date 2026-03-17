import { useState, useMemo, useEffect } from "react";
import { MapPin, Search, X, Loader2, BarChart3 } from "lucide-react";
import { useLogStore } from "@/stores/logStore";
import { api } from "@/services/api";
import type { City } from "@/types";

interface CitySelectorProps {
  countryCode: string;
  onClose: () => void;
  onCityInsights?: (cityId: number, cityName: string) => void;
}

export function CitySelector({ countryCode, onClose, onCityInsights }: CitySelectorProps) {
  const [search, setSearch] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const openDateForm = useLogStore((s) => s.openDateForm);
  const setSelectedCity = useLogStore((s) => s.setSelectedCity);
  const dates = useLogStore((s) => s.dates);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getCities(countryCode)
      .then((data) => {
        if (!cancelled) setCities(data);
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [countryCode]);

  const filteredCities = useMemo(() => {
    if (!search) return cities;
    return cities.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [cities, search]);

  const cityDateCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const d of dates) {
      if (d.countryCode === countryCode) {
        counts[d.cityId] = (counts[d.cityId] ?? 0) + 1;
      }
    }
    return counts;
  }, [dates, countryCode]);

  const handleCityClick = (city: City) => {
    setSelectedCity({
      id: city.id,
      name: city.name,
    });
    openDateForm();
  };

  return (
    <div className="absolute right-0 top-0 h-full w-80 max-w-[90vw] bg-dark-900/95 backdrop-blur-md border-l border-dark-700 z-30 flex flex-col animate-in slide-in-from-right">
      <div className="flex items-center justify-between p-4 border-b border-dark-700">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Select City
        </h3>
        <button
          onClick={onClose}
          className="text-dark-400 hover:text-neon-500 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cities..."
            className="w-full bg-dark-800 border border-dark-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="text-neon-500 animate-spin" />
          </div>
        ) : filteredCities.length === 0 ? (
          <p className="text-dark-400 text-sm text-center py-8">
            No cities found for this country yet.
          </p>
        ) : (
          filteredCities.map((city) => {
            const count = cityDateCounts[city.id] ?? 0;
            return (
              <button
                key={city.id}
                onClick={() => handleCityClick(city)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-700 transition-all group text-left cursor-pointer"
              >
                <MapPin
                  size={16}
                  className={
                    count > 0
                      ? "text-neon-500 drop-shadow-[0_0_4px_rgba(255,0,127,0.5)]"
                      : "text-dark-500 group-hover:text-dark-300"
                  }
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${count > 0 ? "text-neon-400" : "text-white"}`}
                  >
                    {city.name}
                  </p>
                  {city.population && (
                    <p className="text-xs text-dark-500">
                      Pop. {(city.population / 1000000).toFixed(1)}M
                    </p>
                  )}
                </div>
                {count > 0 && (
                  <span className="text-xs text-neon-500 bg-neon-500/10 px-2 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCityInsights?.(city.id, city.name);
                  }}
                  className="p-1 rounded text-dark-500 hover:text-accent-cyan transition-colors cursor-pointer"
                  title="City Stats"
                >
                  <BarChart3 size={14} />
                </button>
              </button>
            );
          })
        )}
      </div>

    </div>
  );
}
