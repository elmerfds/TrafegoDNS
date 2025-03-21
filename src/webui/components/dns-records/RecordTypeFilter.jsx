// src/webui/components/dns-records/RecordTypeFilter.jsx
import React from 'react';
import { ButtonGroup, Button, Badge } from 'react-bootstrap';
import PropTypes from 'prop-types';

const RecordTypeFilter = ({ selectedType, onTypeChange, recordTypeCounts }) => {
  const recordTypes = [
    { id: 'all', label: 'All' },
    { id: 'A', label: 'A' },
    { id: 'AAAA', label: 'AAAA' },
    { id: 'CNAME', label: 'CNAME' },
    { id: 'MX', label: 'MX' },
    { id: 'TXT', label: 'TXT' }
  ];

  return (
    <ButtonGroup>
      {recordTypes.map((type) => (
        <Button
          key={type.id}
          variant={selectedType === type.id ? 'primary' : 'dark'}
          onClick={() => onTypeChange(type.id)}
          className="d-flex align-items-center"
        >
          {type.label}
          {recordTypeCounts[type.id] > 0 && (
            <Badge 
              bg={selectedType === type.id ? 'dark' : 'primary'} 
              className="ms-2"
            >
              {recordTypeCounts[type.id]}
            </Badge>
          )}
        </Button>
      ))}
    </ButtonGroup>
  );
};

RecordTypeFilter.propTypes = {
  selectedType: PropTypes.string.isRequired,
  onTypeChange: PropTypes.func.isRequired,
  recordTypeCounts: PropTypes.object.isRequired
};

export default RecordTypeFilter;
