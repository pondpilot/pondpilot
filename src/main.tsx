import { ColorSchemeScript } from '@mantine/core';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import App from './app';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    <App />
  </StrictMode>,
);
