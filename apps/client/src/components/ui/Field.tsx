import React, { useId } from 'react';
import type { ControlSize } from './Button';
import { cx } from './cx';

const CONTROL_BASE =
  'w-full border border-stone-700 bg-obsidian-950 text-parchment transition ' +
  'placeholder:text-stone-500 hover:not-disabled:border-stone-500 ' +
  'focus-visible:border-gold-400 disabled:cursor-not-allowed disabled:opacity-45 ' +
  'aria-invalid:border-danger';

const CONTROL_SIZE_CLASSES: Record<ControlSize, string> = {
  sm: 'h-control-sm rounded-lg px-2 text-xs',
  md: 'h-control-md rounded-lg px-2.5 text-sm',
  // 16px text stops iOS from zooming the page when the field is focused.
  touch: 'h-control-touch rounded-xl px-3 text-base',
};

interface FieldChrome {
  /** Visible label, always linked to the control. */
  label: string;
  /** Keeps the label for screen readers but hides it visually. */
  hideLabel?: boolean;
  hint?: string;
  error?: string | null;
  controlSize?: ControlSize;
  /** Class for the outer wrapper (label + control + messages). */
  wrapperClassName?: string;
}

interface FieldShellProps extends Omit<FieldChrome, 'controlSize'> {
  id: string;
  children: React.ReactNode;
}

const FieldShell: React.FC<FieldShellProps> = ({
  id,
  label,
  hideLabel,
  hint,
  error,
  wrapperClassName,
  children,
}) => (
  <div className={cx('flex min-w-0 flex-col gap-1', wrapperClassName)}>
    <label
      htmlFor={id}
      className={cx(
        'text-xs font-semibold uppercase tracking-wide text-stone-400',
        hideLabel && 'sr-only'
      )}
    >
      {label}
    </label>
    {children}
    {hint && !error && (
      <p id={`${id}-hint`} className="text-xs text-stone-400">
        {hint}
      </p>
    )}
    {error && (
      <p id={`${id}-error`} role="alert" className="text-xs text-danger">
        {error}
      </p>
    )}
  </div>
);

function describedBy(id: string, hint?: string, error?: string | null): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export type TextInputProps = FieldChrome & Omit<React.ComponentProps<'input'>, 'size'>;

export const TextInput: React.FC<TextInputProps> = ({
  label,
  hideLabel,
  hint,
  error,
  controlSize = 'md',
  wrapperClassName,
  className,
  id: idProp,
  ...rest
}) => {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  return (
    <FieldShell
      id={id}
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      wrapperClassName={wrapperClassName}
    >
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL_BASE, CONTROL_SIZE_CLASSES[controlSize], className)}
        {...rest}
      />
    </FieldShell>
  );
};

export type SelectProps = FieldChrome & Omit<React.ComponentProps<'select'>, 'size'>;

export const Select: React.FC<SelectProps> = ({
  label,
  hideLabel,
  hint,
  error,
  controlSize = 'md',
  wrapperClassName,
  className,
  id: idProp,
  children,
  ...rest
}) => {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  return (
    <FieldShell
      id={id}
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      wrapperClassName={wrapperClassName}
    >
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL_BASE, CONTROL_SIZE_CLASSES[controlSize], 'cursor-pointer', className)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
};
