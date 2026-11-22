import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { create } from 'zustand';
import { cx } from './cx';
import { ROOT_TOAST_HOST, useModalStack } from './modalStack';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
  /** Milliseconds before the toast closes itself. 0 keeps it until dismissed. */
  durationMs: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: { message: string; tone?: ToastTone; durationMs?: number; id?: string }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const DEFAULT_DURATION_MS: Record<ToastTone, number> = {
  info: 5000,
  success: 4000,
  error: 8000,
};

const MAX_VISIBLE_TOASTS = 4;
let toastCounter = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: ({ message, tone = 'info', durationMs, id }) => {
    toastCounter += 1;
    const toastId = id ?? `toast-${toastCounter}`;
    const item: ToastItem = {
      id: toastId,
      tone,
      message,
      durationMs: durationMs ?? DEFAULT_DURATION_MS[tone],
    };
    set((state) => ({
      // Re-pushing an id replaces that toast, so a repeated error does not stack up.
      toasts: [...state.toasts.filter((t) => t.id !== toastId), item].slice(-MAX_VISIBLE_TOASTS),
    }));
    return toastId;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Shorthand for use outside React components (stores, event handlers). */
export const toast = {
  info: (message: string, durationMs?: number) =>
    useToasts.getState().push({ message, tone: 'info', durationMs }),
  success: (message: string, durationMs?: number) =>
    useToasts.getState().push({ message, tone: 'success', durationMs }),
  error: (message: string, durationMs?: number) =>
    useToasts.getState().push({ message, tone: 'error', durationMs }),
};

const TONE_STYLES: Record<ToastTone, { border: string; text: string; icon: React.ReactNode }> = {
  info: {
    border: '!border-gold-500/60',
    text: 'text-gold-200',
    icon: <Info className="h-4 w-4 shrink-0 text-gold-300" />,
  },
  success: {
    border: '!border-emerald-500/60',
    text: 'text-emerald-100',
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />,
  },
  error: {
    border: '!border-red-600/80',
    text: 'text-red-100',
    icon: <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />,
  },
};

const ToastCard: React.FC<{ item: ToastItem }> = ({ item }) => {
  const dismiss = useToasts((s) => s.dismiss);

  useEffect(() => {
    if (item.durationMs <= 0) return;
    const timer = window.setTimeout(() => dismiss(item.id), item.durationMs);
    return () => window.clearTimeout(timer);
  }, [item.id, item.durationMs, dismiss]);

  const style = TONE_STYLES[item.tone];
  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'w20-obsidian-panel pointer-events-auto flex w-full items-start gap-2 rounded-xl px-3 py-2 text-xs',
        style.border,
        style.text
      )}
    >
      {style.icon}
      <span className="min-w-0 flex-1 break-words leading-5">{item.message}</span>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss message"
        className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 transition hover:bg-obsidian-800 hover:text-parchment"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

/**
 * Where toasts are drawn. Mount one at the app root. Each open Modal mounts its own.
 *
 * A modal <dialog> makes everything outside it inert, so a toast drawn at the app
 * root would be unclickable and unannounced while a modal is open. Only the viewport
 * belonging to the topmost open modal draws; with no modal open, the root one does.
 */
export const ToastViewport: React.FC<{ host?: string }> = ({ host = ROOT_TOAST_HOST }) => {
  const toasts = useToasts((s) => s.toasts);
  const activeHost = useModalStack((s) => s.stack[s.stack.length - 1] ?? ROOT_TOAST_HOST);

  if (activeHost !== host || toasts.length === 0) return null;

  return (
    <div
      data-toast-host={host}
      className="pt-safe pointer-events-none fixed inset-x-0 top-3 z-toast mx-auto flex w-[min(92vw,26rem)] flex-col gap-2"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
};
