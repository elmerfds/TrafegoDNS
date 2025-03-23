// src/contexts/AuthContext.js
import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import authService from '../services/authService';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  // Get token from localStorage immediately
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const authCheckComplete = useRef(false);
  const navigate = useNavigate();

  // Add this console.log to see what's happening
  console.log("AuthContext state:", { 
    hasToken: !!token, 
    isAuthenticated, 
    authCheckComplete: authCheckComplete.current, 
    isLoading 
  });

  // Check token on mount only
  useEffect(() => {
    const verifyToken = async () => {
      const storedToken = localStorage.getItem('token');
      console.log('Initializing auth context with token:', !!storedToken);
      
      if (storedToken) {
        setToken(storedToken);
        try {
          // Verify token
          const response = await authService.getProfile();
          setCurrentUser(response.data.user);
          setIsAuthenticated(true);
        } catch (error) {
          console.error('Error verifying token:', error);
          localStorage.removeItem('token');
          setToken(null);
          setCurrentUser(null);
          setIsAuthenticated(false);
        }
      }
      setIsLoading(false);
    };
    
    verifyToken();
  }, []);

  const login = async (username, password) => {
    try {
      setIsLoading(true);
      
      console.log("Attempting login for user:", username);
      const response = await authService.login(username, password);
      const { token: newToken, user } = response.data;
      
      console.log("Login successful, storing token and user data");
      
      // Store token and user
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setCurrentUser(user);
      setIsAuthenticated(true);
      
      toast.success('Login successful');
      
      // Navigate only if we're not already on the dashboard
      if (window.location.pathname !== '/dashboard') {
        console.log("Navigating to dashboard");
        navigate('/dashboard', { replace: true });
      }
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      let errorMessage = 'Login failed. Please check your credentials.';
      
      if (error.response) {
        if (error.response.status === 401) {
          errorMessage = 'Invalid username or password';
        } else if (error.response.data && error.response.data.message) {
          errorMessage = error.response.data.message;
        }
      }
      
      toast.error(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    console.log("Logging out user");
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    setIsAuthenticated(false);
    
    // Only navigate if we're not already on the login page
    if (window.location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
  };

  const hasRole = (requiredRole) => {
    if (!currentUser) return false;
    
    // Role hierarchy: super_admin > admin > user
    // Make sure to consider both 'admin' and 'super_admin' as valid admin roles
    switch (requiredRole) {
      case 'user':
        return ['user', 'admin', 'super_admin'].includes(currentUser.role);
      case 'admin':
        return ['admin', 'super_admin'].includes(currentUser.role);
      case 'super_admin':
        return currentUser.role === 'super_admin';
      default:
        return false;
    }
  };

  const value = {
    currentUser,
    token,
    isLoading,
    isAuthenticated,
    login,
    logout,
    hasRole
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};