import React, { useRef, useState } from 'react';
import { Monitor, Settings, Smartphone, Volume2, VolumeX } from 'lucide-react';
import type { SpecialtyMode } from '@w20-vtt/core';
import type { ViewportLayoutMode } from '../../../hooks/useViewportLayout';
import { cx } from '../../ui';
import { usePopoverDismiss } from '../../ui/usePopoverDismiss';

const LAYOUT_LABELS: Record<ViewportLayoutMode, string> = {
  auto: 'Auto',
  mobile: 'Mobile',
  desktop: 'PC',
};

const NEXT_LAYOUT: Record<ViewportLayoutMode, string> = {
  auto: 'Mobile',
  mobile: 'PC',
  desktop: 'Auto',
};

export interface TableSettingsMenuProps {
  muted: boolean;
  /** 0 to 1. */
  volume: number;
  layoutMode: ViewportLayoutMode;
  specialtyMode: SpecialtyMode;
  canChangeSpecialtyMode: boolean;
  onToggleMute: () => void;
  onVolumeChange: (percent: number) => void;
  onCycleLayoutMode: () => void;
  onSetSpecialtyMode: (mode: SpecialtyMode) => void;
}

/**
 * Settings used once in a while (dice sound, layout) kept behind one button, so the
 * top bar only shows what a player needs while rolling.
 */
export const TableSettingsMenu: React.FC<TableSettingsMenuProps> = ({
  muted,
  volume,
  layoutMode,
  specialtyMode,
  canChangeSpecialtyMode,
  onToggleMute,
  onVolumeChange,
  onCycleLayoutMode,
  onSetSpecialtyMode,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  usePopoverDismiss({ open, onClose: () => setOpen(false), containerRef, triggerRef });

  const volumePercent = muted ? 0 : Math.round(volume * 100);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Table settings"
        title="Table settings"
        className={cx(
          'w20-obsidian-panel flex h-8 w-8 items-center justify-center rounded-full transition hover:border-amber-400/55',
          open ? '!border-amber-500/50 text-amber-200' : 'text-stone-200'
        )}
      >
        {muted ? (
          <VolumeX className="h-3.5 w-3.5 text-red-400" />
        ) : (
          <Settings className="h-3.5 w-3.5 text-amber-300" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Table settings"
          className="w20-obsidian-panel animate-pop-in absolute right-0 top-full z-modal mt-2 w-64 space-y-3 rounded-xl p-3 text-xs"
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-200">Dice sound</span>
              <button
                type="button"
                onClick={onToggleMute}
                aria-pressed={muted}
                className={cx(
                  'flex h-7 items-center gap-1.5 rounded-lg border px-2 font-semibold transition',
                  muted
                    ? 'border-red-700/70 bg-red-950/60 text-red-200'
                    : 'border-stone-700 bg-obsidian-950 text-stone-300 hover:border-stone-500'
                )}
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {muted ? 'Muted' : 'Mute'}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={volumePercent}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label="Dice sound volume"
              className="h-1.5 w-full cursor-pointer accent-amber-400"
            />
          </div>

          <div className="w20-gold-divider" />

          <label className="block space-y-1.5">
            <span className="block font-semibold text-stone-200">Shared specialty mode</span>
            <select
              value={specialtyMode}
              disabled={!canChangeSpecialtyMode}
              onChange={(e) => onSetSpecialtyMode(e.target.value as SpecialtyMode)}
              className="w-full rounded-lg border border-stone-700 bg-obsidian-950 px-2 py-1.5 text-stone-200 disabled:opacity-60"
            >
              <option value="w20_double">W20 · 10s count twice</option>
              <option value="revised_explode">Revised · 10s explode</option>
            </select>
          </label>

          <div className="w20-gold-divider" />

          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-stone-200">Layout</span>
              <p className="text-stone-400">Auto fits your window.</p>
            </div>
            <button
              type="button"
              onClick={onCycleLayoutMode}
              title={`Switch to ${NEXT_LAYOUT[layoutMode]}`}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-stone-700 bg-obsidian-950 px-2 font-semibold text-stone-200 transition hover:border-stone-500"
            >
              {layoutMode === 'mobile' ? (
                <Smartphone className="h-3.5 w-3.5 text-amber-300" />
              ) : (
                <Monitor className="h-3.5 w-3.5 text-amber-300" />
              )}
              {LAYOUT_LABELS[layoutMode]}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
