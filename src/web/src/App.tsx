import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { DNSRecordsPage } from '@/pages/DNSRecords'
import { ContainersPage } from '@/pages/Containers'
import { HostnamesPage } from '@/pages/Hostnames'
import { SettingsPage } from '@/pages/Settings'
import { UsersPage } from '@/pages/Users'
import { ProfilePage } from '@/pages/Profile'
import { OrphanedRecordsPage } from '@/pages/OrphanedRecords'
import { LogsPage } from '@/pages/Logs'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'
import { ProtectedRoute } from '@/components/ProtectedRoute'

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <ThemeProvider defaultTheme="system" storageKey="trafegodns-theme">
      <Router>
        <Routes>
          <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />} />
          <Route
            path="/"
            element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}
          >
            <Route index element={<DashboardPage />} />
            <Route path="dns-records" element={<DNSRecordsPage />} />
            <Route path="containers" element={<ContainersPage />} />
            <Route path="hostnames" element={<HostnamesPage />} />
            <Route path="settings" element={
              <ProtectedRoute path="/settings">
                <SettingsPage />
              </ProtectedRoute>
            } />
            <Route path="users" element={
              <ProtectedRoute path="/users">
                <UsersPage />
              </ProtectedRoute>
            } />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="orphaned-records" element={<OrphanedRecordsPage />} />
            <Route path="logs" element={<LogsPage />} />
          </Route>
        </Routes>
      </Router>
      <Toaster />
    </ThemeProvider>
  )
}

export default App