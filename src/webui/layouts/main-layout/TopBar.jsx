// src/webui/layouts/main-layout/TopBar.jsx
import React from 'react';
import { Navbar, Container, Nav, Badge } from 'react-bootstrap';
import { FaBars, FaCircle } from 'react-icons/fa';

const TopBar = ({ appStatus, toggleSidebar, sidebarOpen }) => {
  return (
    <Navbar bg="dark" variant="dark" expand="lg" className="shadow-sm">
      <Container fluid>
        <div className="d-flex align-items-center">
          <button 
            className="btn btn-link text-light me-3 d-flex align-items-center"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
          >
            <FaBars />
          </button>
          <Navbar.Brand href="/" className="d-flex align-items-baseline">
            TráfegoDNS
            {appStatus?.version && (
              <small className="ms-2 text-muted">v{appStatus.version}</small>
            )}
          </Navbar.Brand>
        </div>
        
        <Nav className="ms-auto">
          {appStatus?.status && (
            <Badge 
              pill 
              bg={appStatus.status === 'running' ? 'success' : 'danger'}
              className="d-flex align-items-center px-3 py-2"
            >
              <FaCircle size={8} className="me-2" />
              {appStatus.status}
            </Badge>
          )}
        </Nav>
      </Container>
    </Navbar>
  );
};

export default TopBar;
