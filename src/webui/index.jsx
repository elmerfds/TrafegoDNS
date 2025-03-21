// src/webui/index.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Import our custom Bootstrap theme
import './styles/theme/theme.scss';
// Import additional override styles to fix layout issues
import './styles/theme/theme-override.scss';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);