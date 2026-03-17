import type { Stats } from "@/types";

interface WrappedCardProps {
  nickname: string;
  stats: Stats;
  topCity: string | null;
  topCountry: string | null;
  dateCount: number;
  topBadge?: string;
  topBadgeName?: string;
  streak: number;
}

function fmtRating(val: number | null): string {
  return val !== null ? val.toFixed(1) : "--";
}

export function WrappedCard({
  nickname,
  stats,
  topCity,
  topCountry,
  dateCount,
  topBadge,
  topBadgeName,
  streak,
}: WrappedCardProps) {
  return (
    <div
      style={{
        width: 360,
        height: 640,
        background: "linear-gradient(180deg, #0a0a0f 0%, #1a1a2e 50%, #0f0f1a 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 24px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Decorative glow circles */}
      <div
        style={{
          position: "absolute",
          top: -60,
          right: -60,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,0,127,0.15) 0%, transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -40,
          left: -40,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,229,255,0.1) 0%, transparent 70%)",
        }}
      />

      {/* Header: havesmashed branding */}
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: "#ff007f",
          textShadow: "0 0 20px rgba(255,0,127,0.6), 0 0 40px rgba(255,0,127,0.3)",
          letterSpacing: "1px",
          marginBottom: 8,
        }}
      >
        havesmashed
      </div>

      {/* Subtitle: @nickname's 2026 Wrapped */}
      <div
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.5)",
          marginBottom: 4,
        }}
      >
        @{nickname}&apos;s
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 900,
          color: "#ffffff",
          letterSpacing: "-0.5px",
          marginBottom: 28,
          textShadow: "0 0 15px rgba(255,255,255,0.1)",
        }}
      >
        2026 Wrapped
      </div>

      {/* Stats grid: 2x2 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          width: "100%",
          marginBottom: 24,
        }}
      >
        {/* Total Dates */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,0,127,0.3)",
            borderRadius: 14,
            padding: "16px 12px",
            textAlign: "center",
            boxShadow: "0 0 15px rgba(255,0,127,0.1)",
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: "#ff007f",
              textShadow: "0 0 12px rgba(255,0,127,0.4)",
              lineHeight: 1,
            }}
          >
            {dateCount}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              letterSpacing: "2px",
              marginTop: 6,
              fontWeight: 600,
            }}
          >
            Dates
          </div>
        </div>

        {/* Cities */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(0,229,255,0.3)",
            borderRadius: 14,
            padding: "16px 12px",
            textAlign: "center",
            boxShadow: "0 0 15px rgba(0,229,255,0.1)",
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: "#00e5ff",
              textShadow: "0 0 12px rgba(0,229,255,0.4)",
              lineHeight: 1,
            }}
          >
            {stats.uniqueCities}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              letterSpacing: "2px",
              marginTop: 6,
              fontWeight: 600,
            }}
          >
            Cities
          </div>
        </div>

        {/* Countries */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(191,0,255,0.3)",
            borderRadius: 14,
            padding: "16px 12px",
            textAlign: "center",
            boxShadow: "0 0 15px rgba(191,0,255,0.1)",
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: "#bf00ff",
              textShadow: "0 0 12px rgba(191,0,255,0.4)",
              lineHeight: 1,
            }}
          >
            {stats.uniqueCountries}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              letterSpacing: "2px",
              marginTop: 6,
              fontWeight: 600,
            }}
          >
            Countries
          </div>
        </div>

        {/* Avg Rating */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(250,204,21,0.3)",
            borderRadius: 14,
            padding: "16px 12px",
            textAlign: "center",
            boxShadow: "0 0 15px rgba(250,204,21,0.1)",
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: "#facc15",
              textShadow: "0 0 12px rgba(250,204,21,0.4)",
              lineHeight: 1,
            }}
          >
            {fmtRating(stats.averageRating)}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              letterSpacing: "2px",
              marginTop: 6,
              fontWeight: 600,
            }}
          >
            Avg Rating
          </div>
        </div>
      </div>

      {/* Details section */}
      <div style={{ width: "100%", marginBottom: 20 }}>
        {topCity && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              padding: "10px 14px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span style={{ fontSize: 18 }}>{"\uD83C\uDFD9\uFE0F"}</span>
            <div>
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  fontWeight: 600,
                }}
              >
                Top City
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff" }}>
                {topCity}
              </div>
            </div>
          </div>
        )}

        {topCountry && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              padding: "10px 14px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span style={{ fontSize: 18 }}>{"\uD83C\uDF0D"}</span>
            <div>
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  fontWeight: 600,
                }}
              >
                Top Country
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff" }}>
                {topCountry}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            padding: "10px 14px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span style={{ fontSize: 18 }}>{"\uD83D\uDD25"}</span>
          <div>
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                letterSpacing: "1.5px",
                fontWeight: 600,
              }}
            >
              Streak
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff" }}>
              {streak} hafta
            </div>
          </div>
        </div>

        {topBadge && topBadgeName && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 10,
              border: "1px solid rgba(250,204,21,0.15)",
            }}
          >
            <span style={{ fontSize: 18 }}>{topBadge}</span>
            <div>
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  fontWeight: 600,
                }}
              >
                Top Badge
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#facc15" }}>
                {topBadgeName}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Divider */}
      <div
        style={{
          width: "60%",
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(255,0,127,0.3), transparent)",
          marginBottom: 14,
        }}
      />

      {/* Footer branding */}
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.3)",
          letterSpacing: "1px",
          fontWeight: 500,
        }}
      >
        havesmashed.app
      </div>
    </div>
  );
}
