// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import SimpleLogin from './SimpleLogin';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Get the current path
const path = window.location.pathname;

// Check if we have a token
const hasToken = !!localStorage.getItem('token');

// Render the appropriate component
if (path === '/login' || !hasToken) {
  root.render(<SimpleLogin />);
} else {
  // If we're not on the login page and have a token, proceed with the normal app
  import('./App').then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
}