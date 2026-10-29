import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AppUpdateBanner } from './components/AppUpdateBanner.tsx';

if (typeof crypto === 'undefined' || !crypto.randomUUID) {
  if (typeof crypto === 'undefined') {
    (window as any).crypto = {};
  }
  (window.crypto as any).randomUUID = () => {
    return `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };
}

// After a new deployment an open tab can ask for code files that no longer exist; load the new
// version instead of failing (at most once a minute, so a real outage cannot cause a reload loop)
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('ephChunkReload') || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('ephChunkReload', String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    {/* Outside the error boundary so the reload offer still shows if the page has failed */}
    <AppUpdateBanner />
  </StrictMode>,
);
