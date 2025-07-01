import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from './app';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker with manual reload notification
registerSW({
  onNeedRefresh() {
    // eslint-disable-next-line no-console
    console.log('Update available. Please refresh the page to apply the latest changes.');
  },

  immediate: true,
});
