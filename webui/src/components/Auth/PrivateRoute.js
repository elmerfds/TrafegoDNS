// webui/src/components/Auth/PrivateRoute.js
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingScreen from '../Layout/LoadingScreen';

const PrivateRoute = ({ children }) => {
  const { currentUser, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Only show loading during initial auth check
  if (isLoading) {
    return <LoadingScreen />;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // User is authenticated - all users have full access in simplified version
  return children;
};

export default PrivateRoute;