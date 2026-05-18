import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { effectiveRole, useAdminStore } from '@/stores/adminStore'
import { authApi } from '@/services/api'
import Layout from '@/components/Layout'

import LoginPage from '@/pages/LoginPage'
import ChangePasswordPage from '@/pages/ChangePasswordPage'
import ProfilePage from '@/pages/ProfilePage'

import DashboardPage from '@/pages/DashboardPage'
import BrandPortalDashboard from '@/pages/BrandPortalDashboard'
import CitiesPage from '@/pages/CitiesPage'
import BadgesPage from '@/pages/BadgesPage'
import NotificationsPage from '@/pages/NotificationsPage'
import UsersPage from '@/pages/UsersPage'
import ForumPage from '@/pages/ForumPage'
import AdvertiserStatsPage from '@/pages/AdvertiserStatsPage'
import AdPlacementDetailPage from '@/pages/AdPlacementDetailPage'
import AdCampaignsPage from '@/pages/AdCampaignsPage'
import AdCampaignDetailPage from '@/pages/AdCampaignDetailPage'
import ApprovalQueuePage from '@/pages/ApprovalQueuePage'
import AffiliateLinksPage from '@/pages/AffiliateLinksPage'
import AdAuditLogPage from '@/pages/AdAuditLogPage'
import BrandsPage from '@/pages/BrandsPage'
import BrandDetailPage from '@/pages/BrandDetailPage'
import BrandWalletPage from '@/pages/BrandWalletPage'
import BrandWalletPortalPage from '@/pages/BrandWalletPortalPage'
import AdminUsersPage from '@/pages/AdminUsersPage'
import InboxPage from '@/pages/InboxPage'
import CronHealthPage from '@/pages/CronHealthPage'

/**
 * Wraps protected routes. Three gates run in order:
 *   1. Not authenticated → /login
 *   2. /me hasn't been fetched yet → loading splash (briefly)
 *   3. me.must_change_password === true → /change-password (force)
 * Only after all three pass does the routed page render.
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAdminStore((s) => s.isAuthenticated)
  const me = useAdminStore((s) => s.me)
  const location = useLocation()

  // Fetch /me on first authenticated render if missing.
  useEffect(() => {
    if (isAuthenticated && me === null) {
      authApi
        .me()
        .then((m) => useAdminStore.getState().setMe(m))
        .catch(() => useAdminStore.getState().logout())
    }
  }, [isAuthenticated, me])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  if (me === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950 text-dark-400 text-sm">
        Loading session…
      </div>
    )
  }
  if (me.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return <>{children}</>
}

/** Show only when effective role matches; otherwise redirect home. */
function RoleGate({
  role,
  children,
}: {
  role: 'super_admin' | 'brand_admin'
  children: React.ReactNode
}) {
  const me = useAdminStore((s) => s.me)
  const effective = effectiveRole(me)
  if (effective !== role) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Brand_admin lands on a leaner home; super_admin keeps the platform dashboard. */
function HomeRoute() {
  const me = useAdminStore((s) => s.me)
  const role = effectiveRole(me)
  if (role === 'brand_admin') return <BrandPortalDashboard />
  return <DashboardPage />
}

export default function App() {
  const isAuthenticated = useAdminStore((s) => s.isAuthenticated)
  const me = useAdminStore((s) => s.me)

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />

      {/* Force-change route lives outside Layout so the user can't see
          the sidebar / navigate away while still required to change. */}
      <Route
        path="/change-password"
        element={
          !isAuthenticated ? (
            <Navigate to="/login" replace />
          ) : me === null ? (
            <ChangePasswordPage />
          ) : (
            <ChangePasswordPage />
          )
        }
      />

      <Route
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route path="/" element={<HomeRoute />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/wallet" element={<BrandWalletPortalPage />} />

        {/* Super-only platform content */}
        <Route
          path="/cities"
          element={<RoleGate role="super_admin"><CitiesPage /></RoleGate>}
        />
        <Route
          path="/badges"
          element={<RoleGate role="super_admin"><BadgesPage /></RoleGate>}
        />
        <Route
          path="/notifications"
          element={<RoleGate role="super_admin"><NotificationsPage /></RoleGate>}
        />
        <Route
          path="/users"
          element={<RoleGate role="super_admin"><UsersPage /></RoleGate>}
        />
        <Route
          path="/forum"
          element={<RoleGate role="super_admin"><ForumPage /></RoleGate>}
        />
        <Route
          path="/advertiser-stats"
          element={<RoleGate role="super_admin"><AdvertiserStatsPage /></RoleGate>}
        />

        {/* Brands & Admin users — super only */}
        <Route
          path="/brands"
          element={<RoleGate role="super_admin"><BrandsPage /></RoleGate>}
        />
        <Route
          path="/brands/:id"
          element={<RoleGate role="super_admin"><BrandDetailPage /></RoleGate>}
        />
        <Route
          path="/brands/:id/wallet"
          element={<RoleGate role="super_admin"><BrandWalletPage /></RoleGate>}
        />
        <Route
          path="/admin-users"
          element={<RoleGate role="super_admin"><AdminUsersPage /></RoleGate>}
        />
        <Route
          path="/admin/cron-health"
          element={<RoleGate role="super_admin"><CronHealthPage /></RoleGate>}
        />

        {/* Ads — both roles see (brand_admin scoped by API) */}
        <Route path="/ads/placements/:key" element={<AdPlacementDetailPage />} />
        <Route path="/ads/campaigns" element={<AdCampaignsPage />} />
        <Route path="/ads/campaigns/:id" element={<AdCampaignDetailPage />} />
        <Route
          path="/ads/pending-review"
          element={<RoleGate role="super_admin"><ApprovalQueuePage /></RoleGate>}
        />
        <Route path="/ads/affiliate" element={<AffiliateLinksPage />} />
        <Route path="/ads/audit" element={<AdAuditLogPage />} />
      </Route>
    </Routes>
  )
}
