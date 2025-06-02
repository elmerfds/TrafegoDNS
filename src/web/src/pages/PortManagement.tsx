import React from 'react';
import PortMonitoring from '../components/PortMonitoring';

export default function PortManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Port Management</h1>
        <p className="text-muted-foreground">
          Monitor port availability, manage reservations, and prevent conflicts in your container deployments.
        </p>
      </div>
      
      <PortMonitoring />
    </div>
  );
}