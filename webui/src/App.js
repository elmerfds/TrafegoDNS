// src/App.js
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Container } from 'react-bootstrap';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import LoginPage from './components/Auth/LoginPage';
import PrivateRoute from './components/Auth/PrivateRoute';
import MainLayout from './components/Layout/MainLayout';
import Dashboard from './components/Dashboard/Dashboard';
import RecordsPage from './components/DNSRecords/RecordsPage';
import ProvidersPage from './components/Providers/ProvidersPage';
import SettingsPage from './components/Settings/SettingsPage';
import UsersPage from './components/Settings/UsersPage';
import StatusPage from './components/Dashboard/StatusPage';
import LoadingScreen from './components/Layout/LoadingScreen';

const App = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate initial load time
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AuthProvider>
        <SettingsProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            
            <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/records" element={<RecordsPage />} />
              <Route path="/providers" element={<ProvidersPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/status" element={<StatusPage />} />
            </Route>
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SettingsProvider>
      </AuthProvider>
      
      <ToastContainer 
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </>
  );
};

export default App;