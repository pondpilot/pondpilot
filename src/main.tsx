import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import App from './app';
import { SecretsApp } from './secrets-app';

// Check if this is the secrets window
const isSecretsWindow = window.location.pathname === '/secrets';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>{isSecretsWindow ? <SecretsApp /> : <App />}</StrictMode>,
);
