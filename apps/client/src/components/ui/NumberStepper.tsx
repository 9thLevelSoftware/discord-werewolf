import React from 'react';
import { Minus, Plus } from 'lucide-react';
import type { ControlSize } from './Button';
import { cx } from './cx';

export interface NumberStepperProps {
  /** Accessible name, for example "Difficulty". Used for the group and both buttons. */
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  size?: ControlSize;
  /** Custom text for the value, for example a signed bonus. */
  format?: (value: number) => string;
  /** Shows the label as visible text before the control. */
  showLabel?: boolean;
  disabled?: boolean;
  className?: string;
  /** Extra classes for the number, for example a colour for positive or negative values. */
  valueClassName?: string;
}

const BUTTON_SIZE: Record<ControlSize, string> = {
  sm: 'h-control-sm w-7',
  md: 'h-control-md w-8',
  touch: 'h-control-touch w-11',
};

const VALUE_SIZE: Record<ControlSize, string> = {
  sm: 'min-w-7 text-xs',
  md: 'min-w-8 text-sm',
  touch: 'min-w-10 text-base',
};

export function clampToRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** A labelled −/+ control. Buttons disable at the limits, so the range is always visible. */
export const NumberStepper: React.FC<NumberStepperProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  size = 'md',
  format,
  showLabel = false,
  disabled = false,
  className,
  valueClassName,
}) => {
  const current = clampToRange(value, min, max);
  const atMin = current <= min;
  const atMax = current >= max;
  const stepButton =
    'flex items-center justify-center text-stone-300 transition ' +
    'hover:not-disabled:bg-obsidian-800 hover:not-disabled:text-parchment ' +
    'disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <div
      role="group"
      aria-label={label}
      title={`${label}: ${min} to ${max}`}
      className={cx('inline-flex items-center gap-2', className)}
    >
      {showLabel && (
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          {label}
        </span>
      )}
      <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-stone-700 bg-obsidian-950">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled || atMin}
          onClick={() => onChange(clampToRange(current - step, min, max))}
          className={cx(stepButton, BUTTON_SIZE[size])}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <output
          aria-live="off"
          className={cx(
            'flex items-center justify-center px-1 font-mono font-bold tabular-nums',
            valueClassName ?? 'text-parchment',
            VALUE_SIZE[size]
          )}
        >
          {format ? format(current) : current}
        </output>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled || atMax}
          onClick={() => onChange(clampToRange(current + step, min, max))}
          className={cx(stepButton, BUTTON_SIZE[size])}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
