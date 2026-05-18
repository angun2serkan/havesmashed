// URL input + affiliate link seçici.
//
// Brand operatörü kampanya/badge URL alanlarında elle URL yazabilir;
// alternatif olarak sağdaki butona basıp kendi aktif affiliate
// link'lerinden birini seçer. Seçim yapıldığında input
// `https://<base>/go/<slug>` ile dolar — elle de düzenlenebilir.
//
// Backend brand-scope filtreliyor; brand_admin sadece kendi slug'larını
// görür, super_admin tümünü.

import { useEffect, useRef, useState } from 'react'
import { Link as LinkIcon, ChevronDown } from 'lucide-react'
import { adminApi, type AffiliateLink } from '@/services/api'

const PUBLIC_BASE_URL =
  (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined) ||
  (typeof window !== 'undefined' ? window.location.origin : '')

function publicAffiliateUrl(slug: string): string {
  return `${PUBLIC_BASE_URL.replace(/\/$/, '')}/go/${slug}`
}

export function UrlWithAffiliatePicker({
  value,
  onChange,
  placeholder = 'https://brand.com/landing',
  inputClassName = '',
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  inputClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState<AffiliateLink[] | null>(null)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || links !== null) return
    adminApi
      .listAffiliate()
      .then((rows) => setLinks(rows.filter((r) => r.is_active)))
      .catch(() => setLinks([]))
  }, [open, links])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = links?.filter((l) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      l.slug.toLowerCase().includes(q) ||
      (l.name?.toLowerCase().includes(q) ?? false)
    )
  })

  return (
    <div className="relative flex gap-2" ref={wrapperRef}>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neon-500 ${inputClassName}`}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Affiliate link'imden seç"
        className="inline-flex items-center gap-1 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700 hover:text-white whitespace-nowrap"
      >
        <LinkIcon size={14} /> <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-80 bg-dark-900 border border-dark-700 rounded-lg shadow-xl">
          <div className="p-2 border-b border-dark-700">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="isim veya slug ile ara…"
              className="w-full bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-neon-500"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {links === null ? (
              <div className="p-3 text-xs text-dark-400">Yükleniyor…</div>
            ) : filtered && filtered.length > 0 ? (
              <ul>
                {filtered.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(publicAffiliateUrl(l.slug))
                        setOpen(false)
                        setQuery('')
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-dark-800 border-b border-dark-800 last:border-0"
                    >
                      <div className="text-sm text-white">
                        {l.name ?? (
                          <span className="text-dark-300 italic">İsimsiz</span>
                        )}
                      </div>
                      <div className="text-[10px] text-dark-500 font-mono mt-0.5">
                        /go/{l.slug}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-3 text-xs text-dark-400">
                {(links?.length ?? 0) === 0
                  ? 'Aktif affiliate link yok.'
                  : 'Eşleşen link yok.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
