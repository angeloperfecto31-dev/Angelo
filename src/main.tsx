import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

if (typeof crypto === 'undefined' || !crypto.randomUUID) {
  if (typeof crypto === 'undefined') {
    (window as any).crypto = {};
  }
  (window.crypto as any).randomUUID = () => {
    return `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
