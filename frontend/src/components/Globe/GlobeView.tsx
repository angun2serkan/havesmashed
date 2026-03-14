import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { useLogStore } from "@/stores/logStore";
import type { CountryFeature } from "@/types";
import { CitySelector } from "./CitySelector";
import { COUNTRY_CODE_MAP } from "@/data/countryCodeMap";

const DARK_GLOBE_COLOR = "#0a0a0f";
const ATMOSPHERE_COLOR = "#ff007f";
const UNVISITED_COLOR = "rgba(30, 30, 50, 0.6)";
const STROKE_COLOR = "rgba(80, 80, 120, 0.3)";
const VISITED_STROKE = "#ff007f";

function getVisitedColor(logCount: number): string {
  if (logCount === 0) return UNVISITED_COLOR;
  const intensity = Math.min(1, Math.log10(logCount + 1) / 2);
  const r = Math.round(255 * intensity);
  const g = Math.round(0);
  const b = Math.round(127 * (1 - intensity * 0.3));
  const a = 0.3 + intensity * 0.5;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function GlobeView() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoomedCountry, setZoomedCountry] = useState<string | null>(null);
  const dates = useLogStore((s) => s.dates);
  const setSelectedCountry = useLogStore((s) => s.setSelectedCountry);

  // Build country date counts
  const countryDateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of dates) {
      counts[d.countryCode] = (counts[d.countryCode] ?? 0) + 1;
    }
    return counts;
  }, [dates]);

  // Load GeoJSON
  useEffect(() => {
    fetch(
      "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json",
    )
      .then((res) => res.json())
      .then((topology) => {
        // Convert TopoJSON to GeoJSON features
        import("topojson-client").then(({ feature }) => {
          const geojson = feature(
            topology,
            topology.objects.countries,
          ) as unknown as GeoJSON.FeatureCollection;
          // world-atlas uses numeric ISO 3166-1 IDs, enrich with name/ISO_A2
          const enriched = geojson.features.map((f) => {
            const numericId = String(f.id);
            const info = COUNTRY_CODE_MAP[numericId];
            return {
              ...f,
              properties: {
                ...f.properties,
                ISO_A2: info?.iso_a2 ?? "",
                ADMIN: info?.name ?? "Unknown",
              },
            };
          });
          setCountries(enriched as unknown as CountryFeature[]);
        });
      })
      .catch(() => {
        // Fallback: try GeoJSON directly
        fetch(
          "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
        )
          .then((res) => res.json())
          .then((geojson: GeoJSON.FeatureCollection) => {
            setCountries(geojson.features as unknown as CountryFeature[]);
          });
      });
  }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    setDimensions({
      width: container.clientWidth,
      height: container.clientHeight,
    });

    return () => observer.disconnect();
  }, []);

  // Auto-focus on user geolocation
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    // Default to Turkey (Istanbul area)
    let lat = 39.0;
    let lng = 35.0;
    let altitude = 2.0;

    globe.pointOfView({ lat, lng, altitude }, 0);

    // Try geolocation API
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          globe.pointOfView(
            { lat: pos.coords.latitude, lng: pos.coords.longitude, altitude: 2.0 },
            1000,
          );
        },
        () => {
          // Silently stay on default (Turkey)
        },
      );
    }
  }, []);

  // Globe styling
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const scene = globe.scene();
    if (scene) {
      scene.fog = null;
    }

    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.3;
    globe.controls().enableDamping = true;
  }, [dimensions]);

  const handlePolygonClick = useCallback(
    (polygon: object) => {
      const feat = polygon as CountryFeature;
      const countryCode = feat.properties?.ISO_A2;
      const globe = globeRef.current;

      if (!countryCode || !globe) return;

      setSelectedCountry(countryCode);
      setZoomedCountry(countryCode);

      // Calculate centroid for zoom
      const coords = feat.geometry;
      let lat = 0;
      let lng = 0;

      if (coords.type === "Polygon") {
        const ring = coords.coordinates[0]!;
        for (const [cLng, cLat] of ring) {
          lat += cLat!;
          lng += cLng!;
        }
        lat /= ring.length;
        lng /= ring.length;
      } else if (coords.type === "MultiPolygon") {
        let count = 0;
        for (const polygon of coords.coordinates) {
          for (const [cLng, cLat] of polygon[0]!) {
            lat += cLat!;
            lng += cLng!;
            count++;
          }
        }
        lat /= count;
        lng /= count;
      }

      globe.controls().autoRotate = false;
      globe.pointOfView({ lat, lng, altitude: 0.8 }, 1000);
    },
    [setSelectedCountry],
  );

  const handleGlobeClick = useCallback(() => {
    if (zoomedCountry) {
      setZoomedCountry(null);
      setSelectedCountry(null);
      const globe = globeRef.current;
      if (globe) {
        globe.controls().autoRotate = true;
        globe.pointOfView({ altitude: 2.0 }, 1000);
      }
    }
  }, [zoomedCountry, setSelectedCountry]);

  return (
    <div ref={containerRef} className="globe-container w-full h-full absolute inset-0">
      {dimensions.width > 0 && (
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl=""
          backgroundColor={DARK_GLOBE_COLOR}
          showAtmosphere={true}
          atmosphereColor={ATMOSPHERE_COLOR}
          atmosphereAltitude={0.15}
          polygonsData={countries}
          polygonCapColor={(d) => {
            const feat = d as CountryFeature;
            const code = feat.properties?.ISO_A2;
            const count = code ? (countryDateCounts[code] ?? 0) : 0;
            return getVisitedColor(count);
          }}
          polygonSideColor={() => "rgba(20, 20, 40, 0.3)"}
          polygonStrokeColor={(d) => {
            const feat = d as CountryFeature;
            const code = feat.properties?.ISO_A2;
            const count = code ? (countryDateCounts[code] ?? 0) : 0;
            return count > 0 ? VISITED_STROKE : STROKE_COLOR;
          }}
          polygonAltitude={(d) => {
            const feat = d as CountryFeature;
            const code = feat.properties?.ISO_A2;
            if (code === zoomedCountry) return 0.02;
            const count = code ? (countryDateCounts[code] ?? 0) : 0;
            return count > 0 ? 0.01 : 0.005;
          }}
          polygonLabel={(d) => {
            const feat = d as CountryFeature;
            const name = feat.properties?.ADMIN ?? "Unknown";
            const code = feat.properties?.ISO_A2;
            const count = code ? (countryDateCounts[code] ?? 0) : 0;
            return `<div class="bg-dark-800/90 backdrop-blur px-3 py-1.5 rounded-lg border border-dark-600 text-sm">
              <span class="font-semibold text-white">${name}</span>
              ${count > 0 ? `<span class="ml-2 text-neon-500">${count} ${count === 1 ? "date" : "dates"}</span>` : ""}
            </div>`;
          }}
          onPolygonClick={handlePolygonClick}
          onGlobeClick={handleGlobeClick}
          animateIn={true}
        />
      )}
      {zoomedCountry && (
        <CitySelector
          countryCode={zoomedCountry}
          onClose={() => {
            setZoomedCountry(null);
            setSelectedCountry(null);
            const globe = globeRef.current;
            if (globe) {
              globe.controls().autoRotate = true;
              globe.pointOfView({ altitude: 2.0 }, 1000);
            }
          }}
        />
      )}
    </div>
  );
}
