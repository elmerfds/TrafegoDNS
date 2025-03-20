// src/webui/layouts/main-layout/Sidebar.jsx
import React from 'react';
import { Nav } from 'react-bootstrap';
import { NavLink } from 'react-router-dom';
import { 
  FaTachometerAlt, 
  FaDatabase, 
  FaShieldAlt, 
  FaServer, 
  FaHistory, 
  FaCog 
} from 'react-icons/fa';

import './Sidebar.scss';

const Sidebar = ({ open, appStatus, toggleSidebar }) => {
  // Create a safe toggle function that checks if toggleSidebar is available
  const handleToggle = () => {
    if (open && window.innerWidth < 992 && typeof toggleSidebar === 'function') {
      toggleSidebar();
    }
  };

  return (
    <>
      {/* Overlay for mobile to close sidebar */}
      <div 
        className={`sidebar-overlay ${open ? 'active' : ''}`} 
        onClick={handleToggle}
      />
      
      <div className={`sidebar bg-dark-blue py-3 ${open ? '' : 'collapsed'}`}>
        <Nav className="flex-column">
          <NavLink to="/" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <div className="d-flex align-items-center">
              <FaTachometerAlt className="me-2" />
              <span>Dashboard</span>
            </div>
          </NavLink>
          
          <NavLink to="/records" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <div className="d-flex align-items-center">
              <FaDatabase className="me-2" />
              <span>DNS Records</span>
            </div>
          </NavLink>
          
          <NavLink to="/preserved-hostnames" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <div className="d-flex align-items-center">
              <FaShieldAlt className="me-2" />
              <span>Preserved Hostnames</span>
            </div>
          </NavLink>
          
          <NavLink to="/managed-hostnames" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <div className="d-flex align-items-center">
              <FaServer className="me-2" />
              <span>Managed Hostnames</span>
            </div>
          </NavLink>
          
          <NavLink to="/activity" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <div className="d-flex align-items-center">
              <FaHistory className="me-2" />
              <span>Activity Log</span>
            </div>
          </NavLink>
          
          <NavLink to="/settings" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <div className="d-flex align-items-center">
              <FaCog className="me-2" />
              <span>Settings</span>
            </div>
          </NavLink>
        </Nav>
        
        {appStatus && (
          <div className="sidebar-footer text-light mt-auto">
            <div className="px-3 py-3 border-top border-secondary mt-3">
              <div className="small mb-2 text-muted">DNS Provider</div>
              <div className="fw-medium mb-3">{appStatus.provider}</div>
              
              <div className="small mb-2 text-muted">Mode</div>
              <div className="fw-medium">{appStatus.operationMode}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Sidebar;