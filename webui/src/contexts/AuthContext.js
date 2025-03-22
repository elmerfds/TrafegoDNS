// src/contexts/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import api from '../services/apiService';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Check token and get user profile
  useEffect(() => {
    const validateToken = async () => {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }
      
      try {
        // Check token expiration
        const decodedToken = jwtDecode(token);
        const currentTime = Date.now() / 1000;
        
        if (decodedToken.exp < currentTime) {
          // Token expired
          console.log('Token expired');
          localStorage.removeItem('token');
          setCurrentUser(null);
          setIsLoading(false);
          return;
        }
        
        // Token is valid, fetch user profile
        console.log('Fetching user profile with token');
        const response = await api.get('/auth/profile');
        console.log('Profile response:', response.data);
        
        setCurrentUser(response.data.user);
      } catch (error) {
        console.error('Auth validation error:', error);
        // Clear token on auth error
        localStorage.removeItem('token');
        setCurrentUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    validateToken();
  }, []);

  const login = async (username, password) => {
    try {
      setIsLoading(true);
      const response = await api.post('/auth/login', { username, password });
      
      const { token, user } = response.data;
      
      // Store token and user
      localStorage.setItem('token', token);
      setCurrentUser(user);
      
      toast.success('Login successful');
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
    setCurrentUser(null);
    navigate('/login');
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