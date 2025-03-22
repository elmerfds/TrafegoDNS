// src/components/DNSRecords/RecordTypeBadge.js
import React from 'react';
import { Badge } from 'react-bootstrap';

/**
 * Component for displaying DNS record types with appropriate color coding
 * 
 * @param {Object} props - Component props
 * @param {string} props.type - DNS record type (e.g., 'A', 'CNAME', 'MX')
 * @param {string} props.className - Optional additional CSS classes
 */
const RecordTypeBadge = ({ type, className = '' }) => {
  // Define colors for different record types
  const getVariant = () => {
    switch (type?.toUpperCase()) {
      case 'A':
        return 'primary';
      case 'AAAA':
        return 'info';
      case 'CNAME':
        return 'success';
      case 'MX':
        return 'warning';
      case 'TXT':
        return 'secondary';
      case 'SRV':
        return 'danger';
      case 'NS':
        return 'dark';
      case 'CAA':
        return 'light';
      default:
        return 'primary';
    }
  };

  return (
    <Badge 
      bg={getVariant()} 
      className={className}
    >
      {type?.toUpperCase()}
    </Badge>
  );
};

export default RecordTypeBadge;