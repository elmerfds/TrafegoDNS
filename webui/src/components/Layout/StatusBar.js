// src/components/Layout/StatusBar.js
import React from 'react';

const StatusBar = ({ mode, provider }) => {
  return (
    <div className="status-bar bg-dark border-bottom border-secondary">
      <div className="container-fluid px-2">
        <div className="py-2">
          <div className="d-flex flex-wrap">
            {mode && (
              <span className="mode-pill me-2">
                <button className="btn btn-info btn-sm text-white text-uppercase px-3 py-1">
                  {mode} MODE
                </button>
              </span>
            )}
            
            {provider && (
              <span className="provider-pill">
                <button className="btn btn-primary btn-sm text-white text-uppercase px-3 py-1">
                  {provider}
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;