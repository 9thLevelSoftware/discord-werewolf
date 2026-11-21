import React from 'react';
import type { RollHistoryEntry } from '@w20-vtt/protocol';
import { ChevronRight, EyeOff, RotateCcw, ScrollText, X } from 'lucide-react';
import {
  AuthoritativeDieChips,
  ParticipantAvatar,
  formatRollTime,
} from './DieFaceTiles';

interface RollFeedDrawerProps {
  open: boolean;
  rollHistory: RollHistoryEntry[];
  disabled: boolean;
  mobileSheet?: boolean;
  onClose: () => void;
  onReroll: (entry: RollHistoryEntry) => void;
}

export const RollFeedDrawer: React.FC<RollFeedDrawerProps> = ({
  open,
  rollHistory,
  disabled,
  mobileSheet = false,
  onClose,
  onReroll,
}) => {
  if (!open) return null;

  const asideClasses = mobileSheet
    ? 'w20-obsidian-panel pb-safe fixed inset-x-0 bottom-0 top-auto z-50 flex max-h-[78dvh] w-full flex-col rounded-t-2xl border-t border-x-0 border-b-0 shadow-2xl'
    : 'w20-obsidian-panel absolute inset-y-0 right-0 z-40 flex w-[330px] shrink-0 flex-col border-y-0 border-r-0 lg:static lg:z-20';

  const content = (
    <aside className={asideClasses}>
      {mobileSheet && (
        <div className="flex justify-center pt-2 pb-0.5">
          <span className="h-1 w-10 rounded-full bg-stone-600/75" />
        </div>
      )}
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-amber-300" />
          <h2 className="font-display text-xs font-bold tracking-wider uppercase text-amber-100">
            Chronicle of Rolls
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-stone-400 hover:bg-zinc-800/80 hover:text-stone-100"
          aria-label="Collapse Chronicle of Rolls"
        >
          {mobileSheet ? <X className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      <div className="w20-gold-divider" />

      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {rollHistory.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-700/60 bg-zinc-950/50 p-6 text-center text-xs text-stone-400">
            <p className="font-display text-amber-200/80 uppercase tracking-wider">
              The Felt Awaits
            </p>
            <p className="mt-1 text-[11px] text-stone-500">
              Every thrown pool in this voice table is inscribed here.
            </p>
          </div>
        ) : (
          rollHistory.map((entry) => {
            const isSuccess = entry.roll.netSuccesses > 0;
            const cardAccent = entry.roll.isBotch
              ? 'border-red-600/75 bg-red-950/25'
              : isSuccess
                ? 'border-emerald-700/55 bg-zinc-950/85'
                : 'border-stone-800/90 bg-zinc-950/75';

            return (
              <article
                key={entry.id}
                className={`rounded-xl border p-2.5 shadow-inner transition ${cardAccent}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ParticipantAvatar
                      name={entry.rollerName}
                      avatarUrl={entry.rollerAvatarUrl}
                      sizeClass="h-6 w-6 shrink-0"
                    />
                    <div className="min-w-0 leading-tight">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-bold text-amber-50">
                          {entry.rollerName}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-stone-500">
                          {formatRollTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-stone-400">
                        {entry.label} • Diff {entry.roll.clampedDifficulty}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onReroll(entry)}
                    disabled={disabled}
                    title="Load settings & throw again"
                    className="flex shrink-0 items-center gap-1 rounded-md border border-stone-700/75 bg-zinc-900/90 px-2 py-1 text-[10px] font-bold text-stone-300 transition hover:border-amber-500/55 hover:text-amber-100 disabled:opacity-40"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Re-roll
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                      entry.roll.isBotch
                        ? 'bg-red-700 text-white shadow-[0_0_8px_rgba(185,28,28,0.65)]'
                        : isSuccess
                          ? 'bg-emerald-950/90 text-emerald-200 border border-emerald-600/45'
                          : 'bg-zinc-900 text-stone-400 border border-stone-800'
                    }`}
                  >
                    {entry.roll.isBotch
                      ? 'Botch'
                      : isSuccess
                        ? `${entry.roll.netSuccesses} Net (${entry.roll.outcome})`
                        : 'Failure'}
                  </span>
                  {entry.isSecretRoll && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-950/70 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
                      <EyeOff className="h-2.5 w-2.5" /> Secret
                    </span>
                  )}
                  {entry.roll.automaticSuccesses > 0 && (
                    <span className="rounded border border-indigo-500/40 bg-indigo-950/80 px-1.5 py-0.5 text-[9px] font-bold text-indigo-200">
                      +{entry.roll.automaticSuccesses} WP
                    </span>
                  )}
                  {entry.rageDiceCount > 0 && (
                    <span className="rounded border border-red-700/50 bg-red-950/70 px-1.5 py-0.5 text-[9px] font-bold text-red-200">
                      {entry.rageDiceCount} Rage
                    </span>
                  )}
                </div>

                {entry.roll.dice.length > 0 && (
                  <div className="mt-2">
                    <AuthoritativeDieChips
                      roll={entry.roll}
                      rageDiceCount={entry.rageDiceCount}
                      compact
                    />
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </aside>
  );

  if (!mobileSheet) {
    return content;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      {content}
    </>
  );
};
