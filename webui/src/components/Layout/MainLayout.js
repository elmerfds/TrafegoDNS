// src/components/Layout/MainLayout.js
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Container } from 'react-bootstrap';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import StatusBar from './StatusBar';
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
      
      <div 
        className="flex-grow-1 d-flex flex-column overflow-hidden" 
        style={{ 
          marginLeft: sidebarCollapsed ? '65px' : '250px',
          transition: 'margin-left 0.3s ease'
        }}
      >
        <Topbar user={currentUser} />
        
        {/* Status bar showing operation mode and provider */}
        <StatusBar 
          mode={operationMode?.current} 
          provider={providers?.current} 
        />
        
        <main className="flex-grow-1 overflow-auto p-3">
          <Container fluid className="px-2">
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