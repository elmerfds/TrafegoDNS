import React from 'react';
import { Navbar, Nav, Button } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSync,
  faCheckCircle
} from '@fortawesome/free-solid-svg-icons';
import dnsService from '../../services/dnsService';
import statusService from '../../services/statusService';
import { toast } from 'react-toastify';

const Topbar = ({ user }) => {
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
      <Navbar.Brand className="me-auto">
        {/* Company/App name or welcome message */}
        <span>Welcome, {user ? user.username : 'User'}</span>
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
      </Nav>
    </Navbar>
  );
};

export default Topbar;