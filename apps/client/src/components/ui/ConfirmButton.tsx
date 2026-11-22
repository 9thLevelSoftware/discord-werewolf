import React, { useEffect, useRef, useState } from 'react';
import { Button, type ButtonVariant, type ControlSize } from './Button';
import { cx } from './cx';

export interface ConfirmButtonProps {
  /** Content of the resting button, for example "Delete" or an icon plus text. */
  children: React.ReactNode;
  /** Accessible name for the resting button when its content is only an icon. */
  label?: string;
  /** The question shown once armed, for example "Delete Walks-the-Ash for good?". */
  prompt: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: ButtonVariant;
  size?: ControlSize;
  disabled?: boolean;
  className?: string;
}

/**
 * Two-step confirmation for destructive actions, shown in place.
 * The first press asks the question; the action only runs on the second, explicit press.
 * Escape or Cancel backs out. Focus lands on Cancel so a double Enter cannot confirm.
 */
export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  children,
  label,
  prompt,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'danger',
  size = 'sm',
  disabled = false,
  className,
}) => {
  const [armed, setArmed] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (armed) {
      cancelRef.current?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [armed]);

  const disarm = () => {
    restoreFocusRef.current = true;
    setArmed(false);
  };

  if (!armed) {
    return (
      <Button
        ref={triggerRef}
        variant={variant}
        size={size}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={className}
        onClick={() => setArmed(true)}
      >
        {children}
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label={prompt}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          disarm();
        }
      }}
      className={cx('inline-flex flex-wrap items-center gap-2', className)}
    >
      <span className="text-xs font-semibold text-red-100">{prompt}</span>
      <Button ref={cancelRef} size={size} variant="secondary" onClick={disarm}>
        {cancelLabel}
      </Button>
      <Button
        size={size}
        variant="danger"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  );
};
