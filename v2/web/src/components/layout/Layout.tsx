/**
 * Main Layout Component
 */
import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from '../common';
import { SpotlightProvider } from '../../contexts/SpotlightContext';
import { AuthDisabledBanner } from './AuthDisabledBanner';

// Map route paths to page titles
const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/dns': 'DNS Records',
  '/providers': 'Providers',
  '/tunnels': 'Tunnels',
  '/webhooks': 'Webhooks',
  '/settings': 'Settings',
  '/logs': 'Logs',
  '/users': 'Users',
  '/profile': 'Profile',
  '/api-docs': 'API Reference',
};

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const location = useLocation();
  const title = routeTitles[location.pathname] || 'Dashboard';

  // Global keyboard shortcut for command palette (Cmd/Ctrl + K)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCommandPaletteOpen((open) => !open);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <SpotlightProvider>
      <AuthDisabledBanner />
      <div className="flex h-screen overflow-hidden gradient-bg">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-gray-900/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Mobile sidebar */}
        <div
          className={`
            fixed inset-y-0 left-0 z-50 transform lg:hidden
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            transition-transform duration-300 ease-in-out
          `}
        >
          <Sidebar />
        </div>

        {/* Desktop sidebar */}
        <div className="hidden lg:flex lg:flex-shrink-0">
          <Sidebar />
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            title={title}
            onMenuClick={() => setSidebarOpen(true)}
            onSearchClick={() => setCommandPaletteOpen(true)}
          />

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>

        {/* Command Palette */}
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
        />
      </div>
    </SpotlightProvider>
  );
}
