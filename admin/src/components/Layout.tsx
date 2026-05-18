import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  MapPin,
  Award,
  Bell,
  Users,
  MessageSquare,
  LogOut,
  BarChart3,
  Layers,
  Megaphone,
  Link as LinkIcon,
  History,
  Building2,
  UserCog,
  ClipboardCheck,
  Inbox,
  Newspaper,
  BadgeCheck,
  MessagesSquare,
  ShieldCheck,
  ChevronRight,
  Activity,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import {
  effectiveRole,
  useAdminStore,
  type AdminRole,
} from '@/stores/adminStore'
import { authApi, cronHealthApi, inboxApi } from '@/services/api'
import ActAsBrandSelector from '@/components/ActAsBrandSelector'

type NavItem = {
  // Toggle-only parents (children-having items) leave `to` undefined.
  to?: string
  icon: LucideIcon
  label: string
  roles?: AdminRole[]
  children?: NavItem[]
  // Used as React key + open-state key when `to` is omitted.
  id?: string
  // Auto-open this group when the URL matches this prefix.
  matchPrefix?: string
}
type NavSection = { label?: string; items: NavItem[]; roles?: AdminRole[] }

// Sidebar groups — items filtered by effective role at render time.
const sections: NavSection[] = [
  {
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      {
        to: '/advertiser-stats',
        icon: BarChart3,
        label: 'Advertiser Stats',
        roles: ['super_admin'],
      },
      {
        to: '/wallet',
        icon: Wallet,
        label: 'Cüzdan',
        roles: ['brand_admin'],
      },
      { to: '/inbox', icon: Inbox, label: 'Inbox' },
    ],
  },
  {
    label: 'Ads',
    items: [
      {
        id: 'placements',
        icon: Layers,
        label: 'Placements',
        matchPrefix: '/ads/placements/',
        children: [
          { to: '/ads/placements/feed_native', icon: Newspaper, label: 'Feed Native' },
          { to: '/ads/placements/badge_sponsor', icon: BadgeCheck, label: 'Badge Sponsor' },
          { to: '/ads/placements/forum_thread', icon: MessagesSquare, label: 'Forum Thread' },
          { to: '/ads/placements/gated_interstitial', icon: ShieldCheck, label: 'Gated Interstitial' },
        ],
      },
      { to: '/ads/campaigns', icon: Megaphone, label: 'Campaigns' },
      {
        to: '/ads/pending-review',
        icon: ClipboardCheck,
        label: 'Approval Queue',
        roles: ['super_admin'],
      },
      { to: '/ads/affiliate', icon: LinkIcon, label: 'Affiliate Links' },
      { to: '/ads/audit', icon: History, label: 'Audit Log' },
    ],
  },
  {
    label: 'Brands & Admins',
    roles: ['super_admin'],
    items: [
      { to: '/brands', icon: Building2, label: 'Brands', roles: ['super_admin'] },
      {
        to: '/admin-users',
        icon: UserCog,
        label: 'Admin Users',
        roles: ['super_admin'],
      },
      {
        to: '/admin/cron-health',
        icon: Activity,
        label: 'Cron Sağlığı',
        roles: ['super_admin'],
      },
    ],
  },
  {
    label: 'Content',
    roles: ['super_admin'],
    items: [
      { to: '/cities', icon: MapPin, label: 'Cities', roles: ['super_admin'] },
      { to: '/badges', icon: Award, label: 'Badges', roles: ['super_admin'] },
      {
        to: '/notifications',
        icon: Bell,
        label: 'Notifications',
        roles: ['super_admin'],
      },
      { to: '/users', icon: Users, label: 'Users', roles: ['super_admin'] },
      {
        to: '/forum',
        icon: MessageSquare,
        label: 'Forum',
        roles: ['super_admin'],
      },
    ],
  },
]

function itemVisible(item: NavItem, role: AdminRole | null): boolean {
  if (!item.roles) return true
  if (!role) return false
  return item.roles.includes(role)
}

function sectionVisible(section: NavSection, role: AdminRole | null): boolean {
  if (section.roles) {
    if (!role) return false
    if (!section.roles.includes(role)) return false
  }
  return section.items.some((it) => itemVisible(it, role))
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const me = useAdminStore((s) => s.me)
  const logout = useAdminStore((s) => s.logout)
  const impersonating = me?.impersonating_brand ?? null

  const role = effectiveRole(me)
  const [unread, setUnread] = useState(0)
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set())
  const [staleCron, setStaleCron] = useState<string | null>(null)

  // Auto-expand any parent whose matchPrefix covers the current URL.
  useEffect(() => {
    setOpenMenus((prev) => {
      let next: Set<string> | null = null
      for (const section of sections) {
        for (const item of section.items) {
          if (!item.children || !item.matchPrefix || !item.id) continue
          if (location.pathname.startsWith(item.matchPrefix) && !prev.has(item.id)) {
            if (!next) next = new Set(prev)
            next.add(item.id)
          }
        }
      }
      return next ?? prev
    })
  }, [location.pathname])

  const toggleMenu = (id: string) =>
    setOpenMenus((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Refresh /me once on mount in case the persisted store is stale.
  useEffect(() => {
    if (!me) {
      authApi
        .me()
        .then((m) => useAdminStore.getState().setMe(m))
        .catch(() => useAdminStore.getState().logout())
    }
  }, [me])

  // Poll unread inbox count every 60s (cheap; single COUNT query).
  useEffect(() => {
    const hasUserId = me?.admin_user_id !== null && me?.admin_user_id !== undefined
    if (!hasUserId) return
    let cancelled = false
    const tick = () => {
      inboxApi
        .unreadCount()
        .then((r) => {
          if (!cancelled) setUnread(r.count)
        })
        .catch(() => {})
    }
    tick()
    const handle = window.setInterval(tick, 60000)
    return () => {
      cancelled = true
      window.clearInterval(handle)
    }
  }, [me?.admin_user_id])

  // Cron health heartbeat: super_admin için her 5 dk'da bir kontrol.
  // Stale ise banner gösterir (CronHealthPage'e link).
  useEffect(() => {
    if (role !== 'super_admin') {
      setStaleCron(null)
      return
    }
    let cancelled = false
    const tick = () => {
      cronHealthApi
        .status()
        .then((r) => {
          if (cancelled) return
          const stale = r.crons.find((c) => c.stale)
          setStaleCron(stale?.name ?? null)
        })
        .catch(() => {})
    }
    tick()
    const handle = window.setInterval(tick, 5 * 60_000)
    return () => {
      cancelled = true
      window.clearInterval(handle)
    }
  }, [role])

  async function handleLogout() {
    try {
      await authApi.logout()
    } catch {
      // ignore — local logout still proceeds
    }
    logout()
    navigate('/login')
  }

  async function handleStopImpersonation() {
    try {
      // Audit log için backend'i bilgilendir; ardından lokal state'i temizle.
      // Header zaten lokal store'dan geliyor, stop request'i header'la gider
      // (backend ctx.impersonating_brand_id okuyabilsin diye).
      await authApi.impersonateStop()
    } catch {
      // best-effort — ignore audit errors
    } finally {
      useAdminStore.getState().clearImpersonation()
      try {
        const me = await authApi.me()
        useAdminStore.getState().setMe(me)
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 h-screen w-56 bg-dark-900 border-r border-dark-700 flex flex-col z-10">
        <div className="p-4 border-b border-dark-700 flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-neon-500/10 ring-1 ring-neon-500/30 shrink-0">
            <img
              src="/logo-icon.png"
              alt="havesmashed"
              className="w-9 h-9 object-contain drop-shadow-[0_0_10px_rgba(236,72,153,0.6)]"
            />
          </div>
          <h1 className="text-base font-bold tracking-tight leading-tight">
            <span className="text-neon-500">havesmashed</span>
            <br />
            <span className="text-dark-300 text-xs uppercase tracking-widest">
              {role === 'brand_admin' ? 'brand portal' : 'admin'}
            </span>
          </h1>
        </div>

        {me && (
          <div className="px-4 py-3 border-b border-dark-700 text-[11px] text-dark-400">
            <div className="text-white truncate">{me.display_name}</div>
            <div className="truncate">{me.email ?? '(api key)'}</div>
            <div className="mt-1 text-dark-500 uppercase tracking-wider">
              {role === 'super_admin' ? 'super admin' : 'brand admin'}
              {me.brand && (
                <span className="ml-1 text-dark-400 lowercase">
                  · {me.brand.display_name}
                </span>
              )}
            </div>
          </div>
        )}

        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {sections
            .filter((s) => sectionVisible(s, role))
            .map((section, idx) => (
              <div
                key={section.label ?? `section-${idx}`}
                className={idx > 0 ? 'mt-5' : ''}
              >
                {section.label && (
                  <div className="px-3 mb-1.5 text-[10px] font-semibold text-dark-500 uppercase tracking-wider">
                    {section.label}
                  </div>
                )}
                <div className="space-y-1">
                  {section.items
                    .filter((it) => itemVisible(it, role))
                    .map((item) => {
                      const Icon = item.icon
                      const key = item.to ?? item.id ?? item.label
                      const hasChildren = !!item.children && item.children.length > 0
                      const isOpen = item.id ? openMenus.has(item.id) : false

                      return (
                        <div key={key}>
                          {item.to ? (
                            <NavLink
                              to={item.to}
                              end={item.to === '/'}
                              className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                  isActive
                                    ? 'bg-neon-500/15 text-neon-400'
                                    : 'text-dark-300 hover:text-dark-100 hover:bg-dark-800'
                                }`
                              }
                            >
                              <Icon size={18} />
                              <span className="flex-1">{item.label}</span>
                              {item.to === '/inbox' && unread > 0 && (
                                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-neon-500 text-[10px] font-bold text-white">
                                  {unread > 99 ? '99+' : unread}
                                </span>
                              )}
                            </NavLink>
                          ) : (
                            <button
                              type="button"
                              onClick={() => item.id && toggleMenu(item.id)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-dark-300 hover:text-dark-100 hover:bg-dark-800 transition-colors"
                              aria-expanded={isOpen}
                            >
                              <Icon size={18} />
                              <span className="flex-1 text-left">{item.label}</span>
                              <ChevronRight
                                size={14}
                                className={`text-dark-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                              />
                            </button>
                          )}
                          {hasChildren && isOpen && (
                            <div className="mt-1 ml-3 pl-3 border-l border-dark-700 space-y-1">
                              {item.children!
                                .filter((c) => itemVisible(c, role))
                                .map((child) => {
                                  const ChildIcon = child.icon
                                  if (!child.to) return null
                                  return (
                                    <NavLink
                                      key={child.to}
                                      to={child.to}
                                      className={({ isActive }) =>
                                        `flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                          isActive
                                            ? 'bg-neon-500/15 text-neon-400'
                                            : 'text-dark-400 hover:text-dark-100 hover:bg-dark-800'
                                        }`
                                      }
                                    >
                                      <ChildIcon size={14} />
                                      <span className="flex-1 truncate">{child.label}</span>
                                    </NavLink>
                                  )
                                })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            ))}
        </nav>

        <div className="p-3 border-t border-dark-700 space-y-1">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-neon-500/15 text-neon-400'
                  : 'text-dark-300 hover:text-dark-100 hover:bg-dark-800'
              }`
            }
          >
            <UserCog size={18} />
            Profile
          </NavLink>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-dark-400 hover:text-red-400 hover:bg-dark-800 transition-colors w-full"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-56 flex-1 min-h-screen flex flex-col">
        {/* Impersonation banner — sticky at top while in act-as mode */}
        {impersonating && (
          <div className="sticky top-0 z-20 px-6 py-2.5 bg-amber-500/15 border-b border-amber-500/40 text-amber-200 text-sm flex items-center gap-4">
            <span className="text-lg">🎭</span>
            <div className="flex-1">
              <strong className="font-semibold">{impersonating.display_name}</strong>{' '}
              adına davranıyorsunuz. Tüm mutations audit log'da
              impersonating_brand_id olarak iz bırakır.
            </div>
            <button
              onClick={handleStopImpersonation}
              className="px-3 py-1 rounded-md bg-amber-500/30 hover:bg-amber-500/50 text-amber-100 text-xs font-medium transition-colors"
            >
              Çık
            </button>
          </div>
        )}

        {/* Cron sağlığı uyarı banner — super_admin görür, stale olduğunda */}
        {role === 'super_admin' && staleCron && (
          <div className="sticky top-0 z-20 px-6 py-2.5 bg-red-500/15 border-b border-red-500/40 text-red-200 text-sm flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <strong className="font-mono font-semibold">{staleCron}</strong>{' '}
              cron'u 24 saatten uzun süredir tick atmıyor. Impression cap
              kontrolü çalışmıyor olabilir.
            </div>
            <NavLink
              to="/admin/cron-health"
              className="px-3 py-1 rounded-md bg-red-500/30 hover:bg-red-500/50 text-red-100 text-xs font-medium transition-colors"
            >
              Detay
            </NavLink>
          </div>
        )}

        {/* Act-as toggle in header for super_admin (when not yet impersonating) */}
        {role === 'super_admin' && !impersonating && (
          <div className="px-6 py-2 bg-dark-900/40 border-b border-dark-800 flex justify-end">
            <ActAsBrandSelector />
          </div>
        )}

        <div className="flex-1 p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
