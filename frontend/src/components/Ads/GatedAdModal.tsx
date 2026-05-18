// Gated interstitial — fullscreen ad overlay shown between submit
// and save.
//
// Devam butonu kuralı:
//   * Video varsa: en az bir kez baştan sona oynayana kadar disabled.
//     Bu süre boyunca video autoplay ile döner; biter bitmez
//     videoCompletedOnce=true olur ve manuel olarak yeniden başlatılır
//     (loop attribute'u 'ended' event'ini bastırırdı, onun yerine
//     onEnded handler'ında play() çağırıyoruz).
//   * Video yoksa: min_view_seconds dolana kadar disabled (fallback).
//
// Ses: önce sesli autoplay denenir. Browser bloklarsa muted'a düşülür
// ve "Sesi aç" overlay'i kullanıcıya tek-tıkla unmute imkânı verir.
//
// "Sponsorlu" badge her zaman görünür. ESC / dış-tıklama kapatmaz.
// Atla butonu yok.
//
// We do NOT call /api/ads/click here; the gate isn't a click placement.

import { useEffect, useRef, useState } from "react";
import { Clock, X, Volume2, VolumeX } from "lucide-react";

export type GatedAd = {
  context: string;
  campaign_id: string;
  placement_key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creative: any;
  click_url: string;
  min_view_seconds: number;
  gate_token: string;
};

type Outcome = "completed";

interface Props {
  ad: GatedAd;
  /** Fires when the user has watched at least one full play (video)
   *  veya min_view_seconds (no-video fallback). */
  onComplete: (outcome: Outcome, elapsedMs: number) => Promise<void> | void;
  /** Reserved for future Settings-driven hard cancel. */
  onCancel?: () => void;
}

export function GatedAdModal({ ad, onComplete, onCancel }: Props) {
  const [startedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoCompletedOnce, setVideoCompletedOnce] = useState(false);
  // Browser autoplay policy: sesli autoplay genelde recent user
  // gesture + yüksek MEI gerektirir. Önce sesli denenir; rejected
  // olursa sessize düşeriz ve "Sesi aç" overlay'i gösteririz.
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Update timer for the no-video fallback countdown copy.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const sponsorName: string =
    ad.creative?.sponsor_name ?? ad.creative?.brand_name ?? "Sponsor";
  const title: string = ad.creative?.title ?? "Sponsorlu içerik";
  const body: string | undefined = ad.creative?.body;
  const cta: string = ad.creative?.cta ?? "Devam et";
  const image: string | undefined = ad.creative?.image_url;
  const video: string | undefined = ad.creative?.video_url;
  const logo: string | undefined = ad.creative?.logo_url;

  const elapsedMs = now - startedAt;
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const minSec = Math.max(0, ad.min_view_seconds);
  const minViewReached = elapsedSec >= minSec;
  const remainingForComplete = Math.max(0, minSec - elapsedSec);

  // Devam butonu: video varsa bir kez biten + (autoplay başarısızsa
  // güvenlik ağı olarak min_view_seconds × 2 sonrası); video yoksa
  // sadece timer.
  const canContinue = video
    ? videoCompletedOnce || elapsedSec >= minSec * 2
    : minViewReached;

  // Önce sesli autoplay'i deneriz (kullanıcı az önce "Kaydet"e
  // bastığı için recent user gesture mevcut, bazı tarayıcılarda
  // izin verilir). Reject olursa muted'e düşüp tekrar dene ve
  // "Sesi aç" overlay'ini göster.
  useEffect(() => {
    if (!video) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      setIsMuted(true);
      v.play().catch(() => {});
    });
  }, [video]);

  const handleUnmute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setIsMuted(false);
    if (v.paused) v.play().catch(() => {});
  };

  const handleVideoEnded = () => {
    setVideoCompletedOnce(true);
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  };

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
          {video ? (
            <div className="relative flex-1 w-full">
              <video
                ref={videoRef}
                src={video}
                className="w-full h-full object-contain bg-dark-950"
                autoPlay
                playsInline
                onEnded={handleVideoEnded}
              />
              {isMuted && (
                <button
                  type="button"
                  onClick={handleUnmute}
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/70 hover:bg-black/85 text-white rounded-full text-xs font-medium backdrop-blur-sm border border-white/10 cursor-pointer"
                  title="Sesi aç"
                >
                  <VolumeX size={14} />
                  Sesi aç
                </button>
              )}
              {!isMuted && (
                <span
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1 px-2 py-1 bg-black/40 text-white/80 rounded-full text-[10px] backdrop-blur-sm"
                  title="Ses açık"
                >
                  <Volume2 size={11} />
                </span>
              )}
            </div>
          ) : image ? (
            <img
              src={image}
              alt=""
              className="flex-1 w-full object-contain bg-dark-950"
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
          {/* Status line */}
          <div className="flex items-center gap-2 text-[11px] text-dark-400">
            <Clock size={12} />
            {video ? (
              canContinue ? (
                <span>Reklam tamamlandı</span>
              ) : (
                <span>Reklamın bitmesini bekleyin</span>
              )
            ) : minViewReached ? (
              <span>Reklam izlendi ({elapsedSec}s)</span>
            ) : (
              <span>
                Devam etmek için {remainingForComplete}s — toplam {minSec}s izleyin
              </span>
            )}
          </div>

          {/* No-video fallback için progress bar (video varsa video kendisi
              progress göstergesi). */}
          {!video && (
            <div className="h-1 bg-dark-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-neon-500 transition-[width] duration-300 ease-linear"
                style={{
                  width: `${Math.min(100, (elapsedMs / Math.max(1, minSec * 1000)) * 100).toFixed(1)}%`,
                }}
              />
            </div>
          )}

          {error && (
            <div className="px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => finish("completed")}
            disabled={!canContinue || submitting}
            className="w-full px-3 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Kaydediliyor…"
              : canContinue
              ? cta
              : video
              ? "Reklam oynatılıyor…"
              : `${cta} (${remainingForComplete}s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
