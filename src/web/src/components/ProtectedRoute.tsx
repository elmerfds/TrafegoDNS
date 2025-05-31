import { Navigate, useLocation } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'
import { ReactNode } from 'react'

interface ProtectedRouteProps {
  children: ReactNode
  path: string
}

export function ProtectedRoute({ children, path }: ProtectedRouteProps) {
  const { canAccessPage } = usePermissions()
  const location = useLocation()
  
  if (!canAccessPage(path)) {
    // Redirect to dashboard if user doesn't have permission
    return <Navigate to="/" state={{ from: location }} replace />
  }
  
  return <>{children}</>
}