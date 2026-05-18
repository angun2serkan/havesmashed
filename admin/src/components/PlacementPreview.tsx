// Mock preview of how each placement renders in the user-facing app.
//
// This is a pure visualization for the admin operator — the real
// `AdSlot` component lands in Task 4.6. Once that ships, swap the
// internals below to render through it for true fidelity. Until then,
// these mocks keep the shape, dimensions, and "Sponsored" labeling
// honest so admin can validate creative spec choices.

import { ExternalLink, Pin, Clock } from 'lucide-react'

export type PreviewCreative = {
  image_url?: string
  video_url?: string
  title?: string
  body?: string
  cta?: string
  sponsor_name?: string
  logo_url?: string
  /** Sponsored badge için emoji ikon — image_url yoksa render edilir. */
  icon?: string
}

const SAMPLE: Record<string, PreviewCreative> = {
  feed_native: {
    image_url: '',
    title: 'Bu hafta sonu Beyoğlu',
    body: 'Yeni açılan barlar, kondom dahil rezervasyon avantajı.',
    cta: 'Keşfet',
  },
  badge_sponsor: {
    sponsor_name: 'Durex',
    title: '50 Date Master',
    body: 'Presented by Durex',
  },
  forum_thread: {
    title: 'Cinsel sağlık üzerine 5 mit',
    body: 'Uzmanlarla soru-cevap. Sponsored.',
    sponsor_name: 'Durex',
  },
  gated_interstitial: {
    title: 'Güvenli date için Durex',
    body: 'Devam et\'e basmadan önce kısa bir reklam izleyeceksin.',
    cta: 'Devam et',
    sponsor_name: 'Durex',
  },
}

export function PlacementPreview({
  placementKey,
  creative,
  viewport = 'mobile',
}: {
  placementKey: string
  creative?: PreviewCreative
  viewport?: 'mobile' | 'desktop'
}) {
  const c = { ...SAMPLE[placementKey], ...(creative ?? {}) }
  const frameClass =
    viewport === 'mobile'
      ? 'w-[320px] mx-auto'
      : 'w-full max-w-[640px] mx-auto'

  return (
    <div className={frameClass}>
      <div className="text-[10px] uppercase tracking-wide text-dark-500 mb-2 text-center">
        {viewport} preview
      </div>
      <div className="bg-dark-950 border border-dark-700 rounded-2xl p-3">
        {placementKey === 'feed_native' && <FeedNativeMock c={c} />}
        {placementKey === 'badge_sponsor' && <BadgeSponsorMock c={c} />}
        {placementKey === 'forum_thread' && <ForumThreadMock c={c} />}
        {placementKey === 'gated_interstitial' && <GatedInterstitialMock c={c} />}
        {!['feed_native', 'badge_sponsor', 'forum_thread', 'gated_interstitial'].includes(
          placementKey,
        ) && (
          <div className="text-xs text-dark-500 text-center py-8">
            "{placementKey}" için preview tanımlı değil.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Per-type mocks ────────────────────────────────────────────

function FeedNativeMock({ c }: { c: PreviewCreative }) {
  return (
    <div className="bg-dark-800 rounded-xl overflow-hidden border border-dark-700">
      <div className="aspect-[2/1] bg-dark-900 flex items-center justify-center text-dark-300 text-xs">
        {c.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image_url} alt="" className="w-full h-full object-contain" />
        ) : (
          '1200×600 görsel'
        )}
      </div>
      <div className="p-3">
        <div className="text-[10px] text-dark-500 mb-1">Sponsored</div>
        <h4 className="text-sm font-semibold text-white mb-1 line-clamp-2">
          {c.title || 'Reklam başlığı'}
        </h4>
        <p className="text-xs text-dark-300 mb-3 line-clamp-2">
          {c.body || 'Kısa açıklama metni'}
        </p>
        <button className="text-xs font-medium text-neon-400 inline-flex items-center gap-1">
          {c.cta || 'Keşfet'} <ExternalLink size={12} />
        </button>
      </div>
    </div>
  )
}

function BadgeSponsorMock({ c }: { c: PreviewCreative }) {
  // Premium tier sponsored badge görünümü — kullanıcının görüceği card
  // ile aynı (BadgePreview'daki ApprovalQueuePage versiyonu).
  // Görsel öncelik sırası: image_url > icon > placeholder ★.
  return (
    <div className="bg-linear-to-br from-dark-950 to-dark-900 border border-fuchsia-500/40 rounded-xl p-5 flex flex-col items-center text-center shadow-[0_0_24px_rgba(217,70,239,0.25)]">
      <span className="mb-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/40 text-[10px] uppercase tracking-widest font-semibold">
        ★ premium
      </span>
      {c.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.image_url}
          alt={c.title ?? 'badge'}
          className="w-20 h-20 object-contain rounded-full mb-3 ring-2 ring-fuchsia-500/60"
        />
      ) : (
        <div className="w-20 h-20 rounded-full bg-fuchsia-500/10 ring-2 ring-fuchsia-500/40 flex items-center justify-center text-4xl mb-3">
          {c.icon || '★'}
        </div>
      )}
      <h4 className="font-bold text-white text-base">
        {c.title || 'Badge ismi'}
      </h4>
      {c.body && (
        <p className="text-xs text-dark-300 mt-1">{c.body}</p>
      )}
      <div className="mt-4 pt-3 border-t border-dark-700 w-full">
        <p className="text-[10px] uppercase tracking-wider text-dark-500">
          Sponsored by
        </p>
        <p className="text-xs text-dark-200 mt-0.5">
          {c.sponsor_name || 'Sponsor'}
        </p>
      </div>
    </div>
  )
}

function ForumThreadMock({ c }: { c: PreviewCreative }) {
  return (
    <div className="bg-dark-800 rounded-xl overflow-hidden border border-neon-500/30">
      {c.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.image_url}
          alt=""
          className="w-full aspect-2/1 object-contain bg-dark-950"
        />
      )}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Pin size={12} className="text-neon-400" />
          <span className="text-[10px] uppercase tracking-wide text-neon-400">
            Pinned · Sponsored
          </span>
        </div>
        <h4 className="text-sm font-semibold text-white mb-1 line-clamp-2">
          {c.title || 'Forum başlığı'}
        </h4>
        <p className="text-xs text-dark-300 mb-2 line-clamp-3">
          {c.body || 'Forum açıklaması — paylaşım metni'}
        </p>
        <div className="text-[10px] text-dark-500">
          Presented by {c.sponsor_name || 'Sponsor'}
        </div>
      </div>
    </div>
  )
}

function GatedInterstitialMock({ c }: { c: PreviewCreative }) {
  return (
    <div className="bg-black rounded-xl overflow-hidden border border-dark-700">
      <div className="px-3 py-1.5 bg-dark-950 border-b border-dark-800 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider text-dark-400">
          Sponsorlu · {c.sponsor_name || 'Sponsor'}
        </span>
        <span className="text-[9px] text-dark-500">date_create gate</span>
      </div>
      <div className="aspect-[9/16] bg-dark-950 flex items-center justify-center">
        {c.video_url ? (
          <video
            src={c.video_url}
            className="w-full h-full object-contain bg-dark-950"
            autoPlay
            muted
            playsInline
            loop
            controls
            preload="metadata"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neon-500/15 via-dark-900 to-dark-950">
            <div className="text-center text-dark-400 text-[10px]">
              Video yüklenince burada oynar
            </div>
          </div>
        )}
      </div>
      <div className="p-3 bg-dark-900">
        <h4 className="text-sm font-semibold text-white mb-1 line-clamp-2">
          {c.title || 'Reklam başlığı'}
        </h4>
        <p className="text-[11px] text-dark-300 mb-3 line-clamp-2">
          {c.body || 'Reklam açıklaması'}
        </p>
        <div className="flex items-center gap-2 text-[10px] text-dark-400 mb-2">
          <Clock size={10} /> Devam etmek için 5s bekle
        </div>
        <div className="h-1 bg-dark-800 rounded-full mb-2 overflow-hidden">
          <div className="h-full w-2/5 bg-neon-500" />
        </div>
        <button className="w-full px-2 py-1.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded text-[11px] font-medium">
          {c.cta || 'Devam et'}
        </button>
      </div>
    </div>
  )
}

