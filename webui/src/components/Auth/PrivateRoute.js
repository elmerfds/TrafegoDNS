// src/components/Auth/PrivateRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingScreen from '../Layout/LoadingScreen';

const PrivateRoute = ({ children }) => {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  return children;
};

export default PrivateRoute;