// src/components/Layout/Sidebar.js
import React from 'react';
import { NavLink } from 'react-router-dom';
import { Nav } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faGaugeHigh, 
  faNetworkWired, 
  faGlobe, 
  faGear, 
  faUsers,
  faServer
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar = ({ collapsed }) => {
  const { hasRole } = useAuth();
  
  // Use smaller width to reduce gap between sidebar and content
  const sidebarWidth = collapsed ? '60px' : '220px';
  
  return (
    <div 
      className="sidebar bg-dark text-white" 
      style={{ 
        width: sidebarWidth,
        transition: 'width 0.3s ease'
      }}
    >
      <div className="d-flex align-items-center justify-content-center py-3">
        <img
          src="/logo240.png"
          width="32"
          height="32"
          alt="TráfegoDNS Logo"
          className="me-2"
          style={{ display: collapsed ? 'none' : 'block' }}
        />
        <h5 className="mb-0" style={{ display: collapsed ? 'none' : 'block' }}>
          TráfegoDNS
        </h5>
        {collapsed && (
          <img
            src="/logo240.png"
            width="32"
            height="32"
            alt="TráfegoDNS Logo"
            className="mx-auto"
          />
        )}
      </div>
      
      <Nav className="flex-column">
        <NavLink to="/dashboard" className="sidebar-link py-2">
          <FontAwesomeIcon icon={faGaugeHigh} className="sidebar-icon" />
          {!collapsed && <span>Dashboard</span>}
        </NavLink>
        
        <NavLink to="/records" className="sidebar-link py-2">
          <FontAwesomeIcon icon={faNetworkWired} className="sidebar-icon" />
          {!collapsed && <span>DNS Records</span>}
        </NavLink>
        
        <NavLink to="/providers" className="sidebar-link py-2">
          <FontAwesomeIcon icon={faGlobe} className="sidebar-icon" />
          {!collapsed && <span>DNS Providers</span>}
        </NavLink>
        
        <NavLink to="/status" className="sidebar-link py-2">
          <FontAwesomeIcon icon={faServer} className="sidebar-icon" />
          {!collapsed && <span>System Status</span>}
        </NavLink>
        
        <NavLink to="/settings" className="sidebar-link py-2">
          <FontAwesomeIcon icon={faGear} className="sidebar-icon" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        
        {hasRole('admin') && (
          <NavLink to="/users" className="sidebar-link py-2">
            <FontAwesomeIcon icon={faUsers} className="sidebar-icon" />
            {!collapsed && <span>Users</span>}
          </NavLink>
        )}
      </Nav>
    </div>
  );
};

export default Sidebar;