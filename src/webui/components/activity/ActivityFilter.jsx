// src/webui/components/activity/ActivityFilter.jsx
import React from 'react';
import { ButtonGroup, Button } from 'react-bootstrap';
import { FaPlus, FaPencilAlt, FaTrash, FaExclamationTriangle, FaInfo, FaBroom, FaList } from 'react-icons/fa';

const ActivityFilter = ({ selectedType, onTypeChange }) => {
  const activityTypes = [
    { id: 'all', label: 'All', icon: <FaList /> },
    { id: 'create', label: 'Create', icon: <FaPlus /> },
    { id: 'update', label: 'Update', icon: <FaPencilAlt /> },
    { id: 'delete', label: 'Delete', icon: <FaTrash /> },
    { id: 'error', label: 'Error', icon: <FaExclamationTriangle /> },
    { id: 'info', label: 'Info', icon: <FaInfo /> },
    { id: 'cleanup', label: 'Cleanup', icon: <FaBroom /> }
  ];

  return (
    <ButtonGroup>
      {activityTypes.map((type) => (
        <Button
          key={type.id}
          variant={selectedType === type.id ? 'primary' : 'dark'}
          onClick={() => onTypeChange(type.id)}
          className="d-flex align-items-center"
        >
          <span className="me-1">{type.icon}</span>
          <span className="d-none d-md-inline">{type.label}</span>
        </Button>
      ))}
    </ButtonGroup>
  );
};

export default ActivityFilter;
