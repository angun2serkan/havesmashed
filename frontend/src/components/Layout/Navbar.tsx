import { Link, useLocation } from "react-router-dom";
import {
  Globe,
  CalendarHeart,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

const navItems = [
  { path: "/", icon: Globe, label: "Globe" },
  { path: "/dates", icon: CalendarHeart, label: "Dates" },
  { path: "/friends", icon: Users, label: "Friends" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

export function Navbar() {
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();

  if (!isAuthenticated) return null;

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex fixed left-0 top-0 h-full w-16 flex-col items-center py-6 bg-dark-900/80 backdrop-blur-md border-r border-dark-700 z-40 gap-2">
        <div className="text-neon-500 font-bold text-xl mb-8 text-glow">H</div>
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 group relative ${
                isActive
                  ? "bg-neon-500/20 text-neon-500 glow-sm"
                  : "text-dark-400 hover:text-neon-400 hover:bg-dark-800"
              }`}
              title={label}
            >
              <Icon size={20} />
              <span className="absolute left-14 px-2 py-1 bg-dark-800 border border-dark-600 rounded text-xs text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                {label}
              </span>
            </Link>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-2">
          {user?.nickname && (
            <span className="text-[10px] text-dark-400 truncate max-w-[56px] text-center">
              {user.nickname}
            </span>
          )}
          <button
            onClick={logout}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-dark-400 hover:text-red-400 hover:bg-dark-800 transition-all cursor-pointer"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around bg-dark-900/90 backdrop-blur-md border-t border-dark-700 z-40 py-2 px-4">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all ${
                isActive
                  ? "text-neon-500"
                  : "text-dark-400"
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px]">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
