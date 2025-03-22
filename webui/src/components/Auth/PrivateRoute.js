import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingScreen from '../Layout/LoadingScreen';

const PrivateRoute = ({ children, requiredRole = 'user' }) => {
  const { currentUser, isLoading, hasRole } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  // Check if user has the required role
  if (requiredRole && !hasRole(requiredRole)) {
    // User is authenticated but doesn't have the required role
    return <Navigate to="/dashboard" />;
  }

  return children;
};

export default PrivateRoute;