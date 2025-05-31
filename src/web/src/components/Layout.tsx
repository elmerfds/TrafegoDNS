import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Home,
  Globe,
  Container,
  Link2,
  Settings,
  Users,
  LogOut,
  User,
  Menu,
  AlertTriangle,
  FileText,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { usePermissions } from '@/hooks/usePermissions'

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home, path: '/' },
  { name: 'DNS Records', href: '/dns-records', icon: Globe, path: '/dns' },
  { name: 'Orphaned Records', href: '/orphaned-records', icon: AlertTriangle, path: '/orphaned' },
  { name: 'Containers', href: '/containers', icon: Container, path: '/containers' },
  { name: 'Hostnames', href: '/hostnames', icon: Link2, path: '/hostnames' },
  { name: 'Logs', href: '/logs', icon: FileText, path: '/logs' },
  { name: 'Settings', href: '/settings', icon: Settings, path: '/settings' },
  { name: 'Users', href: '/users', icon: Users, path: '/users' },
]

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { canAccessPage } = usePermissions()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  // Filter navigation items based on user permissions
  const filteredNavigation = navigation.filter(item => canAccessPage(item.path))

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 z-50 flex w-72 flex-col lg:static lg:inset-auto',
          sidebarOpen ? 'left-0' : '-left-72'
        )}
      >
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r bg-card px-6 pb-4">
          <div className="flex h-16 shrink-0 items-center gap-3">
            <img src="/assets/logo.svg" alt="TrafegoDNS Logo" className="h-12 w-12" />
            <img src="/assets/trafegodns-header.svg" alt="TrafegoDNS" className="h-8" />
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {filteredNavigation.map((item) => {
                    const isActive = location.pathname === item.href
                    return (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          className={cn(
                            'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold nav-link',
                            isActive && 'active'
                          )}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <item.icon className="h-5 w-5 shrink-0" />
                          {item.name}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b bg-background px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1" />
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    {user?.username || 'User'}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}