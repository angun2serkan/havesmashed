import { useEffect, useMemo, useState } from "react";
import { Copy, Check, X, Link as LinkIcon } from "lucide-react";
import type { Badge } from "@/types";
import { api } from "@/services/api";

/**
 * Üç farklı share akışını tek bir modal'da topluyoruz:
 *   - badge:           kullanıcı kazandığı bir badge'i arkadaşına paylaşır
 *   - platform_invite: havesmashed'e kayıt linki
 *   - friend_invite:   8-haneli arkadaşlık kodu + opsiyonel link
 *
 * Anonimite kuralı: public share sayfası (`/b/:id`) kullanıcıyı tanımlamaz.
 * Kişisel ifadeler (isim, date sayısı vb.) yalnızca buradaki düzenlenebilir
 * mesaj text'inde geçer; kullanıcı sileyim derse silebilir.
 */
type ShareMode =
  | {
      type: "badge";
      badge: Badge;
      shareUrl: string;
      userNickname?: string | null;
      dateCount?: number | null;
    }
  | {
      type: "platform_invite";
      link: string;
      inviterNickname?: string | null;
      dateCount?: number | null;
    }
  | { type: "friend_invite"; code: string; link: string };

function defaultMessage(mode: ShareMode): string {
  switch (mode.type) {
    case "badge": {
      const { badge, userNickname, dateCount, shareUrl } = mode;
      const lines: string[] = [];
      if (userNickname) {
        const datePart =
          typeof dateCount === "number" ? ` ${dateCount} date'le` : "";
        lines.push(`Hey, ${userNickname}${datePart} havesmashed'de "${badge.name}" badge'ini kazandı.`);
      } else {
        lines.push(`${badge.icon} havesmashed'de "${badge.name}" badge'ini kazandım.`);
      }
      lines.push(badge.description);
      if (badge.isSponsored && badge.sponsorName) {
        lines.push(`✨ Sponsored by ${badge.sponsorName}`);
      }
      lines.push(shareUrl);
      return lines.join("\n");
    }
    case "platform_invite": {
      const name =
        mode.inviterNickname && mode.inviterNickname.trim().length > 0
          ? mode.inviterNickname
          : "Arkadaşın";
      const count = typeof mode.dateCount === "number" ? mode.dateCount : 0;
      return `Hey ${name} sürekli sikişiyor (${count}) ona yetişmek için hemen Have I Smash'e katıl: ${mode.link}`;
    }
    case "friend_invite":
      return [
        `havesmashed'de arkadaşım ol — bu kodu kullan: ${mode.code}`,
        mode.link,
      ].join("\n");
  }
}

function shareLink(mode: ShareMode): string {
  return mode.type === "badge" ? mode.shareUrl : mode.link;
}

function title(mode: ShareMode): string {
  switch (mode.type) {
    case "badge":
      return "Badge'i paylaş";
    case "platform_invite":
      return "Davet linkini paylaş";
    case "friend_invite":
      return "Arkadaşlık kodunu paylaş";
  }
}

export function ShareDialog({
  mode,
  onClose,
}: {
  mode: ShareMode;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(() => defaultMessage(mode));
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  // Badge share modunda dateCount prop olarak gelmediyse stats'tan lazily
  // çek ve message'a inject et — user'ın istediği "32 date" formatı için.
  useEffect(() => {
    if (
      mode.type === "badge" &&
      mode.userNickname &&
      (mode.dateCount === undefined || mode.dateCount === null)
    ) {
      api
        .getStats()
        .then((s) => {
          // Re-template with date count
          const enrichedMode: ShareMode = {
            ...mode,
            dateCount: s.totalDates,
          };
          setMessage(defaultMessage(enrichedMode));
        })
        .catch(() => {
          // Stats çekilemezse user başlığı + kazanılan badge yeterli
        });
    }
  }, [mode]);

  // Badge share için backend'e basit event tracking (count++).
  // Yalnızca modal açıldığında bir kez. user_id BACKEND'E GİTMEZ.
  useEffect(() => {
    if (mode.type === "badge") {
      api.trackBadgeShare(mode.badge.id).catch(() => {
        // Sessizce yut — sayaç hatası kullanıcıyı bloklayamaz
      });
    }
  }, [mode]);

  const link = useMemo(() => shareLink(mode), [mode]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{title(mode)}</h3>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white p-1 rounded"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Preview kartı — mode'a göre değişir */}
        {mode.type === "badge" ? (
          <BadgePreview badge={mode.badge} />
        ) : mode.type === "friend_invite" ? (
          <div className="bg-dark-950 border border-neon-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-dark-500 mb-2">
              arkadaşlık kodu
            </p>
            <p className="text-2xl font-mono font-bold tracking-[0.2em] text-white">
              {mode.code.length > 4
                ? `${mode.code.slice(0, 4)} ${mode.code.slice(4)}`
                : mode.code}
            </p>
          </div>
        ) : (
          <div className="bg-dark-950 border border-dark-700 rounded-xl p-4 flex items-center gap-3 text-xs text-dark-300">
            <LinkIcon size={14} className="text-neon-500 shrink-0" />
            <span className="font-mono truncate">{link}</span>
          </div>
        )}

        {/* Düzenlenebilir mesaj */}
        <div>
          <label className="block text-[11px] text-dark-400 mb-1.5">
            Mesajı düzenleyebilirsin
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-xs text-dark-100 resize-none focus:outline-none focus:border-neon-500/50"
          />
        </div>

        {/* Aksiyon butonları — platform_invite'ta bare-link kopyalama
            yok; sadece formatlı mesaj kopyalanabilir. */}
        <div className={mode.type === "platform_invite" ? "" : "grid grid-cols-2 gap-2"}>
          {mode.type !== "platform_invite" && (
            <button
              onClick={copyLink}
              className="flex items-center justify-center gap-1.5 py-2 bg-dark-800 border border-dark-600 rounded-lg text-xs text-dark-200 hover:border-neon-500/50 transition-colors"
            >
              {copiedLink ? <Check size={14} /> : <LinkIcon size={14} />}
              {copiedLink ? "Linki kopyalandı" : "Linki kopyala"}
            </button>
          )}
          <button
            onClick={copyMessage}
            className="flex items-center justify-center gap-1.5 py-2 bg-neon-500/15 border border-neon-500/40 rounded-lg text-xs text-neon-300 hover:bg-neon-500/25 transition-colors w-full"
          >
            {copiedMessage ? <Check size={14} /> : <Copy size={14} />}
            {copiedMessage ? "Mesaj kopyalandı" : "Mesajı kopyala"}
          </button>
        </div>

        <p className="text-[10px] text-dark-500 leading-relaxed">
          Açılan sayfa kim olduğunu göstermez — yalnızca yukarıdaki mesajdaki
          ifadeler arkadaşına gider. Mesajı istediğin gibi düzenleyebilirsin.
        </p>
      </div>
    </div>
  );
}

function BadgePreview({ badge }: { badge: Badge }) {
  const ringColor =
    badge.tier === "premium"
      ? "ring-fuchsia-500/60"
      : badge.tier === "gold"
        ? "ring-yellow-500/40"
        : badge.tier === "silver"
          ? "ring-slate-400/40"
          : "ring-amber-700/40";
  return (
    <div className="bg-dark-950 border border-dark-700 rounded-xl p-4 flex items-center gap-3">
      <div
        className={`w-14 h-14 rounded-full bg-dark-900 ring-2 ${ringColor} flex items-center justify-center text-2xl shrink-0`}
      >
        {badge.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{badge.name}</p>
        <p className="text-[11px] text-dark-400 line-clamp-2">
          {badge.description}
        </p>
        {badge.isSponsored && badge.sponsorName && (
          <p className="text-[10px] text-fuchsia-400 mt-1 uppercase tracking-wider">
            Sponsored by {badge.sponsorName}
          </p>
        )}
      </div>
    </div>
  );
}
