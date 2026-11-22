import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a crash anywhere in the app and offers a way back, instead of leaving
 * the Activity as a blank frame.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('W20 dice table crashed:', error, info.componentStack);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-dvh w-full items-center justify-center bg-obsidian-950 p-4 text-parchment">
        <div
          role="alert"
          className="w20-obsidian-panel w-full max-w-md rounded-2xl !border-red-800/70 p-6 text-center"
        >
          <AlertTriangle className="mx-auto h-8 w-8 text-danger" />
          <h1 className="font-display mt-3 text-base font-extrabold tracking-wider uppercase text-red-200">
            The dice table hit a problem
          </h1>
          <p className="mt-2 text-sm text-stone-300">
            Something went wrong on this screen. Your characters are saved. Reload to carry on.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w20-crimson-seal font-display mt-4 inline-flex h-control-touch items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold uppercase tracking-widest text-amber-50"
          >
            <RefreshCw className="h-4 w-4" />
            Reload table
          </button>
          <details className="mt-4 text-left text-xs text-stone-400">
            <summary className="cursor-pointer">Technical details</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-stone-800 bg-obsidian-900 p-2">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
