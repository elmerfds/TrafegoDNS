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
} from 'lucide-react';
import { useAuthStore } from '../../stores';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'DNS Records', href: '/dns', icon: Globe },
  { name: 'Providers', href: '/providers', icon: Server },
  { name: 'Tunnels', href: '/tunnels', icon: Cable },
  { name: 'Webhooks', href: '/webhooks', icon: Webhook },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Audit Log', href: '/audit', icon: FileText },
];

export function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuthStore();

  return (
    <div className="flex flex-col h-full bg-gray-900 w-64">
      {/* Logo */}
      <div className="flex items-center h-16 px-4 bg-gray-800">
        <span className="text-xl font-bold text-white">TrafegoDNS</span>
        <span className="ml-2 text-xs text-gray-400">v2</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              to={item.href}
              className={`
                flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
                ${isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }
              `}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="flex-shrink-0 p-4 border-t border-gray-700">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.username || 'User'}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {user?.role || 'user'}
            </p>
          </div>
          <button
            onClick={() => logout()}
            className="ml-2 p-1 text-gray-400 hover:text-white rounded-md hover:bg-gray-700"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
