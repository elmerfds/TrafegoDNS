import React from 'react';
import { NavLink } from 'react-router-dom';
import { Nav } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faGaugeHigh, 
  faNetworkWired, 
  faGlobe, 
  faGear, 
  faServer
} from '@fortawesome/free-solid-svg-icons';

const Sidebar = ({ collapsed }) => {
  const sidebarWidth = collapsed ? '65px' : '250px';
  
  return (
    <div 
      className="sidebar bg-dark text-white" 
      style={{ 
        width: sidebarWidth,
        transition: 'width 0.3s ease'
      }}
    >
      <div className="d-flex align-items-center justify-content-center py-4">
        <img
          src="/logo240.png"
          width="40"
          height="40"
          alt="TráfegoDNS Logo"
          className="me-2"
          style={{ display: collapsed ? 'none' : 'block' }}
        />
        <h4 className="mb-0" style={{ display: collapsed ? 'none' : 'block' }}>
          TráfegoDNS
        </h4>
        {collapsed && (
          <img
            src="/logo240.png"
            width="40"
            height="40"
            alt="TráfegoDNS Logo"
            className="mx-auto"
          />
        )}
      </div>
      
      <Nav className="flex-column mt-2">
        <NavLink to="/dashboard" className="sidebar-link">
          <FontAwesomeIcon icon={faGaugeHigh} className="sidebar-icon" />
          {!collapsed && <span>Dashboard</span>}
        </NavLink>
        
        <NavLink to="/records" className="sidebar-link">
          <FontAwesomeIcon icon={faNetworkWired} className="sidebar-icon" />
          {!collapsed && <span>DNS Records</span>}
        </NavLink>
        
        <NavLink to="/providers" className="sidebar-link">
          <FontAwesomeIcon icon={faGlobe} className="sidebar-icon" />
          {!collapsed && <span>DNS Providers</span>}
        </NavLink>
        
        <NavLink to="/status" className="sidebar-link">
          <FontAwesomeIcon icon={faServer} className="sidebar-icon" />
          {!collapsed && <span>System Status</span>}
        </NavLink>
        
        <NavLink to="/settings" className="sidebar-link">
          <FontAwesomeIcon icon={faGear} className="sidebar-icon" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
      </Nav>
    </div>
  );
};

export default Sidebar;