// Mock preview of how each placement renders in the user-facing app.
//
// This is a pure visualization for the admin operator — the real
// `AdSlot` component lands in Task 4.6. Once that ships, swap the
// internals below to render through it for true fidelity. Until then,
// these mocks keep the shape, dimensions, and "Sponsored" labeling
// honest so admin can validate creative spec choices.

import { ExternalLink, Bell, Pin, Clock } from 'lucide-react'

export type PreviewCreative = {
  image_url?: string
  title?: string
  body?: string
  cta?: string
  sponsor_name?: string
  logo_url?: string
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
  push: {
    title: 'Yeni date hediyesi',
    body: 'Bu hafta sonu için kondom kampanyası bekliyor.',
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
        {placementKey === 'push' && <PushMock c={c} />}
        {placementKey === 'gated_interstitial' && <GatedInterstitialMock c={c} />}
        {!['feed_native', 'badge_sponsor', 'forum_thread', 'push', 'gated_interstitial'].includes(
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
      <div className="aspect-[2/1] bg-gradient-to-br from-neon-500/30 to-accent-cyan/20 flex items-center justify-center text-dark-300 text-xs">
        {c.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image_url} alt="" className="w-full h-full object-cover" />
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
  return (
    <div className="bg-dark-800 rounded-xl p-4 flex items-center gap-3 border border-dark-700">
      <div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center text-white text-2xl font-bold">
        ★
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white">
          {c.title || 'Badge ismi'}
        </div>
        <div className="text-[10px] text-dark-500 mt-0.5">
          {c.body || `Presented by ${c.sponsor_name || 'Sponsor'}`}
        </div>
        {c.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.logo_url} alt="" className="h-3 mt-1" />
        )}
      </div>
    </div>
  )
}

function ForumThreadMock({ c }: { c: PreviewCreative }) {
  return (
    <div className="bg-dark-800 rounded-xl p-3 border border-neon-500/30">
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
      <div className="aspect-[9/16] bg-gradient-to-br from-neon-500/15 via-dark-900 to-dark-950 flex items-center justify-center">
        {c.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-dark-400 text-[10px]">
            1080×1920 görsel
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
        <div className="flex gap-1.5">
          <button className="flex-1 px-2 py-1.5 bg-dark-800 border border-dark-700 rounded text-[11px] text-dark-400">
            Atla (5s)
          </button>
          <button className="flex-[2] px-2 py-1.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded text-[11px] font-medium">
            {c.cta || 'Devam et'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PushMock({ c }: { c: PreviewCreative }) {
  return (
    <div className="bg-dark-800 rounded-xl p-3 flex items-start gap-3 border border-dark-700">
      <div className="w-8 h-8 rounded-lg bg-neon-500/20 flex items-center justify-center shrink-0">
        <Bell size={14} className="text-neon-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-white">havesmashed</span>
          <span className="text-[10px] text-dark-500">şimdi · sponsored</span>
        </div>
        <div className="text-xs font-semibold text-white">
          {c.title || 'Push başlığı'}
        </div>
        <div className="text-[11px] text-dark-300 line-clamp-2">
          {c.body || 'Push body metni'}
        </div>
      </div>
    </div>
  )
}
