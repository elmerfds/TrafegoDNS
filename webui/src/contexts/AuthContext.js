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
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const isInitialMount = useRef(true);
  const navigate = useNavigate();

  // Check if token is valid on initial load or when token changes
  useEffect(() => {
    const verifyToken = async () => {
      if (token) {
        try {
          // Check token expiration
          const decodedToken = jwtDecode(token);
          const currentTime = Date.now() / 1000;
          
          if (decodedToken.exp < currentTime) {
            // Token has expired
            logout();
            return;
          }
          
          // Only fetch profile on initial mount
          if (isInitialMount.current) {
            // Get user profile
            const response = await authService.getProfile(token);
            setCurrentUser(response.data.user);
          }
        } catch (error) {
          console.error('Error verifying token:', error);
          logout();
        }
      }
      
      // Mark loading as complete
      setIsLoading(false);
    };

    // Track if this is the initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      verifyToken();
    } else {
      // For subsequent token changes, don't show loading screen
      if (token) {
        verifyToken();
      } else {
        setIsLoading(false);
      }
    }
  }, [token]);

  const login = async (username, password) => {
    try {
      setIsLoading(true);
      const response = await authService.login(username, password);
      const { token, user } = response.data;
      
      // Store token and user
      localStorage.setItem('token', token);
      setToken(token);
      setCurrentUser(user);
      
      toast.success('Login successful');
      navigate('/dashboard', { replace: true }); // Use replace to avoid double redirects
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
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    navigate('/login', { replace: true }); // Use replace to avoid double redirects
  };

  const hasRole = (requiredRole) => {
    if (!currentUser) return false;
    
    // Role hierarchy: super_admin > admin > user
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