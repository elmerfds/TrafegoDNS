/**
 * Sidebar Navigation
 */
import { Link, useLocation } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Globe,
  Server,
  Cable,
  Webhook,
  Settings,
  FileText,
  LogOut,
  Users,
  BookOpen,
} from 'lucide-react';
import { useAuthStore } from '../../stores';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  adminOnly?: boolean;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'DNS Records', href: '/dns', icon: Globe },
  { name: 'Providers', href: '/providers', icon: Server },
  { name: 'Tunnels', href: '/tunnels', icon: Cable },
  { name: 'Webhooks', href: '/webhooks', icon: Webhook },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Users', href: '/users', icon: Users, adminOnly: true },
  { name: 'Logs', href: '/logs', icon: FileText },
  { name: 'API Reference', href: '/api-docs', icon: BookOpen },
];

export function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuthStore();

  return (
    <div className="flex flex-col h-full w-64 gradient-sidebar">
      {/* Logo Section */}
      <div className="flex items-center h-16 px-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src="/logo.svg" alt="TrafegoDNS" className="w-10 h-10" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">TrafegoDNS</span>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-gradient-to-r from-primary-500 to-purple-500 text-white rounded-md">
                v2
              </span>
              <span className="text-[10px] text-gray-500">BETA</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="mb-2 px-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Menu
          </span>
        </div>
        {navigation
          .filter((item) => !item.adminOnly || user?.role === 'admin')
          .map((item) => {
          const isActive = location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              to={item.href}
              className={`
                group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200
                ${isActive
                  ? 'bg-gradient-to-r from-primary-600/20 to-purple-600/20 text-white border-l-2 border-primary-500'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                }
              `}
            >
              <Icon className={`w-5 h-5 mr-3 transition-colors ${isActive ? 'text-primary-400' : 'text-gray-500 group-hover:text-gray-400'}`} />
              {item.name}
              {item.badge && (
                <span className="ml-auto px-2 py-0.5 text-[10px] font-semibold bg-primary-500 text-white rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="flex-shrink-0 p-4 border-t border-white/10">
        <div className="flex items-center">
          <Link
            to="/profile"
            className="flex items-center flex-1 min-w-0 group cursor-pointer hover:opacity-80 transition-opacity"
            title="Profile settings"
          >
            <div className="flex-shrink-0">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-10 h-10 rounded-xl object-cover shadow-lg"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-shadow">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate group-hover:text-primary-300 transition-colors">
                {user?.username || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate capitalize">
                {user?.role || 'user'}
              </p>
            </div>
          </Link>
          <button
            onClick={() => logout()}
            className="ml-2 p-2 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 transition-all duration-200"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
