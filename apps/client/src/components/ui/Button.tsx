import React from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ControlSize = 'sm' | 'md' | 'touch';

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-1.5 font-semibold transition ' +
  'disabled:cursor-not-allowed disabled:opacity-45';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'w20-crimson-seal font-display uppercase tracking-wider text-amber-50',
  secondary:
    'border border-gold-500/45 bg-obsidian-900 text-gold-200 ' +
    'hover:not-disabled:border-gold-300 hover:not-disabled:bg-obsidian-800',
  ghost:
    'border border-transparent text-stone-300 ' +
    'hover:not-disabled:bg-obsidian-800 hover:not-disabled:text-parchment',
  danger:
    'border border-red-700/70 bg-red-950/70 text-red-200 ' +
    'hover:not-disabled:border-red-500 hover:not-disabled:bg-red-900/70',
};

const SIZE_CLASSES: Record<ControlSize, string> = {
  sm: 'h-control-sm rounded-lg px-2.5 text-xs',
  md: 'h-control-md rounded-lg px-3.5 text-xs',
  touch: 'h-control-touch rounded-xl px-4 text-sm',
};

const ICON_SIZE_CLASSES: Record<ControlSize, string> = {
  sm: 'h-control-sm w-control-sm rounded-lg',
  md: 'h-control-md w-control-md rounded-lg',
  touch: 'h-control-touch w-control-touch rounded-xl',
};

export interface ButtonProps extends React.ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ControlSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={cx(
      BASE,
      VARIANT_CLASSES[variant],
      SIZE_CLASSES[size],
      fullWidth && 'w-full',
      className
    )}
    {...rest}
  >
    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
    {children}
  </button>
);

export interface IconButtonProps extends Omit<React.ComponentProps<'button'>, 'aria-label'> {
  /** Required accessible name. Also shown as the hover tooltip. */
  label: string;
  icon: React.ReactNode;
  variant?: Exclude<ButtonVariant, 'primary'>;
  size?: ControlSize;
}

/** A button that shows only an icon. The label is mandatory so it always has a name. */
export const IconButton: React.FC<IconButtonProps> = ({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  title,
  ...rest
}) => (
  <button
    type={type}
    aria-label={label}
    title={title ?? label}
    className={cx(BASE, VARIANT_CLASSES[variant], ICON_SIZE_CLASSES[size], className)}
    {...rest}
  >
    {icon}
  </button>
);
