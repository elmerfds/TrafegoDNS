// src/webui/layouts/main-layout/MainLayout.jsx
import React, { useState } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { Routes, Route } from 'react-router-dom';

// Layout components
import Sidebar from './Sidebar';
import TopBar from './TopBar';

// Page components (will be lazy loaded in a real app)
import Dashboard from '../../components/dashboard/Dashboard';
import DNSRecords from '../../components/dns-records/DNSRecords';
import PreservedHostnames from '../../components/preserved/PreservedHostnames';
import ManagedHostnames from '../../components/managed/ManagedHostnames';
import ActivityLog from '../../components/activity/ActivityLog';
import Settings from '../../components/settings/Settings';

// Styles
import './MainLayout.scss';

const MainLayout = ({ appStatus }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="main-layout">
      <TopBar 
        appStatus={appStatus} 
        toggleSidebar={toggleSidebar} 
        sidebarOpen={sidebarOpen} 
      />
      
      <Container fluid className="px-0 main-container">
        <Row className="g-0 h-100">
          <Sidebar open={sidebarOpen} appStatus={appStatus} />
          
          <Col className={`content-area ${sidebarOpen ? 'with-sidebar' : 'without-sidebar'}`}>
            <div className="content-wrapper p-4">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/records" element={<DNSRecords />} />
                <Route path="/preserved-hostnames" element={<PreservedHostnames />} />
                <Route path="/managed-hostnames" element={<ManagedHostnames />} />
                <Route path="/activity" element={<ActivityLog />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default MainLayout;
