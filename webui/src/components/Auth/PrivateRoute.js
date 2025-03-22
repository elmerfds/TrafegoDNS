// src/components/Auth/PrivateRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingScreen from '../Layout/LoadingScreen';

// Auth debugging function (defined in index.js)
const logAuthEvent = (event, data) => {
  try {
    let logs = JSON.parse(localStorage.getItem('auth_debug_logs') || '[]');
    logs.push({
      time: new Date().toISOString(),
      event,
      data,
      path: window.location.pathname
    });
    // Keep only the last 20 entries
    if (logs.length > 20) logs = logs.slice(-20);
    localStorage.setItem('auth_debug_logs', JSON.stringify(logs));
  } catch (e) {
    console.error('Error logging auth event:', e);
  }
};

const PrivateRoute = ({ children }) => {
  const { currentUser, isLoading } = useAuth();

  // Log private route check
  logAuthEvent('private_route_check', {
    currentUser: currentUser ? currentUser.username : null,
    isLoading,
    hasToken: !!localStorage.getItem('token'),
    path: window.location.pathname
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    logAuthEvent('private_route_unauthorized', {
      hasToken: !!localStorage.getItem('token') 
    });
    return <Navigate to="/login" />;
  }

  logAuthEvent('private_route_authorized', {
    user: currentUser.username,
    role: currentUser.role
  });
  return children;
};

export default PrivateRoute;