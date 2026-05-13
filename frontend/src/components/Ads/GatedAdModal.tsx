// Gated interstitial — fullscreen ad overlay shown between submit
// and save. Two timers run in parallel:
//   - min_view_seconds: until reached, the auto-complete handler is
//     armed but the user can't be released early. (We do let the
//     auto-complete fire as soon as the timer expires — the spec
//     reads "tamamlanınca/skip basınca" so completion is implicit.)
//   - skip_after_seconds: the Skip button stays disabled until this
//     threshold elapses.
//
// KVKK / spec requirements:
//   * "Sponsorlu" badge visible at all times.
//   * Link to Settings → "Sponsorlu içerik göster" so the user can
//     turn the gate off going forward.
//   * Pressing ESC or clicking outside does NOT dismiss — the only
//     exits are Skip (after threshold) and tamamlama (auto on
//     min_view_seconds expiry, or via the explicit "Devam et" CTA).
//
// We do NOT call /api/ads/click here; the gate isn't a click placement.
// If the brand wants users to land on their site, that flow goes via
// the existing /api/ads/click endpoint and an explicit CTA button in
// the creative — left to a follow-up if needed.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, X, Settings as SettingsIcon } from "lucide-react";

export type GatedAd = {
  context: string;
  campaign_id: string;
  placement_key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creative: any;
  click_url: string;
  min_view_seconds: number;
  skip_after_seconds: number;
  gate_token: string;
};

type Outcome = "completed" | "skipped";

interface Props {
  ad: GatedAd;
  /** Fires when the user has watched at least min_view_seconds. */
  onComplete: (outcome: Outcome, elapsedMs: number) => Promise<void> | void;
  /** Fires when the user dismisses the modal without watching enough.
   * In current flow this is unreachable (skip becomes "skipped"), but
   * kept for the future Settings-driven hard cancel.
   */
  onCancel?: () => void;
}

export function GatedAdModal({ ad, onComplete, onCancel }: Props) {
  const [startedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update once per second; sub-second precision isn't needed for the
  // countdown copy and a steady tick keeps the buttons predictable.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const elapsedMs = now - startedAt;
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const minSec = Math.max(0, ad.min_view_seconds);
  const skipSec = Math.max(0, ad.skip_after_seconds);

  const minViewReached = elapsedSec >= minSec;
  const skipUnlocked = elapsedSec >= skipSec;
  const remainingForSkip = Math.max(0, skipSec - elapsedSec);
  const remainingForComplete = Math.max(0, minSec - elapsedSec);

  const finish = async (outcome: Outcome) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onComplete(outcome, elapsedMs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reklam tamamlanamadı");
      setSubmitting(false);
    }
  };

  const sponsorName: string =
    ad.creative?.sponsor_name ?? ad.creative?.brand_name ?? "Sponsor";
  const title: string = ad.creative?.title ?? "Sponsorlu içerik";
  const body: string | undefined = ad.creative?.body;
  const cta: string = ad.creative?.cta ?? "Devam et";
  const image: string | undefined = ad.creative?.image_url;
  const logo: string | undefined = ad.creative?.logo_url;

  return (
    <div
      // Blocks every interaction with the underlying page so the
      // submit flow can't proceed until this resolves.
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
    >
      <div className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-2xl overflow-hidden shadow-2xl">
        {/* Top strip: sponsored label + minimal close (unused in current flow) */}
        <div className="flex items-center justify-between px-4 py-2 bg-dark-950 border-b border-dark-800">
          <div className="flex items-center gap-2">
            {logo && (
              <img
                src={logo}
                alt={sponsorName}
                className="h-4 w-auto rounded bg-white/90 p-0.5"
              />
            )}
            <span className="text-[10px] uppercase tracking-wider text-dark-400">
              Sponsorlu · {sponsorName}
            </span>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1 text-dark-500 hover:text-white"
              title="Reklamı kapat"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Creative */}
        <div className="aspect-[9/16] bg-dark-950 flex flex-col">
          {image ? (
            <img
              src={image}
              alt=""
              className="flex-1 w-full object-cover"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-neon-500/10 via-dark-900 to-dark-950">
              <div className="text-center">
                <div className="text-4xl mb-3">✦</div>
                <div className="text-xs text-dark-400 uppercase tracking-wider">
                  Sponsorlu içerik
                </div>
              </div>
            </div>
          )}
          <div className="p-4 space-y-2 bg-dark-900">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {body && <p className="text-sm text-dark-300">{body}</p>}
          </div>
        </div>

        {/* Footer / actions */}
        <div className="p-4 space-y-3 border-t border-dark-800">
          {/* Countdown line */}
          <div className="flex items-center gap-2 text-[11px] text-dark-400">
            <Clock size={12} />
            {minViewReached ? (
              <span>Reklam izlendi ({elapsedSec}s)</span>
            ) : (
              <span>
                Devam etmek için {remainingForComplete}s — toplam {minSec}s izleyin
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-dark-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-neon-500 transition-[width] duration-300 ease-linear"
              style={{
                width: `${Math.min(100, (elapsedMs / Math.max(1, minSec * 1000)) * 100).toFixed(1)}%`,
              }}
            />
          </div>

          {error && (
            <div className="px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => finish("skipped")}
              disabled={!skipUnlocked || submitting}
              className="flex-1 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-200 hover:bg-dark-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {skipUnlocked
                ? "Atla"
                : `Atla (${remainingForSkip}s)`}
            </button>
            <button
              type="button"
              onClick={() => finish("completed")}
              disabled={!minViewReached || submitting}
              className="flex-[2] px-3 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting
                ? "Kaydediliyor…"
                : minViewReached
                ? cta
                : `${cta} (${remainingForComplete}s)`}
            </button>
          </div>

          <p className="text-[10px] text-dark-500 leading-relaxed">
            Reklamları kapatmak için{" "}
            <Link
              to="/settings"
              className="text-neon-400 hover:text-neon-300 inline-flex items-center gap-0.5"
            >
              Ayarlar → Sponsorlu içerik göster <SettingsIcon size={9} />
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
