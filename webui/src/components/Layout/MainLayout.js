// src/components/Layout/MainLayout.js
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Container, Card, Badge } from 'react-bootstrap';
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
            <Card className="mb-3 border-0 bg-light">
              <Card.Body className="py-2">
                <div className="d-flex align-items-center">
                  <div className="me-3">
                    <span className="text-muted me-2">Operation Mode:</span>
                    {operationMode && operationMode.current && (
                      <Badge bg="info" className="text-uppercase">
                        {operationMode.current} Mode
                      </Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-muted me-2">Provider:</span>
                    {providers && providers.current && (
                      <Badge bg="primary" className="text-uppercase">
                        {providers.current}
                      </Badge>
                    )}
                  </div>
                </div>
              </Card.Body>
            </Card>
            
            {/* Main content */}
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