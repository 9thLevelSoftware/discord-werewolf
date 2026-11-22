import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared behaviour for small anchored popovers (difficulty presets, trait pickers,
 * tracker panel): a press outside closes it, and Escape closes it and returns focus
 * to the control that opened it.
 */
export function usePopoverDismiss(options: {
  open: boolean;
  onClose: () => void;
  /** Element wrapping both the trigger and the popover. Presses inside it are ignored. */
  containerRef: RefObject<HTMLElement | null>;
  /** Receives focus again when the popover is closed with Escape. */
  triggerRef?: RefObject<HTMLElement | null>;
}): void {
  const { open, containerRef, triggerRef } = options;
  const onCloseRef = useRef(options.onClose);
  onCloseRef.current = options.onClose;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (container && !container.contains(event.target as Node)) {
        onCloseRef.current();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Cancelling the key press also stops an enclosing modal dialog from closing.
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
      triggerRef?.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, containerRef, triggerRef]);
}
