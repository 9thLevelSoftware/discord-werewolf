import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

const root = createRoot(rootElement);

// Development only: /?ui=1 shows the shared UI primitives instead of the app.
const showUiGallery =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('ui');

if (import.meta.env.DEV && showUiGallery) {
  void import('./components/ui/UiGallery').then(({ UiGallery }) => {
    root.render(
      <StrictMode>
        <UiGallery />
      </StrictMode>
    );
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
