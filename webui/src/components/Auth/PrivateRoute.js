// webui/src/components/Auth/PrivateRoute.js
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingScreen from '../Layout/LoadingScreen';

const PrivateRoute = ({ children, requiredRole = 'user' }) => {
  const { currentUser, isLoading, isAuthenticated, hasRole } = useAuth();
  const location = useLocation();

  console.log("PrivateRoute check:", { 
    path: location.pathname,
    user: currentUser?.username,
    role: currentUser?.role,
    requiredRole,
    hasRequiredRole: hasRole(requiredRole)
  });

  // Only show loading during initial auth check
  if (isLoading) {
    return <LoadingScreen />;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  
  // Check if user has the required role
  if (requiredRole && !hasRole(requiredRole)) {
    // Redirect to dashboard with error message in state
    return <Navigate to="/dashboard" replace state={{ 
      error: `Access denied: You need ${requiredRole} permissions to access this page` 
    }} />;
  }

  // User is authenticated and has required role
  return children;
};

export default PrivateRoute;