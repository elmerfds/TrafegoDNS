// src/webui/components/settings/LogLevelSelector.jsx
import React from 'react';
import { ButtonGroup, Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { FaInfo } from 'react-icons/fa';

const LogLevelSelector = ({ value, onChange, disabled }) => {
  const logLevels = [
    { value: 'ERROR', description: 'Only critical errors that break functionality', variant: 'danger' },
    { value: 'WARN', description: 'Important warnings that don\'t break functionality', variant: 'warning' },
    { value: 'INFO', description: 'Key operational information (default)', variant: 'info' },
    { value: 'DEBUG', description: 'Detailed information for troubleshooting', variant: 'success' },
    { value: 'TRACE', description: 'Extremely detailed information for deep troubleshooting', variant: 'secondary' }
  ];

  return (
    <div>
      <ButtonGroup className="w-100 mb-2">
        {logLevels.map((level) => (
          <Button
            key={level.value}
            variant={value === level.value ? level.variant : 'outline-secondary'}
            disabled={disabled}
            onClick={() => onChange(level.value)}
          >
            {level.value}
          </Button>
        ))}
      </ButtonGroup>
      <div className="d-flex align-items-center mt-2">
        <FaInfo className="text-info me-2" size={14} />
        <small className="text-muted">
          {logLevels.find(level => level.value === value)?.description || 'Select a log level'}
        </small>
      </div>
    </div>
  );
};

export default LogLevelSelector;
