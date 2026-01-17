import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import App from './app';

import './features/editor/ai-assistant/ai-widget.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
