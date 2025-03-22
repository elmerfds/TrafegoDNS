import React from 'react';
import { Navbar, Nav, Button, Dropdown } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBars, 
  faUser, 
  faSignOutAlt,
  faCheckCircle,
  faSync
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import dnsService from '../../services/dnsService';
import statusService from '../../services/statusService';
import { toast } from 'react-toastify';

const Topbar = ({ toggleSidebar, sidebarCollapsed, user }) => {
  const { logout } = useAuth();
  const { providers, operationMode } = useSettings();
  
  const handleLogout = () => {
    logout();
  };
  
  const handleManualPoll = async () => {
    try {
      toast.info('Triggering manual DNS poll...');
      await dnsService.triggerPoll();
      toast.success('Manual DNS poll completed');
    } catch (error) {
      console.error('Error triggering manual poll:', error);
      toast.error('Failed to trigger manual poll');
    }
  };
  
  const handleRefreshIP = async () => {
    try {
      toast.info('Refreshing IP addresses...');
      await statusService.getPublicIPs();
      toast.success('IP addresses refreshed');
    } catch (error) {
      console.error('Error refreshing IPs:', error);
      toast.error('Failed to refresh IP addresses');
    }
  };

  return (
    <Navbar bg="dark" variant="dark" expand className="px-3 py-2 border-bottom">
      <Button 
        variant="link" 
        className="text-light me-3 p-1" 
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <FontAwesomeIcon icon={faBars} />
      </Button>
      
      <Navbar.Brand className="me-auto">
        {operationMode && operationMode.current && (
          <span className="badge bg-info me-2 text-uppercase">
            {operationMode.current} Mode
          </span>
        )}
        {providers && providers.current && (
          <span className="badge bg-primary text-uppercase">
            {providers.current}
          </span>
        )}
      </Navbar.Brand>
      
      <Nav>
        <Button 
          variant="outline-light" 
          size="sm" 
          className="me-2"
          onClick={handleManualPoll}
          title="Trigger Manual DNS Poll"
        >
          <FontAwesomeIcon icon={faSync} className="me-md-2" />
          <span className="d-none d-md-inline">Poll DNS</span>
        </Button>
        
        <Button 
          variant="outline-light" 
          size="sm" 
          className="me-3"
          onClick={handleRefreshIP}
          title="Refresh IP Address"
        >
          <FontAwesomeIcon icon={faCheckCircle} className="me-md-2" />
          <span className="d-none d-md-inline">Refresh IP</span>
        </Button>
        
        <Dropdown align="end">
          <Dropdown.Toggle as="a" className="text-light nav-link cursor-pointer">
            <FontAwesomeIcon icon={faUser} className="me-1" />
            <span className="d-none d-md-inline">{user ? user.username : 'User'}</span>
          </Dropdown.Toggle>
          
          <Dropdown.Menu>
            <Dropdown.Item onClick={handleLogout}>
              <FontAwesomeIcon icon={faSignOutAlt} className="me-2" />
              Logout
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </Nav>
    </Navbar>
  );
};

export default Topbar;