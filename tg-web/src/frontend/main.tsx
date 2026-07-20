import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { BootstrapApp } from './app/bootstrap-app';
import './i18n';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <BootstrapApp />
    </BrowserRouter>
  </StrictMode>,
);
