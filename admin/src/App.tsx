import { Routes, Route, Navigate } from 'react-router-dom'
import { useAdminStore } from '@/stores/adminStore'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import CitiesPage from '@/pages/CitiesPage'
import BadgesPage from '@/pages/BadgesPage'
import NotificationsPage from '@/pages/NotificationsPage'
import UsersPage from '@/pages/UsersPage'
import ForumPage from '@/pages/ForumPage'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAdminStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const isAuthenticated = useAdminStore((s) => s.isAuthenticated)

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cities" element={<CitiesPage />} />
        <Route path="/badges" element={<BadgesPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/forum" element={<ForumPage />} />
      </Route>
    </Routes>
  )
}
