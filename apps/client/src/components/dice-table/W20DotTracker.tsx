import React, { useEffect, useRef, useState } from 'react';
import type { LightGarouTrackers, LightWoundPenalty } from '@w20-vtt/protocol';
import { ChevronDown, ShieldAlert, X } from 'lucide-react';
import { diceSoundEngine } from '../../audio/DiceSoundEngine';

type DotTone = 'crimson' | 'amber' | 'indigo';

const WOUND_OPTIONS: Array<{ value: LightWoundPenalty; label: string; tag: string }> = [
  { value: 0, label: 'Bruised', tag: '0' },
  { value: -1, label: 'Hurt', tag: '-1' },
  { value: -2, label: 'Wounded', tag: '-2' },
  { value: -5, label: 'Crippled', tag: '-5' },
];

const TONE_CLASSES: Record<DotTone, { label: string; filled: string; empty: string }> = {
  crimson: {
    label: 'text-red-300',
    filled:
      'border-red-300/80 bg-gradient-to-br from-red-500 to-red-900 shadow-[0_0_8px_rgba(220,38,38,0.68)]',
    empty: 'border-stone-600/55 bg-zinc-950/90 hover:border-red-500/70',
  },
  amber: {
    label: 'text-amber-200',
    filled:
      'border-amber-200/85 bg-gradient-to-br from-amber-300 to-amber-700 shadow-[0_0_8px_rgba(245,158,11,0.58)]',
    empty: 'border-stone-600/55 bg-zinc-950/90 hover:border-amber-400/70',
  },
  indigo: {
    label: 'text-indigo-200',
    filled:
      'border-indigo-200/85 bg-gradient-to-br from-indigo-400 to-indigo-800 shadow-[0_0_8px_rgba(129,140,248,0.58)]',
    empty: 'border-stone-600/55 bg-zinc-950/90 hover:border-indigo-400/70',
  },
};

interface W20DotRowProps {
  label: string;
  value: number;
  max?: number;
  tone: DotTone;
  onChange: (nextValue: number) => void;
}

export const W20DotRow: React.FC<W20DotRowProps> = ({
  label,
  value,
  max = 10,
  tone,
  onChange,
}) => {
  const styles = TONE_CLASSES[tone];
  const clamped = Math.max(0, Math.min(max, value));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className={`font-display font-bold tracking-wider uppercase ${styles.label}`}>
          {label}
        </span>
        <span className="font-mono text-[11px] font-bold text-stone-300">
          {clamped}/{max}
        </span>
      </div>
      <div className="flex items-center justify-between gap-1" role="group" aria-label={label}>
        {Array.from({ length: max }, (_, idx) => {
          const rating = idx + 1;
          const active = rating <= clamped;
          return (
            <button
              key={rating}
              type="button"
              onClick={() => {
                diceSoundEngine.playPipClick();
                onChange(clamped === 1 && rating === 1 ? 0 : rating);
              }}
              aria-label={`Set ${label} to ${clamped === 1 && rating === 1 ? 0 : rating}`}
              aria-pressed={active}
              className={`h-4 w-4 rounded-full border transition-transform duration-100 hover:scale-110 focus:outline-none focus:ring-1 focus:ring-amber-400/60 ${
                active ? styles.filled : styles.empty
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};

interface PersonalTrackersControlProps {
  trackers: LightGarouTrackers;
  onUpdate: (patch: Partial<LightGarouTrackers>) => void;
}

export const PersonalTrackersControl: React.FC<PersonalTrackersControlProps> = ({
  trackers,
  onUpdate,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Compact Summary Pill */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w20-obsidian-panel flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[11px] transition hover:border-amber-500/45"
        title="Click to adjust personal W20 Rage, Gnosis, Willpower & Wound trackers"
      >
        <span className="flex items-center gap-1 font-mono font-bold text-red-300">
          <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.85)]" />
          R {trackers.rage}
        </span>
        <span className="flex items-center gap-1 font-mono font-bold text-amber-200">
          <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
          G {trackers.gnosis}
        </span>
        <span className="flex items-center gap-1 font-mono font-bold text-indigo-200">
          <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.8)]" />
          W {trackers.willpower}
        </span>
        {trackers.woundPenalty !== 0 ? (
          <span className="rounded-full border border-red-700/80 bg-red-950/90 px-1.5 py-0.2 font-mono text-[10px] font-bold text-red-200">
            {trackers.woundPenalty}
          </span>
        ) : (
          <span className="hidden font-mono text-[10px] text-stone-400 sm:inline">0 Wnd</span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 text-amber-300/75 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Popover with Clickable 10-Dot Pips + Wound Selector */}
      {open && (
        <div className="w20-obsidian-panel absolute right-0 top-full z-50 mt-2 w-[310px] rounded-xl p-3.5 shadow-2xl">
          <div className="flex items-center justify-between pb-2">
            <span className="font-display text-xs font-bold tracking-wider uppercase text-amber-200">
              Garou Trait Pips
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-stone-400 hover:bg-zinc-800/80 hover:text-stone-100"
              aria-label="Close trackers"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="w20-gold-divider mb-3" />

          <div className="space-y-3">
            <W20DotRow
              label="Rage"
              value={trackers.rage}
              tone="crimson"
              onChange={(rage) => onUpdate({ rage })}
            />
            <W20DotRow
              label="Gnosis"
              value={trackers.gnosis}
              tone="amber"
              onChange={(gnosis) => onUpdate({ gnosis })}
            />
            <W20DotRow
              label="Willpower"
              value={trackers.willpower}
              tone="indigo"
              onChange={(willpower) => onUpdate({ willpower })}
            />
          </div>

          <div className="w20-gold-divider my-3" />

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-display font-bold tracking-wider uppercase text-stone-300">
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
                    onClick={() => {
                      diceSoundEngine.playPipClick();
                      onUpdate({ woundPenalty: opt.value });
                    }}
                    className={`flex flex-col items-center rounded-lg border px-1.5 py-1 text-[10px] transition ${
                      active
                        ? opt.value === 0
                          ? 'border-emerald-500/70 bg-emerald-950/70 text-emerald-200'
                          : 'border-red-500/80 bg-red-950/80 text-red-100 shadow-[0_0_10px_rgba(185,28,28,0.45)]'
                        : 'border-stone-700/60 bg-zinc-950/80 text-stone-400 hover:border-stone-500'
                    }`}
                  >
                    <span className="font-mono text-xs font-extrabold">{opt.tag}</span>
                    <span className="text-[9px]">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
