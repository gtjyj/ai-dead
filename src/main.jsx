import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/space-grotesk';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import App from './App';
import './styles.css';

if (
  window.location.hash.startsWith('#/status-float') ||
  window.location.hash.startsWith('#status-float')
) {
  document.documentElement.classList.add('status-float-root');
  document.body.classList.add('status-float-body');
  document.getElementById('root')?.classList.add('status-float-root');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
