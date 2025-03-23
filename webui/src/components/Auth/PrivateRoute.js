// webui/src/components/Auth/PrivateRoute.js
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingScreen from '../Layout/LoadingScreen';

const PrivateRoute = ({ children, requiredRole = 'user' }) => {
  const { currentUser, isLoading, isAuthenticated, hasRole } = useAuth();
  const location = useLocation();

  // Show loading during initial auth check
  if (isLoading) {
    return <LoadingScreen />;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  
  // Check if user has the required role
  if (requiredRole && !hasRole(requiredRole)) {
    // User is authenticated but doesn't have required role
    return <Navigate to="/dashboard" replace />;
  }

  // User is authenticated and has required role
  return children;
};

export default PrivateRoute;