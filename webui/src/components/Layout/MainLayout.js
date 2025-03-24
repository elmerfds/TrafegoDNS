// src/components/Layout/MainLayout.js
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Container } from 'react-bootstrap';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import LoadingScreen from './LoadingScreen';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';

const MainLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const { currentUser, isLoading: authLoading } = useAuth();
  const { isLoading: settingsLoading, providers, operationMode } = useSettings();

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  if (authLoading || settingsLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="d-flex min-vh-100 bg-body">
      <Sidebar 
        collapsed={sidebarCollapsed} 
        toggleSidebar={toggleSidebar} 
      />
      
      <div className="flex-grow-1 d-flex flex-column overflow-hidden">
        <Topbar user={currentUser} />
        
        <main className="flex-grow-1 overflow-auto p-3">
          <Container fluid className="px-2">
            {/* Mode and Provider status info */}
            <div className="status-section bg-white rounded mb-3 p-2 d-flex">
              {operationMode && operationMode.current && (
                <div className="mode-badge me-3">
                  <span className="badge-label text-uppercase py-1 px-3 rounded bg-info text-white">
                    {operationMode.current} MODE
                  </span>
                </div>
              )}
              
              {providers && providers.current && (
                <div className="provider-badge">
                  <span className="badge-label text-uppercase py-1 px-3 rounded bg-primary text-white">
                    {providers.current}
                  </span>
                </div>
              )}
            </div>
            
            {/* Main content */}
            <Outlet />
          </Container>
        </main>
        
        <footer className="py-2 px-4 border-top text-center text-muted">
          <small>&copy; {new Date().getFullYear()} TráfegoDNS</small>
        </footer>
      </div>
    </div>
  );
};

export default MainLayout;