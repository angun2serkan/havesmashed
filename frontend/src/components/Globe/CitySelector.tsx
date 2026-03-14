import { useState, useMemo } from "react";
import { MapPin, Search, X } from "lucide-react";
import { useLogStore } from "@/stores/logStore";
import type { City } from "@/types";

// Placeholder city data — will be fetched from API in production
const SAMPLE_CITIES: Record<string, City[]> = {
  TR: [
    { id: 1, name: "Istanbul", countryCode: "TR", latitude: 41.0082, longitude: 28.9784, population: 15460000 },
    { id: 2, name: "Ankara", countryCode: "TR", latitude: 39.9334, longitude: 32.8597, population: 5663000 },
    { id: 3, name: "Izmir", countryCode: "TR", latitude: 38.4192, longitude: 27.1287, population: 4367000 },
    { id: 4, name: "Antalya", countryCode: "TR", latitude: 36.8969, longitude: 30.7133, population: 2619000 },
    { id: 5, name: "Bursa", countryCode: "TR", latitude: 40.1885, longitude: 29.0610, population: 3101000 },
    { id: 6, name: "Adana", countryCode: "TR", latitude: 37.0000, longitude: 35.3213, population: 2237000 },
  ],
  US: [
    { id: 101, name: "New York", countryCode: "US", latitude: 40.7128, longitude: -74.006, population: 8336000 },
    { id: 102, name: "Los Angeles", countryCode: "US", latitude: 34.0522, longitude: -118.2437, population: 3979000 },
    { id: 103, name: "Chicago", countryCode: "US", latitude: 41.8781, longitude: -87.6298, population: 2693000 },
    { id: 104, name: "Miami", countryCode: "US", latitude: 25.7617, longitude: -80.1918, population: 467000 },
    { id: 105, name: "Las Vegas", countryCode: "US", latitude: 36.1699, longitude: -115.1398, population: 641000 },
  ],
  GB: [
    { id: 201, name: "London", countryCode: "GB", latitude: 51.5074, longitude: -0.1278, population: 8982000 },
    { id: 202, name: "Manchester", countryCode: "GB", latitude: 53.4808, longitude: -2.2426, population: 553000 },
    { id: 203, name: "Birmingham", countryCode: "GB", latitude: 52.4862, longitude: -1.8904, population: 1141000 },
  ],
  DE: [
    { id: 301, name: "Berlin", countryCode: "DE", latitude: 52.5200, longitude: 13.4050, population: 3748000 },
    { id: 302, name: "Munich", countryCode: "DE", latitude: 48.1351, longitude: 11.582, population: 1472000 },
    { id: 303, name: "Hamburg", countryCode: "DE", latitude: 53.5511, longitude: 9.9937, population: 1841000 },
  ],
  FR: [
    { id: 401, name: "Paris", countryCode: "FR", latitude: 48.8566, longitude: 2.3522, population: 2161000 },
    { id: 402, name: "Marseille", countryCode: "FR", latitude: 43.2965, longitude: 5.3698, population: 870000 },
    { id: 403, name: "Lyon", countryCode: "FR", latitude: 45.764, longitude: 4.8357, population: 516000 },
  ],
};

interface CitySelectorProps {
  countryCode: string;
  onClose: () => void;
}

export function CitySelector({ countryCode, onClose }: CitySelectorProps) {
  const [search, setSearch] = useState("");
  const openDateForm = useLogStore((s) => s.openDateForm);
  const setSelectedCity = useLogStore((s) => s.setSelectedCity);
  const dates = useLogStore((s) => s.dates);

  const cities = SAMPLE_CITIES[countryCode] ?? [];

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
      lat: city.latitude,
      lng: city.longitude,
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
        {filteredCities.length === 0 ? (
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
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
