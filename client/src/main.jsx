import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { MetaProvider } from './meta.jsx';
import { ToastProvider } from './components/ui.jsx';
import { MapsProvider } from './components/GoogleMap.jsx';

// Installable app (PWA). Not in dev, so Vite's live reload is never cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <MetaProvider>
          <AuthProvider>
            <MapsProvider>
              <App />
            </MapsProvider>
          </AuthProvider>
        </MetaProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
