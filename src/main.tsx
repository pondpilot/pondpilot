import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import App from './app';
import { SecretsApp } from './secrets-app';

// Check if this is the secrets window
const url = new URL(window.location.href);
const isSecretsWindow = url.pathname === '/secrets' || url.searchParams.get('window') === 'secrets';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>{isSecretsWindow ? <SecretsApp /> : <App />}</StrictMode>,
);
