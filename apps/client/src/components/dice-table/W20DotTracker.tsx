import React, { useRef, useState } from 'react';
import type { LightGarouTrackers, LightWoundPenalty } from '@w20-vtt/protocol';
import { ChevronDown, ShieldAlert, X } from 'lucide-react';
import { diceSoundEngine } from '../../audio/DiceSoundEngine';
import { IconButton, PipTrack } from '../ui';
import { usePopoverDismiss } from '../ui/usePopoverDismiss';

const WOUND_OPTIONS: Array<{ value: LightWoundPenalty; label: string; tag: string }> = [
  { value: 0, label: 'Bruised', tag: '0' },
  { value: -1, label: 'Hurt', tag: '-1' },
  { value: -2, label: 'Wounded', tag: '-2' },
  { value: -5, label: 'Crippled', tag: '-5' },
];

const TRACKER_LABEL_TONE: Record<'crimson' | 'cyan' | 'indigo', string> = {
  crimson: 'text-red-300',
  cyan: 'text-cyan-200',
  indigo: 'text-indigo-200',
};

interface W20DotRowProps {
  label: string;
  value: number;
  max?: number;
  tone: 'crimson' | 'cyan' | 'indigo';
  touchFriendly?: boolean;
  onChange: (nextValue: number) => void;
}

/** A labelled resource track (Rage, Gnosis, Willpower) built on the shared PipTrack. */
export const W20DotRow: React.FC<W20DotRowProps> = ({
  label,
  value,
  max = 10,
  tone,
  touchFriendly = false,
  onChange,
}) => {
  const clamped = Math.max(0, Math.min(max, value));
  return (
    <div className={touchFriendly ? 'space-y-1.5' : 'space-y-1'}>
      <div className="flex items-center justify-between text-xs">
        <span
          className={`font-display font-bold tracking-wider uppercase ${TRACKER_LABEL_TONE[tone]}`}
        >
          {label}
        </span>
        <span className="font-mono text-xs font-bold text-stone-300">
          {clamped}/{max}
        </span>
      </div>
      <PipTrack
        label={label}
        value={clamped}
        max={max}
        tone={tone}
        size={touchFriendly ? 'touch' : 'sm'}
        className="w-full justify-between"
        onChange={(next) => {
          diceSoundEngine.playPipClick();
          onChange(next);
        }}
      />
    </div>
  );
};

export interface PersonalTrackersPanelProps {
  trackers: LightGarouTrackers;
  onUpdate: (patch: Partial<LightGarouTrackers>) => void;
  touchFriendly?: boolean;
  showHeader?: boolean;
  onClose?: () => void;
}

export const PersonalTrackersPanel: React.FC<PersonalTrackersPanelProps> = ({
  trackers,
  onUpdate,
  touchFriendly = false,
  showHeader = false,
  onClose,
}) => {
  return (
    <div>
      {showHeader && (
        <>
          <div className="flex items-center justify-between pb-2">
            <span className="font-display text-xs font-bold tracking-wider uppercase text-amber-200">
              Garou Trait Pips
            </span>
            {onClose && (
              <IconButton
                label="Close trackers"
                icon={<X className="h-3.5 w-3.5" />}
                size="sm"
                className="h-7 w-7"
                onClick={onClose}
              />
            )}
          </div>
          <div className="w20-gold-divider mb-3" />
        </>
      )}

      <div className={touchFriendly ? 'space-y-4' : 'space-y-3'}>
        <W20DotRow
          label="Rage"
          value={trackers.rage}
          tone="crimson"
          touchFriendly={touchFriendly}
          onChange={(rage) => onUpdate({ rage })}
        />
        <W20DotRow
          label="Gnosis"
          value={trackers.gnosis}
          tone="cyan"
          touchFriendly={touchFriendly}
          onChange={(gnosis) => onUpdate({ gnosis })}
        />
        <W20DotRow
          label="Willpower"
          value={trackers.willpower}
          tone="indigo"
          touchFriendly={touchFriendly}
          onChange={(willpower) => onUpdate({ willpower })}
        />
      </div>

      <div className="w20-gold-divider my-3" />

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-display font-bold tracking-wider uppercase text-stone-300">
          <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
          Wound Penalty
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {WOUND_OPTIONS.map((opt) => {
            const active = trackers.woundPenalty === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  diceSoundEngine.playPipClick();
                  onUpdate({ woundPenalty: opt.value });
                }}
                className={`flex flex-col items-center rounded-lg border px-1.5 ${
                  touchFriendly ? 'min-h-[44px] justify-center py-1.5' : 'py-1'
                } text-xs transition ${
                  active
                    ? opt.value === 0
                      ? 'border-emerald-500/70 bg-emerald-950/70 text-emerald-200'
                      : 'border-red-500/80 bg-red-950/80 text-red-100 shadow-[0_0_10px_rgba(185,28,28,0.45)]'
                    : 'border-stone-700/60 bg-zinc-950/80 text-stone-400 hover:border-stone-500'
                }`}
              >
                <span className="font-mono text-xs font-extrabold">{opt.tag}</span>
                <span className="text-xs">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface PersonalTrackersControlProps {
  trackers: LightGarouTrackers;
  onUpdate: (patch: Partial<LightGarouTrackers>) => void;
  inlineContentOnly?: boolean;
  touchFriendly?: boolean;
}

export const PersonalTrackersControl: React.FC<PersonalTrackersControlProps> = ({
  trackers,
  onUpdate,
  inlineContentOnly = false,
  touchFriendly = false,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  usePopoverDismiss({
    open: open && !inlineContentOnly,
    onClose: () => setOpen(false),
    containerRef,
    triggerRef,
  });

  if (inlineContentOnly) {
    return (
      <PersonalTrackersPanel
        trackers={trackers}
        onUpdate={onUpdate}
        touchFriendly={touchFriendly}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Compact Summary Pill */}
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Rage ${trackers.rage}, Gnosis ${trackers.gnosis}, Willpower ${trackers.willpower}. Adjust trackers`}
        className="w20-obsidian-panel flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs transition hover:border-amber-500/45"
        title="Click to adjust personal W20 Rage, Gnosis, Willpower & Wound trackers"
      >
        <span className="flex items-center gap-1 font-mono font-bold text-red-300">
          <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.85)]" />
          R {trackers.rage}
        </span>
        <span className="flex items-center gap-1 font-mono font-bold text-cyan-200">
          <span className="h-2 w-2 rounded-full bg-gnosis shadow-glow-cyan" />
          G {trackers.gnosis}
        </span>
        <span className="flex items-center gap-1 font-mono font-bold text-indigo-200">
          <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.8)]" />
          W {trackers.willpower}
        </span>
        {trackers.woundPenalty !== 0 ? (
          <span className="rounded-full border border-red-700/80 bg-red-950/90 px-1.5 py-0.5 font-mono text-xs font-bold text-red-200">
            {trackers.woundPenalty}
          </span>
        ) : (
          <span className="hidden font-mono text-xs text-stone-400 xl:inline">No wounds</span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 text-amber-300/75 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Popover with Clickable 10-Dot Pips + Wound Selector */}
      {open && (
        <div
          role="dialog"
          aria-label="Rage, Gnosis, Willpower and wound trackers"
          className="w20-obsidian-panel absolute right-0 top-full z-modal mt-2 w-[310px] rounded-xl p-3.5 shadow-2xl"
        >
          <PersonalTrackersPanel
            trackers={trackers}
            onUpdate={onUpdate}
            touchFriendly={touchFriendly}
            showHeader
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
};
