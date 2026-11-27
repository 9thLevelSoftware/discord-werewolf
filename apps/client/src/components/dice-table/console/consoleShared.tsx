import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Check, EyeOff, Pin, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
import type { ConnectionStatus } from '../../../store/useVttRoomStore';
import { cx, IconButton, NumberStepper } from '../../ui';
import { MAX_LOCAL_QUEUED_ROLLS } from '../rollQueueController';

/**
 * Pieces of the roll console shared by the desktop and mobile HUDs, so a fix or
 * restyle is made once. `touch` / layout props pick the size for each surface.
 */

const MAX_POOL = 30;
const BONUS_DICE_LIMIT = 15;

/* ---------------------------------------------------------------- roll gating */

export interface RollGate {
  /** Rolling is impossible right now (not connected, or the queue is full). */
  isDisabled: boolean;
  /** Sheet-traits mode with nothing selected, or a pool of zero. */
  rollBlockedByEmptyTraits: boolean;
}

export function getRollGate(input: {
  connectionStatus: ConnectionStatus;
  localPendingCount: number;
  isSheetTraitsMode: boolean;
  hasTraitSelection: boolean;
  pool: number;
}): RollGate {
  const connected =
    input.connectionStatus === 'authenticated' || input.connectionStatus === 'reconnecting';
  return {
    isDisabled: !connected || input.localPendingCount >= MAX_LOCAL_QUEUED_ROLLS,
    rollBlockedByEmptyTraits:
      input.isSheetTraitsMode && (!input.hasTraitSelection || input.pool <= 0),
  };
}

/**
 * Why rolling is blocked right now, in a few words, or null when it is not.
 * Shown on the Roll button so a disabled button always explains itself.
 */
export function getRollBlockReason(input: {
  connectionStatus: ConnectionStatus;
  localPendingCount: number;
}): string | null {
  switch (input.connectionStatus) {
    case 'session_expired':
      return 'Session expired';
    case 'connecting':
      return 'Connecting…';
    case 'disconnected':
      return 'Offline';
    default:
  }
  if (input.localPendingCount >= MAX_LOCAL_QUEUED_ROLLS) {
    return `Queue full (${MAX_LOCAL_QUEUED_ROLLS})`;
  }
  return null;
}

export function getRollCtaText(input: {
  /** From getRollBlockReason. When set, it replaces the normal button text. */
  blockReason?: string | null;
  isSheetTraitsMode: boolean;
  hasTraitSelection: boolean;
  pool: number;
  effectivePreviewPool: number;
  difficulty: number;
  clampedPreviewRage: number;
}): string {
  if (input.blockReason) return input.blockReason;
  if (input.isSheetTraitsMode && !input.hasTraitSelection) return 'Pick a trait';
  if (input.isSheetTraitsMode && input.pool <= 0) return '0 Dice';
  const diff = input.difficulty !== 6 ? ` • Diff ${input.difficulty}` : '';
  const rage = input.clampedPreviewRage > 0 ? ` • ${input.clampedPreviewRage} Rage` : '';
  return `Roll ${input.effectivePreviewPool}d10${diff}${rage}`;
}

/* ------------------------------------------------------------- saved feedback */

/** A flag that turns on when triggered and off again shortly after. */
export function useSavedFlash(durationMs = 1400): [boolean, () => void] {
  const [flashing, setFlashing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const trigger = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setFlashing(true);
    timerRef.current = window.setTimeout(() => setFlashing(false), durationMs);
  }, [durationMs]);

  return [flashing, trigger];
}

/* ---------------------------------------------------------- connection status */

const CONNECTION_LABELS: Record<string, string> = {
  authenticated: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  disconnected: 'Offline',
  session_expired: 'Session expired',
};

export function connectionLabel(status: ConnectionStatus): string {
  return CONNECTION_LABELS[status] ?? 'Offline';
}

/**
 * Connection indicator. While connected it is a quiet green dot; in any other state
 * it also spells the state out, so colour is never the only signal.
 */
export const ConnectionDot: React.FC<{ status: ConnectionStatus; pinging?: boolean }> = ({
  status,
  pinging = false,
}) => {
  const text = connectionLabel(status);
  const connected = status === 'authenticated';
  const failed = status === 'session_expired' || status === 'disconnected';
  return (
    <span
      role="status"
      aria-label={`Connection: ${text}`}
      title={`Connection: ${text}`}
      className="inline-flex shrink-0 items-center gap-1.5"
    >
      <span
        aria-hidden="true"
        className={cx(
          'h-2 w-2 shrink-0 rounded-full',
          connected
            ? pinging
              ? 'animate-ping bg-success'
              : 'bg-success shadow-glow-emerald'
            : failed
              ? 'bg-danger'
              : 'animate-pulse bg-warning'
        )}
      />
      {!connected && (
        <span className={cx('text-xs font-semibold', failed ? 'text-danger' : 'text-warning')}>
          {text}
        </span>
      )}
    </span>
  );
};

/* ------------------------------------------------------------ modifier toggles */

type ToggleTone = 'amber' | 'indigo' | 'rose';

const TOGGLE_ON: Record<ToggleTone, string> = {
  amber: 'border-amber-400/80 bg-amber-950/65 text-amber-200 shadow-glow-gold',
  indigo: 'border-indigo-400/80 bg-indigo-950/70 text-indigo-200 shadow-glow-indigo',
  rose: 'border-rose-500/65 bg-rose-950/55 text-rose-200',
};

const ToggleChip: React.FC<{
  pressed: boolean;
  tone: ToggleTone;
  touch: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}> = ({ pressed, tone, touch, onClick, disabled, title, children }) => (
  <button
    type="button"
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
    title={title}
    className={cx(
      'flex items-center justify-center gap-1.5 border text-xs font-bold transition',
      'disabled:cursor-not-allowed disabled:opacity-45',
      touch ? 'min-h-control-touch rounded-xl px-3 py-1' : 'min-h-control-sm rounded-lg px-2.5 py-1',
      pressed
        ? TOGGLE_ON[tone]
        : 'border-stone-700 bg-obsidian-950 text-stone-300 hover:not-disabled:border-stone-500'
    )}
  >
    {children}
  </button>
);

export function SpecialtyDeclaration({
  declared,
  reason,
  touch = false,
  onToggle,
}: {
  declared: boolean;
  reason?: string | null;
  touch?: boolean;
  onToggle: () => void;
}) {
  return (
    <ToggleChip pressed={declared} tone="amber" touch={touch} onClick={onToggle}>
      <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {reason ? <span>Apply specialty ({reason})</span> : <span>Apply specialty</span>}
    </ToggleChip>
  );
}

export interface RollModifierTogglesProps {
  /** row: inline chips for the desktop tray. grid: 2x2 touch tiles for the mobile sheet. */
  layout: 'row' | 'grid';
  showSpecialty?: boolean;
  specialtyDeclared: boolean;
  specialtyReason?: string | null;
  spendWillpower: boolean;
  applyWoundPenalty: boolean;
  isSecretRoll: boolean;
  willpowerRemaining: number;
  woundPenalty: number;
  onToggleSpecialty: () => void;
  onToggleSpendWillpower: () => void;
  onToggleApplyWoundPenalty: () => void;
  onToggleSecretRoll: () => void;
}

export const RollModifierToggles: React.FC<RollModifierTogglesProps> = ({
  layout,
  showSpecialty = true,
  specialtyDeclared,
  specialtyReason,
  spendWillpower,
  applyWoundPenalty,
  isSecretRoll,
  willpowerRemaining,
  woundPenalty,
  onToggleSpecialty,
  onToggleSpendWillpower,
  onToggleApplyWoundPenalty,
  onToggleSecretRoll,
}) => {
  const touch = layout === 'grid';
  const iconClass = touch ? 'h-3.5 w-3.5' : 'h-3 w-3';
  return (
    <div
      role="group"
      aria-label="Roll modifiers"
      className={touch ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap items-center gap-1.5'}
    >
      {showSpecialty && (
        <SpecialtyDeclaration
          declared={specialtyDeclared}
          reason={specialtyReason}
          touch={touch}
          onToggle={onToggleSpecialty}
        />
      )}

      <ToggleChip
        pressed={spendWillpower}
        tone="indigo"
        touch={touch}
        disabled={willpowerRemaining <= 0 && !spendWillpower}
        onClick={onToggleSpendWillpower}
        title={
          willpowerRemaining <= 0
            ? 'No temporary Willpower remaining'
            : 'Spend 1 temporary Willpower for 1 automatic success'
        }
      >
        +1 Willpower
      </ToggleChip>

      <ToggleChip
        pressed={applyWoundPenalty}
        tone="rose"
        touch={touch}
        onClick={onToggleApplyWoundPenalty}
        title="Apply your wound penalty to this roll"
      >
        <ShieldAlert className={iconClass} />
        Wounds
        {woundPenalty !== 0 ? ` (${woundPenalty})` : ''}
      </ToggleChip>

      <ToggleChip
        pressed={isSecretRoll}
        tone="amber"
        touch={touch}
        onClick={onToggleSecretRoll}
        title="Secret roll: only you see the result"
      >
        <EyeOff className={iconClass} />
        Secret
      </ToggleChip>

      {isSecretRoll && (
        <p className={cx('text-xs text-amber-200', touch ? 'col-span-2' : 'basis-full')}>
          Secret is on: only you will see this roll and its result.
        </p>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------- steppers */

interface StepperShellProps {
  layout: 'inline' | 'card';
  tone: 'neutral' | 'rage';
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** Inline pill (desktop tray) or a labelled card (mobile sheet) around a stepper. */
const StepperShell: React.FC<StepperShellProps> = ({ layout, tone, label, action, children }) => {
  const labelClass = cx(
    'font-display text-xs font-bold tracking-wider uppercase',
    tone === 'rage' ? 'text-red-300' : 'text-amber-200'
  );
  if (layout === 'card') {
    return (
      <div
        className={cx(
          'space-y-1.5 rounded-xl border p-2.5',
          tone === 'rage' ? 'border-red-900/65 bg-red-950/25' : 'border-stone-700/70 bg-obsidian-950'
        )}
      >
        <div className="flex min-h-6 items-center justify-between gap-2">
          <span className={labelClass}>{label}</span>
          {action}
        </div>
        <div className="flex justify-center">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
      {action}
    </div>
  );
};

export const BonusDiceStepper: React.FC<{
  layout: 'inline' | 'card';
  bonusDice: number;
  onSetBonusDice: React.Dispatch<React.SetStateAction<number>>;
}> = ({ layout, bonusDice, onSetBonusDice }) => (
  <StepperShell
    layout={layout}
    tone="neutral"
    label={layout === 'card' ? 'Bonus Dice' : 'Bonus / Penalty'}
    action={
      bonusDice !== 0 ? (
        <IconButton
          label="Reset bonus dice"
          icon={<RotateCcw className="h-3 w-3" />}
          variant="secondary"
          size="sm"
          className="h-6 w-6 rounded-md"
          onClick={() => onSetBonusDice(0)}
        />
      ) : undefined
    }
  >
    <NumberStepper
      label="Bonus dice"
      value={bonusDice}
      min={-BONUS_DICE_LIMIT}
      max={BONUS_DICE_LIMIT}
      onChange={(next) => onSetBonusDice(next)}
      size={layout === 'card' ? 'touch' : 'sm'}
      format={(v) => (v > 0 ? `+${v}` : String(v))}
      valueClassName={
        bonusDice > 0 ? 'text-emerald-300' : bonusDice < 0 ? 'text-rose-300' : 'text-stone-300'
      }
    />
  </StepperShell>
);

export const RageDiceStepper: React.FC<{
  layout: 'inline' | 'card';
  rageDiceCount: number;
  /** Current dice pool; Rage dice can never exceed it. */
  pool: number;
  /** The character's current temporary Rage, used by the Sync button. */
  trackerRage: number;
  onSetRageDiceCount: React.Dispatch<React.SetStateAction<number>>;
}> = ({ layout, rageDiceCount, pool, trackerRage, onSetRageDiceCount }) => {
  const maxRage = Math.max(0, Math.min(MAX_POOL, pool));
  return (
    <StepperShell
      layout={layout}
      tone="rage"
      label={layout === 'card' ? 'Rage Dice' : 'Rage'}
      action={
        <button
          type="button"
          onClick={() => onSetRageDiceCount(Math.min(maxRage, trackerRage))}
          title="Set Rage dice to this character's current Rage"
          className="h-6 rounded-md border border-red-700/65 bg-red-950/90 px-1.5 text-xs font-bold uppercase text-red-200 transition hover:bg-red-900"
        >
          Sync
        </button>
      }
    >
      <NumberStepper
        label="Rage dice"
        value={Math.min(rageDiceCount, maxRage)}
        min={0}
        max={maxRage}
        onChange={(next) => onSetRageDiceCount(next)}
        size={layout === 'card' ? 'touch' : 'sm'}
        valueClassName="text-red-300"
      />
    </StepperShell>
  );
};

/* --------------------------------------------------------------- save / pin CTA */

export const SavePinButton: React.FC<{
  /** True when a character sheet is bound: the roll is pinned to it. Otherwise it is saved as a preset. */
  pinsToSheet: boolean;
  saved: boolean;
  disabled?: boolean;
  touch?: boolean;
  onClick: () => void;
}> = ({ pinsToSheet, saved, disabled, touch = false, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cx(
      'flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-gold-500/50 bg-amber-950/30 px-3 text-xs font-bold text-amber-200 transition',
      'hover:not-disabled:border-gold-300 hover:not-disabled:bg-amber-950/55',
      'disabled:cursor-not-allowed disabled:opacity-45',
      touch ? 'h-control-touch' : 'h-control-sm'
    )}
  >
    {saved ? (
      <Check className="h-3.5 w-3.5 text-success" />
    ) : pinsToSheet ? (
      <Pin className="h-3.5 w-3.5" />
    ) : (
      <BookmarkPlus className="h-3.5 w-3.5" />
    )}
    <span aria-live="polite">
      {saved ? (pinsToSheet ? 'Pinned!' : 'Saved!') : pinsToSheet ? 'Pin to Sheet' : 'Save Preset'}
    </span>
  </button>
);

/* ------------------------------------------------------------ dice preview bar */

/** One segment per die in the pool; Rage dice are drawn in red at the end. */
export const DicePreviewStrip: React.FC<{
  effectivePool: number;
  /** How many of the dice are ordinary (non-Rage). */
  normalDiceCount: number;
  maxSegments?: number;
  /** Segments grow to fill the available width. */
  stretch?: boolean;
}> = ({ effectivePool, normalDiceCount, maxSegments = 20, stretch = false }) => {
  const rageCount = Math.max(0, effectivePool - normalDiceCount);
  return (
    <div
      role="img"
      aria-label={`${effectivePool} dice${rageCount > 0 ? `, ${rageCount} of them Rage dice` : ''}`}
      className={cx('flex items-center gap-0.5', stretch && 'w-full')}
    >
      {Array.from({ length: Math.min(effectivePool, maxSegments) }, (_, idx) => (
        <span
          key={idx}
          className={cx(
            'h-1.5 rounded-xs',
            stretch ? 'flex-1' : 'w-2',
            idx >= normalDiceCount ? 'bg-red-600 shadow-glow-crimson' : 'bg-stone-500/80'
          )}
        />
      ))}
      {effectivePool > maxSegments && (
        <span className="ml-1 font-mono text-xs text-stone-400">
          +{effectivePool - maxSegments}
        </span>
      )}
    </div>
  );
};
