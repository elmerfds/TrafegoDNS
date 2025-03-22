// src/contexts/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';

// Create a context
const AuthContext = createContext();

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Check if token is valid on initial load
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }
      
      try {
        // Verify token expiration
        const decodedToken = jwtDecode(token);
        const currentTime = Date.now() / 1000;
        
        if (decodedToken.exp < currentTime) {
          // Token has expired
          localStorage.removeItem('token');
          setCurrentUser(null);
          setIsLoading(false);
          return;
        }
        
        // Make an API request to validate the token and get user data
        const response = await axios.get('/api/auth/profile', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setCurrentUser(response.data.user);
      } catch (error) {
        console.error('Auth validation error:', error);
        localStorage.removeItem('token');
        setCurrentUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username, password) => {
    try {
      setIsLoading(true);
      
      const response = await axios.post('/api/auth/login', {
        username,
        password
      });
      
      if (response.data && response.data.token) {
        localStorage.setItem('token', response.data.token);
        setCurrentUser(response.data.user);
        toast.success('Login successful');
        return true;
      } else {
        toast.error('Invalid response from server');
        return false;
      }
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