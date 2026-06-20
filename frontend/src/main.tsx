import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { logError } from './lib/log';
import './index.css';

// Global visible error handler: reuse a single container so repeated errors don't flood the page.
const globalErrorContainer = document.createElement('div');
globalErrorContainer.style.cssText =
  'position:fixed; bottom:0; left:0; right:0; background:#7f1d1d; color:#fecaca; padding:12px; z-index:999999; font-family:monospace; font-size:12px; white-space:pre-wrap; max-height:40vh; overflow:auto;';
const updateGlobalError = (header: string, detail: string) => {
  if (!globalErrorContainer.parentElement) {
    document.body.appendChild(globalErrorContainer);
  }
  const entry = document.createElement('div');
  entry.style.borderTop = '1px solid rgba(255,255,255,0.1)';
  entry.textContent = `${header}:\n${detail}`;
  globalErrorContainer.appendChild(entry);
  if (globalErrorContainer.children.length > 5) {
    globalErrorContainer.removeChild(globalErrorContainer.firstChild!);
  }
};

window.onerror = (message, _source, _lineno, _colno, error) => {
  logError('GlobalErrorHandler', 'window.onerror', error ?? message, { message: String(message) });
  updateGlobalError('GLOBAL ERROR', `${message}\n\n${error?.stack || ''}`);
};

window.addEventListener('unhandledrejection', (event) => {
  logError('GlobalErrorHandler', 'unhandledrejection', event.reason, { reason: String(event.reason) });
  updateGlobalError('UNHANDLED PROMISE REJECTION', String(event.reason));
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
