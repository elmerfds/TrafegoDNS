// webui/src/contexts/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  // Check token on initial load
  useEffect(() => {
    const verifyToken = async () => {
      const storedToken = localStorage.getItem('token');
      
      if (storedToken) {
        setToken(storedToken);
        try {
          // Check if token is expired
          try {
            const decoded = jwtDecode(storedToken);
            const currentTime = Date.now() / 1000;
            
            if (decoded.exp && decoded.exp < currentTime) {
              console.log('Token has expired');
              localStorage.removeItem('token');
              setToken(null);
              setCurrentUser(null);
              setIsAuthenticated(false);
              setIsLoading(false);
              return;
            }
          } catch (e) {
            console.error('Error decoding token:', e);
          }
          
          // Verify token with backend
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
      
      const response = await authService.login(username, password);
      const { token: newToken, user } = response.data;
      
      // Store token and user
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setCurrentUser(user);
      setIsAuthenticated(true);
      
      toast.success('Login successful');
      navigate('/dashboard', { replace: true });
      
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
    setIsAuthenticated(false);
    navigate('/login', { replace: true });
  };

  // Simplified hasRole - always returns true since every user is admin
  const hasRole = (requiredRole) => {
    return true;
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