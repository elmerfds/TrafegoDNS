/**
 * Main Layout Component
 */
import { useState } from 'react';
import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface LayoutProps {
  title?: string;
}

export function Layout({ title = 'Dashboard' }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
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
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
