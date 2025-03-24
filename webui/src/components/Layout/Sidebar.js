import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Nav } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faGaugeHigh, 
  faNetworkWired, 
  faGlobe, 
  faGear, 
  faServer,
  faSignOutAlt,
  faBars
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar = ({ collapsed, toggleSidebar }) => {
  const sidebarWidth = collapsed ? '65px' : '250px';
  const { logout } = useAuth();
  const navigate = useNavigate();
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  return (
    <div 
      className="sidebar bg-dark text-white d-flex flex-column" 
      style={{ 
        width: sidebarWidth,
        transition: 'width 0.3s ease',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 1030
      }}
    >
      {/* Toggle Button */}
      <div className={`d-flex py-3 ${collapsed ? 'justify-content-center' : 'ps-3'}`}>
        <div
          className="text-light p-1 cursor-pointer"
          onClick={toggleSidebar}
          style={{ cursor: 'pointer' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <FontAwesomeIcon icon={faBars} />
        </div>
      </div>
      
      {/* Main navigation items */}
      <Nav className="flex-column mt-3 flex-grow-1">
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
      
      {/* Fixed logout button at bottom */}
      <div className="mt-auto mb-3">
        <div 
          className="sidebar-link cursor-pointer"
          onClick={handleLogout}
          style={{ cursor: 'pointer' }}
        >
          <FontAwesomeIcon icon={faSignOutAlt} className="sidebar-icon" />
          {!collapsed && <span>Logout</span>}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;