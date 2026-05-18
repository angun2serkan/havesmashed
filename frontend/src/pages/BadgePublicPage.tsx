import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/services/api";

type PublicBadge = Awaited<ReturnType<typeof api.getPublicBadge>>;

/**
 * /b/:id — auth gerektirmez. Kullanıcı bir arkadaşının paylaştığı
 * badge linkine geldiğinde bu sayfayı görür.
 *
 * Anonimite: hangi kullanıcının paylaştığı / kazandığı GÖSTERİLMEZ.
 * Sadece badge'in kendisi + (varsa) sponsor brand bilgisi + havesmashed
 * tanıtımı.
 */
export function BadgePublicPage() {
  const { id } = useParams<{ id: string }>();
  const [badge, setBadge] = useState<PublicBadge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const badgeId = parseInt(id, 10);
    if (isNaN(badgeId)) {
      setError("Geçersiz badge");
      setLoading(false);
      return;
    }
    api
      .getPublicBadge(badgeId)
      .then(setBadge)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Yüklenemedi"),
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950 text-dark-400">
        Yükleniyor…
      </div>
    );
  }

  if (error || !badge) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-xl">😶‍🌫️</p>
          <h1 className="text-white font-semibold">
            Bu badge artık burada değil
          </h1>
          <p className="text-sm text-dark-400">
            {error ?? "Belki süresi dolmuş veya kaldırılmış olabilir."}
          </p>
          <Link
            to="/"
            className="inline-block mt-2 px-4 py-2 bg-neon-500/20 border border-neon-500/40 rounded-lg text-neon-300 text-sm hover:bg-neon-500/30 transition-colors"
          >
            havesmashed'e git
          </Link>
        </div>
      </div>
    );
  }

  const isPremium = badge.tier === "premium";
  const ringColor = isPremium
    ? "ring-fuchsia-500/60"
    : badge.tier === "gold"
      ? "ring-yellow-500/40"
      : badge.tier === "silver"
        ? "ring-slate-400/40"
        : "ring-amber-700/40";
  const tierLabel = badge.tier.toUpperCase();

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Badge kartı */}
          <div
            className={`bg-linear-to-br from-dark-900 to-dark-950 border rounded-2xl p-8 text-center space-y-4 ${
              isPremium
                ? "border-fuchsia-500/40 shadow-[0_0_32px_rgba(217,70,239,0.25)]"
                : "border-dark-700"
            }`}
          >
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-widest font-semibold ${
                isPremium
                  ? "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40"
                  : "bg-dark-800 text-dark-300 border-dark-600"
              }`}
            >
              {isPremium ? "★ " : ""}
              {tierLabel}
            </span>

            {badge.image_url ? (
              <img
                src={badge.image_url}
                alt={badge.name}
                className={`w-28 h-28 mx-auto rounded-full object-contain bg-dark-900 ring-2 ${ringColor}`}
              />
            ) : (
              <div
                className={`w-28 h-28 mx-auto rounded-full bg-dark-900 ring-2 ${ringColor} flex items-center justify-center text-5xl`}
              >
                {badge.icon}
              </div>
            )}

            <h1 className="text-2xl font-bold text-white">{badge.name}</h1>
            <p className="text-sm text-dark-300">{badge.description}</p>

            {badge.is_sponsored && (
              <div className="pt-3 border-t border-dark-700">
                <p className="text-[10px] uppercase tracking-widest text-dark-500">
                  Sponsored by
                </p>
                <p className="text-sm text-dark-100 mt-1">
                  {badge.sponsor_name ?? badge.brand_display_name ?? "—"}
                </p>
                {badge.sponsor_click_url && (
                  <a
                    href={badge.sponsor_click_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 text-xs text-fuchsia-300 hover:text-fuchsia-200 underline"
                  >
                    Sponsor sayfasına git →
                  </a>
                )}
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-xs text-dark-400">
              havesmashed: date'lerini logla, badge'ler kazan, dünyayı keşfet.
            </p>
            <Link
              to="/register"
              className="inline-block px-5 py-2.5 bg-neon-500/20 border border-neon-500/40 rounded-lg text-neon-300 text-sm font-medium hover:bg-neon-500/30 transition-colors"
            >
              havesmashed'e kayıt ol
            </Link>
          </div>
        </div>
      </div>

      <footer className="text-center text-[10px] text-dark-600 py-4">
        havesmashed · anonim aggregate
      </footer>
    </div>
  );
}
