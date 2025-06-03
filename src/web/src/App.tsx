import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/Login'
import { AuthCallbackPage } from '@/pages/AuthCallback'
import { CustomizableDashboard } from '@/pages/CustomizableDashboard'
import { DNSRecordsPage } from '@/pages/DNSRecords'
import { ContainersPage } from '@/pages/Containers'
import { HostnamesPage } from '@/pages/Hostnames'
import { SettingsPage } from '@/pages/Settings'
import { UsersPage } from '@/pages/Users'
import { ProfilePage } from '@/pages/Profile'
import { OrphanedRecordsPage } from '@/pages/OrphanedRecords'
import { LogsPage } from '@/pages/Logs'
import PortManagement from '@/pages/PortManagement'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'
import { ColorThemeProvider } from '@/contexts/ThemeContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <ThemeProvider defaultTheme="dark" storageKey="trafegodns-ui-theme">
      <ColorThemeProvider>
        <Router>
        <Routes>
          <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/"
            element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}
          >
            <Route index element={<CustomizableDashboard />} />
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
            <Route path="port-management" element={<PortManagement />} />
          </Route>
        </Routes>
        </Router>
        <Toaster />
      </ColorThemeProvider>
    </ThemeProvider>
  )
}

export default App