import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/lib/stores/authStore'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { DNSRecordsPage } from '@/pages/DNSRecords'
import { ContainersPage } from '@/pages/Containers'
import { HostnamesPage } from '@/pages/Hostnames'
import { SettingsPage } from '@/pages/Settings'
import { UsersPage } from '@/pages/Users'
import { Toaster } from '@/components/ui/toaster'

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <>
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
            <Route path="settings" element={<SettingsPage />} />
            <Route path="users" element={<UsersPage />} />
          </Route>
        </Routes>
      </Router>
      <Toaster />
    </>
  )
}

export default App