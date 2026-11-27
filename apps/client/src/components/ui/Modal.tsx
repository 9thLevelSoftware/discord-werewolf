import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { useModalStack } from './modalStack';
import { ToastViewport } from './Toast';

export type ModalVariant = 'center' | 'fullscreen' | 'sheet' | 'side';
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  /** Called when the modal should close (close button, Escape, backdrop, or confirmed discard). */
  onClose: () => void;
  /** Accessible name. Shown in the default header. */
  title: string;
  subtitle?: string;
  /** Extra controls placed in the default header, before the close button. */
  headerActions?: React.ReactNode;
  /**
   * Replaces the default header. Receives `requestClose`, which must be wired to a
   * visible close control.
   */
  renderHeader?: (requestClose: () => void) => React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** center: floating panel. fullscreen: fills the viewport. sheet: bottom. side: right edge. */
  variant?: ModalVariant;
  /** Maximum width of the centre variant. */
  size?: ModalSize;
  /** When true, closing first asks the user to confirm discarding their changes. */
  dirty?: boolean;
  discardMessage?: string;
  /** Class for the scrolling body. */
  bodyClassName?: string;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

const DIALOG_BASE =
  'max-h-none bg-transparent p-0 text-parchment backdrop:bg-black/80 backdrop:backdrop-blur-sm';

const DIALOG_VARIANT: Record<ModalVariant, string> = {
  center: 'm-auto w-[calc(100vw-1.5rem)]',
  fullscreen: 'm-0 h-dvh w-screen max-w-none',
  sheet: 'mx-0 mt-auto mb-0 w-screen max-w-none',
  side: 'my-0 ml-auto mr-0 h-dvh w-[30rem] max-w-[100vw]',
};

const PANEL_VARIANT: Record<ModalVariant, string> = {
  center: 'w20-obsidian-panel animate-pop-in flex max-h-[94dvh] flex-col overflow-hidden rounded-2xl',
  fullscreen: 'flex h-dvh flex-col overflow-hidden bg-obsidian-950',
  sheet:
    'w20-obsidian-panel animate-sheet-up pb-safe flex max-h-[84dvh] flex-col overflow-hidden rounded-t-2xl border-x-0 border-b-0',
  side: 'w20-obsidian-panel flex h-dvh flex-col overflow-hidden border-y-0 border-r-0',
};

/**
 * The one modal shell for the app, built on the native <dialog> element.
 *
 * showModal() provides the focus trap, makes the page behind inert and handles
 * Escape. Focus returns to the control that opened the modal when it closes.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  headerActions,
  renderHeader,
  footer,
  children,
  variant = 'center',
  size = 'md',
  dirty = false,
  discardMessage = 'Discard your changes?',
  bodyClassName,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const modalId = useId();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      setConfirmingDiscard(true);
      return;
    }
    onCloseRef.current();
  }, []);

  // Open as a true modal, and restore focus to the opener on close.
  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    useModalStack.getState().push(modalId);

    return () => {
      useModalStack.getState().remove(modalId);
      if (dialog.open) dialog.close();
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open, modalId]);

  useEffect(() => {
    if (!open) setConfirmingDiscard(false);
  }, [open]);

  useEffect(() => {
    if (confirmingDiscard) keepEditingRef.current?.focus();
  }, [confirmingDiscard]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      className={cx(DIALOG_BASE, DIALOG_VARIANT[variant], variant === 'center' && SIZE_CLASSES[size])}
      onCancel={(event) => {
        // Escape: route through requestClose so unsaved changes are protected.
        event.preventDefault();
        if (confirmingDiscard) {
          setConfirmingDiscard(false);
          return;
        }
        requestClose();
      }}
      onClose={() => {
        // The browser closed the dialog itself; keep React state in step. Ignore the
        // event if the dialog has since been reopened (React StrictMode re-runs effects).
        if (!dialogRef.current?.open) onCloseRef.current();
      }}
      onMouseDown={(event) => {
        // A press on the dialog element itself is a press on the backdrop.
        if (event.target === dialogRef.current) requestClose();
      }}
    >
      <div className={PANEL_VARIANT[variant]}>
        {variant === 'sheet' && (
          <div className="flex justify-center pt-2 pb-1" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-stone-600/80" />
          </div>
        )}

        {renderHeader ? (
          renderHeader(requestClose)
        ) : (
          <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <h2 className="font-display truncate text-sm font-extrabold tracking-wider uppercase text-amber-100">
                {title}
              </h2>
              {subtitle && <p className="truncate text-xs text-stone-400">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {headerActions}
              <IconButton
                label={`Close ${title}`}
                icon={<X className="h-4 w-4" />}
                size={variant === 'center' ? 'md' : 'touch'}
                onClick={requestClose}
              />
            </div>
          </header>
        )}

        {confirmingDiscard && (
          <div
            role="alertdialog"
            aria-label={discardMessage}
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-y border-red-800/60 bg-red-950/60 px-4 py-2"
          >
            <span className="text-xs font-semibold text-red-100">{discardMessage}</span>
            <div className="flex items-center gap-2">
              <Button
                ref={keepEditingRef}
                size="sm"
                variant="secondary"
                onClick={() => setConfirmingDiscard(false)}
              >
                Keep editing
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setConfirmingDiscard(false);
                  onCloseRef.current();
                }}
              >
                Discard
              </Button>
            </div>
          </div>
        )}

        {!renderHeader && !confirmingDiscard && <div className="w20-gold-divider shrink-0" />}

        <div className={cx('min-h-0 flex-1 overflow-y-auto', bodyClassName ?? 'p-4')}>
          {children}
        </div>

        {footer && (
          <footer className="shrink-0 border-t border-gold-500/20 px-4 py-3">{footer}</footer>
        )}
      </div>

      {/* Toasts raised while this modal is open are drawn inside it (see ToastViewport). */}
      <ToastViewport host={modalId} />
    </dialog>
  );
};
