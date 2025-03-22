// src/contexts/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import api from '../services/apiService';

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

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Track auth state changes
  useEffect(() => {
    logAuthEvent('auth_state_change', { 
      currentUser: currentUser ? currentUser.username : null,
      isLoading
    });
  }, [currentUser, isLoading]);

  // Check token and get user profile
  useEffect(() => {
    const validateToken = async () => {
      logAuthEvent('token_validation_start', {});
      
      const token = localStorage.getItem('token');
      
      if (!token) {
        logAuthEvent('token_not_found', {});
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }
      
      try {
        // Check token expiration
        const decodedToken = jwtDecode(token);
        logAuthEvent('token_decoded', { 
          exp: decodedToken.exp,
          username: decodedToken.username,
          role: decodedToken.role
        });
        
        const currentTime = Date.now() / 1000;
        
        if (decodedToken.exp < currentTime) {
          // Token expired
          logAuthEvent('token_expired', { 
            exp: decodedToken.exp, 
            now: currentTime 
          });
          localStorage.removeItem('token');
          setCurrentUser(null);
          setIsLoading(false);
          return;
        }
        
        // Token is valid, fetch user profile
        logAuthEvent('profile_fetch_start', {
          token_length: token.length
        });
        
        try {
          const response = await api.get('/auth/profile');
          logAuthEvent('profile_fetch_success', { 
            user: response.data.user.username,
            role: response.data.user.role
          });
          
          setCurrentUser(response.data.user);
        } catch (error) {
          logAuthEvent('profile_fetch_error', { 
            message: error.message, 
            status: error.response?.status 
          });
          
          // Only clear token if error is auth-related
          if (error.response && error.response.status === 401) {
            localStorage.removeItem('token');
            setCurrentUser(null);
          }
        }
      } catch (error) {
        logAuthEvent('token_validation_error', { 
          message: error.message 
        });
        
        // Clear token on validation error
        localStorage.removeItem('token');
        setCurrentUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    validateToken();
  }, []);

  const login = async (username, password) => {
    logAuthEvent('login_attempt', { username });
    
    try {
      setIsLoading(true);
      
      // Use direct axios to avoid any interceptor issues
      const response = await api.post('/auth/login', { 
        username, 
        password 
      });
      
      logAuthEvent('login_success', { 
        username: response.data.user.username,
        token_length: response.data.token.length
      });
      
      // Store token in localStorage
      localStorage.setItem('token', response.data.token);
      
      // Update current user
      setCurrentUser(response.data.user);
      
      toast.success('Login successful');
      return true;
    } catch (error) {
      logAuthEvent('login_error', { 
        message: error.message,
        status: error.response?.status
      });
      
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
    logAuthEvent('logout', {});
    
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