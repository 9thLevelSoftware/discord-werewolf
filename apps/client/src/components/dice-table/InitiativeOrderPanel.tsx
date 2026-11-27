import React, { useMemo } from 'react';
import type { TableInitiativeEntry } from '@w20-vtt/protocol';
import { Zap } from 'lucide-react';
import { ConfirmButton, cx } from '../ui';

export type RankedInitiativeEntry = TableInitiativeEntry & {
  /** 1-based position. Entries with the same total share a position. */
  rank: number;
  tied: boolean;
};

/**
 * Highest total acts first. Equal totals share a rank and are flagged as tied;
 * the table settles ties itself (in W20, usually by comparing Dexterity + Wits).
 */
export function rankInitiative(entries: TableInitiativeEntry[]): RankedInitiativeEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.total !== b.total) return b.total - a.total;
    if (a.source === 'storyteller') return b.source === 'storyteller' ? 0 : 1;
    if (b.source === 'storyteller') return -1;
    return a.rolledAt - b.rolledAt;
  });
  const counts = new Map<number, number>();
  for (const entry of sorted) {
    counts.set(entry.total, (counts.get(entry.total) ?? 0) + 1);
  }
  let rank = 0;
  let previousTotal: number | null = null;
  return sorted.map((entry, index) => {
    if (entry.total !== previousTotal) {
      rank = index + 1;
      previousTotal = entry.total;
    }
    return { ...entry, rank, tied: (counts.get(entry.total) ?? 0) > 1 };
  });
}

export interface InitiativeOrderPanelProps {
  entries: TableInitiativeEntry[];
  /** The local player's Discord id, to mark their own seats. */
  currentUserId: string;
  onClear: () => void;
  /** Larger touch targets for the mobile sheet. */
  touch?: boolean;
  /** The room can have private initiative even when its shared order is empty. */
  hasPrivateInitiative?: boolean;
}

/** The table's shared initiative order, built from everyone's latest initiative roll. */
export const InitiativeOrderPanel: React.FC<InitiativeOrderPanelProps> = ({
  entries,
  currentUserId,
  onClear,
  touch = false,
  hasPrivateInitiative = false,
}) => {
  const ranked = useMemo(() => rankInitiative(entries), [entries]);

  return (
    <section aria-label="Initiative order" className="space-y-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className="font-display flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase text-amber-200">
          <Zap className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          Initiative
        </h3>
        {(ranked.length > 0 || hasPrivateInitiative) && (
          <ConfirmButton
            variant="ghost"
            size={touch ? 'md' : 'sm'}
            prompt="Clear initiative for everyone?"
            confirmLabel="Clear"
            onConfirm={onClear}
          >
            Clear
          </ConfirmButton>
        )}
      </div>

      {ranked.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-700/60 bg-zinc-950/50 px-3 py-3 text-xs text-stone-400">
          No one has rolled initiative yet. Each player presses Init to join the order.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {ranked.map((entry) => {
            const mine = entry.source !== 'storyteller' && entry.discordUserId === currentUserId;
            return (
              <li
                key={entry.participantKey}
                className={cx(
                  'flex items-center gap-2 rounded-xl border px-2.5',
                  touch ? 'min-h-11' : 'min-h-9',
                  mine ? 'border-amber-500/55 bg-amber-950/25' : 'border-stone-800 bg-zinc-950/80'
                )}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 font-mono text-xs font-bold text-amber-300"
                  aria-label={`Position ${entry.rank}`}
                >
                  {entry.rank}
                </span>
                <span className="min-w-0 flex-1 break-words py-1 text-xs font-semibold text-amber-50">
                  {entry.displayName}
                  {mine && <span className="font-normal text-stone-400"> (you)</span>}
                </span>
                {entry.tied && (
                  <span
                    className="shrink-0 rounded border border-stone-600 px-1.5 py-0.5 text-xs font-semibold text-stone-300"
                    title="Same total as another seat. Settle the tie at the table."
                  >
                    Tie
                  </span>
                )}
                <span
                  className="font-display shrink-0 text-base font-black tabular-nums text-amber-200"
                  aria-label={`Initiative ${entry.total}`}
                >
                  {entry.total}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
