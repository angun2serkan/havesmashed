import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, MapPin, Award, Bell, Users, LogOut } from 'lucide-react'
import { useAdminStore } from '@/stores/adminStore'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/cities', icon: MapPin, label: 'Cities' },
  { to: '/badges', icon: Award, label: 'Badges' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/users', icon: Users, label: 'Users' },
]

export default function Layout() {
  const logout = useAdminStore((s) => s.logout)

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 h-screen w-56 bg-dark-900 border-r border-dark-700 flex flex-col z-10">
        <div className="p-5 border-b border-dark-700">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-neon-500">havesmashed</span>{' '}
            <span className="text-dark-300">admin</span>
          </h1>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-neon-500/15 text-neon-400'
                    : 'text-dark-300 hover:text-dark-100 hover:bg-dark-800'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-dark-700">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-dark-400 hover:text-red-400 hover:bg-dark-800 transition-colors w-full"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-56 flex-1 p-6 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
