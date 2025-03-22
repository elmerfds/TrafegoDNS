// src/components/Layout/PageHeader.js
import React from 'react';
import { Row, Col, Button } from 'react-bootstrap';

/**
 * Reusable page header component with title and optional action button
 * 
 * @param {Object} props - Component props
 * @param {string} props.title - Page title
 * @param {string} props.subtitle - Optional subtitle
 * @param {string} props.buttonText - Optional button text
 * @param {function} props.onButtonClick - Button click handler
 * @param {React.ReactNode} props.buttonIcon - Optional button icon
 * @param {string} props.buttonVariant - Button variant (e.g., 'primary', 'outline-primary')
 * @param {boolean} props.buttonDisabled - Whether the button is disabled
 */
const PageHeader = ({ 
  title, 
  subtitle, 
  buttonText, 
  onButtonClick, 
  buttonIcon, 
  buttonVariant = 'primary',
  buttonDisabled = false
}) => {
  return (
    <Row className="mb-4 align-items-center">
      <Col>
        <h1 className="mb-0">{title}</h1>
        {subtitle && <p className="text-muted mb-0 mt-1">{subtitle}</p>}
      </Col>
      {buttonText && (
        <Col xs="auto">
          <Button 
            variant={buttonVariant} 
            size="sm"
            onClick={onButtonClick}
            disabled={buttonDisabled}
          >
            {buttonIcon && <span className="me-1">{buttonIcon}</span>}
            {buttonText}
          </Button>
        </Col>
      )}
    </Row>
  );
};

export default PageHeader;