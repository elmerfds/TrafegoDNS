// src/webui/components/dashboard/StatCard.jsx
import React from 'react';
import { Card } from 'react-bootstrap';
import PropTypes from 'prop-types';

const StatCard = ({ title, value, icon, color = 'primary' }) => {
  return (
    <Card className={`h-100 border-${color} bg-dark`}>
      <Card.Body className="d-flex align-items-center">
        <div className={`text-${color} fs-3 me-3`}>
          {icon}
        </div>
        <div>
          <div className="text-muted small">{title}</div>
          <div className="fs-4 fw-bold">{value}</div>
        </div>
      </Card.Body>
    </Card>
  );
};

StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.node,
  color: PropTypes.string
};

export default StatCard;
