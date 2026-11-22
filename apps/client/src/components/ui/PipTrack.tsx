import React from 'react';
import { cx } from './cx';

export type PipTone = 'amber' | 'crimson' | 'cyan' | 'indigo' | 'emerald';

const TONE_CLASSES: Record<PipTone, { filled: string; emptyHover: string }> = {
  amber: {
    filled: 'border-amber-200/85 bg-gradient-to-br from-amber-300 to-amber-700 shadow-glow-gold',
    emptyHover: 'group-hover/pip:border-amber-400/70',
  },
  crimson: {
    filled: 'border-red-300/85 bg-gradient-to-br from-red-500 to-red-900 shadow-glow-crimson',
    emptyHover: 'group-hover/pip:border-red-400/70',
  },
  cyan: {
    filled: 'border-cyan-200/85 bg-gradient-to-br from-cyan-400 to-cyan-800 shadow-glow-cyan',
    emptyHover: 'group-hover/pip:border-cyan-400/70',
  },
  indigo: {
    filled: 'border-indigo-200/85 bg-gradient-to-br from-indigo-400 to-indigo-800 shadow-glow-indigo',
    emptyHover: 'group-hover/pip:border-indigo-400/70',
  },
  emerald: {
    filled:
      'border-emerald-200/85 bg-gradient-to-br from-emerald-400 to-emerald-800 shadow-glow-emerald',
    emptyHover: 'group-hover/pip:border-emerald-400/70',
  },
};

export interface PipTrackProps {
  /** Accessible name, for example "Strength" or "Rage". */
  label: string;
  value: number;
  max?: number;
  tone?: PipTone;
  shape?: 'circle' | 'square';
  /** 'sm' draws 16px pips in a 24px hit area; 'touch' draws 24px pips in a 32px hit area. */
  size?: 'sm' | 'touch';
  onChange: (next: number) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * The single dot-rating control for the whole app.
 *
 * Mouse and touch: clicking a pip sets the rating to it; clicking the pip that is
 * already the current rating lowers the rating by one (so a rating can reach 0).
 * Keyboard: it is one slider. Left/Down and Right/Up change by one, Home and End
 * jump to 0 and the maximum.
 */
export const PipTrack: React.FC<PipTrackProps> = ({
  label,
  value,
  max = 5,
  tone = 'amber',
  shape = 'circle',
  size = 'sm',
  onChange,
  disabled = false,
  className,
}) => {
  const current = Math.max(0, Math.min(max, Math.floor(Number.isFinite(value) ? value : 0)));
  const toneClasses = TONE_CLASSES[tone];

  const commit = (next: number) => {
    if (disabled) return;
    const clamped = Math.max(0, Math.min(max, next));
    if (clamped !== current) onChange(clamped);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        commit(current + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        commit(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        commit(0);
        break;
      case 'End':
        event.preventDefault();
        commit(max);
        break;
      default:
    }
  };

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={current}
      aria-valuetext={`${current} of ${max}`}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className={cx(
        'inline-flex flex-wrap items-center rounded',
        disabled && 'opacity-45',
        className
      )}
    >
      {Array.from({ length: max }, (_, idx) => {
        const rating = idx + 1;
        const filled = rating <= current;
        return (
          <span
            key={rating}
            data-pip={rating}
            data-filled={filled || undefined}
            onClick={() => commit(rating === current ? rating - 1 : rating)}
            className={cx(
              'group/pip flex items-center justify-center',
              size === 'touch' ? 'h-8 w-8' : 'h-6 w-6',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer'
            )}
          >
            <span
              className={cx(
                'block border transition-transform duration-100',
                size === 'touch' ? 'h-6 w-6' : 'h-4 w-4',
                shape === 'circle' ? 'rounded-full' : 'rounded-sm',
                !disabled && 'group-hover/pip:scale-110 group-active/pip:scale-95',
                filled
                  ? toneClasses.filled
                  : cx('border-stone-500/70 bg-obsidian-950', !disabled && toneClasses.emptyHover)
              )}
            />
          </span>
        );
      })}
    </div>
  );
};
