// User-facing native ad slot.
//
// Mounts at a known placement key (e.g. 'feed_native'); the server
// decides whether anything is shown and which creative — frequency
// caps, opt-out, and placement enable/disable all flow through
// `/api/ads/next`. If the response is null, the slot renders nothing
// and takes no space.
//
// Anonymity: nothing user-identifying is sent on click — the click
// posts back our own opaque impression token, the server returns
// the brand URL, and we open it with rel="noreferrer" so the brand
// never sees our origin in the Referer header.

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "@/services/api";

type NextAd = {
  campaign_id: string;
  placement_key: string;
  creative: {
    image_url?: string;
    title?: string;
    body?: string;
    cta?: string;
    sponsor_name?: string;
    logo_url?: string;
  };
  click_url: string;
  impression_token: string;
  dwell_ms_for_impression: number;
};

interface AdSlotProps {
  placementKey: string;
  className?: string;
}

export function AdSlot({ placementKey, className }: AdSlotProps) {
  const [ad, setAd] = useState<NextAd | null>(null);
  const [clicking, setClicking] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);

  // Fetch on mount.
  useEffect(() => {
    let cancelled = false;
    api
      .getNextAd(placementKey)
      .then((res) => {
        if (!cancelled) setAd(res);
      })
      .catch(() => {
        // Silent — ad serving is non-critical to the page.
      });
    return () => {
      cancelled = true;
    };
  }, [placementKey]);

  // IntersectionObserver-based dwell tracking. Reports a single
  // `dwell_ms` event once the user has had ≥50% of the slot in
  // view for the placement's required threshold. Server uses this
  // to compute viewable-impression rates without learning who.
  useEffect(() => {
    if (!ad || !slotRef.current || ad.dwell_ms_for_impression <= 0) return;

    const el = slotRef.current;
    const threshold = ad.dwell_ms_for_impression;
    let visibleSince: number | null = null;
    let accumulated = 0;
    let reported = false;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const isVisible =
          entry.isIntersecting && entry.intersectionRatio >= 0.5;
        if (isVisible) {
          if (visibleSince === null) visibleSince = performance.now();
        } else if (visibleSince !== null) {
          accumulated += performance.now() - visibleSince;
          visibleSince = null;
        }
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(el);

    const interval = window.setInterval(() => {
      if (reported) return;
      const live =
        visibleSince !== null
          ? accumulated + (performance.now() - visibleSince)
          : accumulated;
      if (live >= threshold) {
        reported = true;
        api
          .recordAdEvent(ad.impression_token, "dwell_ms", Math.round(live))
          .catch(() => {});
        window.clearInterval(interval);
      }
    }, 400);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [ad]);

  const handleClick = async () => {
    if (!ad || clicking) return;
    setClicking(true);
    try {
      const { redirect_url } = await api.recordAdClick(ad.impression_token);
      // Programmatic anchor with rel=noreferrer so the brand's
      // landing page never sees the havesmashed origin in Referer.
      const a = document.createElement("a");
      a.href = redirect_url;
      a.rel = "noreferrer noopener";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // Don't block the user — silent fail. They can click again.
    } finally {
      setClicking(false);
    }
  };

  if (!ad) return null;

  return (
    <div ref={slotRef} className={className}>
      {ad.placement_key === "feed_native" ? (
        <FeedNativeRender ad={ad} onClick={handleClick} />
      ) : (
        <GenericRender ad={ad} onClick={handleClick} />
      )}
    </div>
  );
}

// ── Renders ───────────────────────────────────────────────────

function FeedNativeRender({
  ad,
  onClick,
}: {
  ad: NextAd;
  onClick: () => void;
}) {
  const { creative } = ad;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-dark-800 hover:bg-dark-750 border border-dark-700 rounded-xl overflow-hidden transition-colors group"
    >
      {creative.image_url && (
        <div className="aspect-2/1 bg-dark-900 overflow-hidden">
          <img
            src={creative.image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wide text-dark-500">
            Sponsorlu
          </span>
          {creative.sponsor_name && (
            <span className="text-[10px] text-dark-500">
              · {creative.sponsor_name}
            </span>
          )}
        </div>
        {creative.title && (
          <h4 className="text-sm font-semibold text-white mb-1 line-clamp-2">
            {creative.title}
          </h4>
        )}
        {creative.body && (
          <p className="text-xs text-dark-300 mb-3 line-clamp-2">
            {creative.body}
          </p>
        )}
        <span className="text-xs font-medium text-neon-400 inline-flex items-center gap-1">
          {creative.cta ?? "Keşfet"} <ExternalLink size={12} />
        </span>
      </div>
    </button>
  );
}

function GenericRender({
  ad,
  onClick,
}: {
  ad: NextAd;
  onClick: () => void;
}) {
  const { creative } = ad;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-dark-800 hover:bg-dark-750 border border-dark-700 rounded-xl p-4"
    >
      <div className="text-[10px] uppercase tracking-wide text-dark-500 mb-1">
        Sponsorlu{creative.sponsor_name && ` · ${creative.sponsor_name}`}
      </div>
      {creative.title && (
        <h4 className="text-sm font-semibold text-white mb-1">
          {creative.title}
        </h4>
      )}
      {creative.body && (
        <p className="text-xs text-dark-300">{creative.body}</p>
      )}
    </button>
  );
}
