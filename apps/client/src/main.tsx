import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

const root = createRoot(rootElement);

// Development only: /?ui=1 shows the shared UI primitives instead of the app.
const showUiGallery =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('ui');

// Development only: /?preview=legacy mounts the campaign screens with sample state.
const showLegacyPreview =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'legacy';

if (import.meta.env.DEV && showLegacyPreview) {
  void import('./components/LegacyPreview').then(({ LegacyPreview }) => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <LegacyPreview />
        </ErrorBoundary>
      </StrictMode>
    );
  });
} else if (import.meta.env.DEV && showUiGallery) {
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
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}
