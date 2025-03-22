// src/components/Auth/PrivateRoute.js
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingScreen from '../Layout/LoadingScreen';

const PrivateRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  
  useEffect(() => {
    // Check for token
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  // Still checking if we're authenticated
  if (isAuthenticated === null) {
    return <LoadingScreen />;
  }

  // Not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  // Authenticated, render children
  return children;
};

export default PrivateRoute;