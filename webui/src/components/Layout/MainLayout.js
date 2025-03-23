// src/components/Layout/MainLayout.js
import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Container, Row, Col } from 'react-bootstrap';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import LoadingScreen from './LoadingScreen';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';

const MainLayout = () => {
  // Set initial state to true for collapsed sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const { currentUser, isLoading: authLoading } = useAuth();
  const { isLoading: settingsLoading } = useSettings();

  // Force sidebar collapsed on component mount
  useEffect(() => {
    setSidebarCollapsed(true);
    console.log("Sidebar state initialized:", sidebarCollapsed ? "Collapsed" : "Expanded");
  }, []);

  // Add logging when sidebar state changes
  useEffect(() => {
    console.log("Sidebar state changed:", sidebarCollapsed ? "Collapsed" : "Expanded");
  }, [sidebarCollapsed]);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  if (authLoading || settingsLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="d-flex min-vh-100 bg-body">
      <Sidebar collapsed={sidebarCollapsed} />
      
      <div className="flex-grow-1 d-flex flex-column overflow-hidden">
        <Topbar 
          toggleSidebar={toggleSidebar} 
          sidebarCollapsed={sidebarCollapsed}
          user={currentUser}
        />
        
        <main className="flex-grow-1 overflow-auto p-4">
          <Container fluid>
            <Outlet />
          </Container>
        </main>
        
        <footer className="py-3 px-4 border-top text-center text-muted">
          <small>&copy; {new Date().getFullYear()} TráfegoDNS</small>
        </footer>
      </div>
    </div>
  );
};

export default MainLayout;