import React from 'react';
import type { PendingActivationChoice, RollHistoryEntry, RollReplacementOption } from '@w20-vtt/protocol';
import { ChevronRight, EyeOff, RotateCcw, ScrollText } from 'lucide-react';
import { ModifierBreakdown } from './RuleRollReview';
import { Button, IconButton, Modal } from '../ui';
import { RollReplacementActions } from './RollReplacementActions';
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
  replacementOptions: RollReplacementOption[];
  onReplace: (option: RollReplacementOption) => void;
  pendingActivations: PendingActivationChoice[];
  onReviewActivation: (id: string) => void;
  onReroll: (entry: RollHistoryEntry) => void;
}

export const RollFeedDrawer: React.FC<RollFeedDrawerProps> = ({
  open,
  rollHistory,
  disabled,
  mobileSheet = false,
  onClose,
  onReroll, replacementOptions, onReplace, pendingActivations, onReviewActivation,
}) => {
  if (!open) return null;

  const entries = (
    <>
        {pendingActivations.map((choice) => (
          <Button key={choice.rollId} size="sm" onClick={() => onReviewActivation(choice.rollId)}>
            Review {choice.label}
          </Button>
        ))}
        {rollHistory.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-stone-700/60 bg-zinc-950/50 px-4 py-8 text-center">
            <ScrollText className="h-6 w-6 text-gold-500" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-stone-200">No rolls yet</p>
            <p className="mt-1 text-xs text-stone-400">
              Rolls from everyone at this table appear here.
            </p>
          </div>
        ) : (
          rollHistory.map((entry) => {
            const isInitiative = entry.roll.rollMode === 'initiative';
            const initDie = entry.roll.dice[0]?.value ?? 0;
            const initMod = entry.roll.initiativeModifier ?? 0;
            const initTotal = entry.roll.initiativeTotal ?? initDie + initMod;
            const isSuccess = entry.roll.netSuccesses > 0;
            const cardAccent = isInitiative
              ? 'border-amber-500/55 bg-amber-950/20'
              : entry.roll.isBotch
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
                        <span className="shrink-0 font-mono text-xs text-stone-400">
                          {formatRollTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-stone-400">
                        {isInitiative
                          ? `${entry.label} • 1d10 ${initMod >= 0 ? `+${initMod}` : initMod}`
                          : `${entry.label} • Diff ${entry.roll.clampedDifficulty}`}
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    disabled={disabled}
                    aria-label={`Roll ${entry.label} again`}
                    title="Load these settings and roll again"
                    onClick={() => onReroll(entry)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Roll again
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {!pendingActivations.some((choice) => choice.rollId === entry.id) &&
                    <RollReplacementActions options={replacementOptions.filter((option) => option.rollId === entry.id)}
                      disabled={disabled} onChoose={onReplace} />}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {entry.rerollOf && <span className="text-xs text-amber-200">Replacement roll</span>}
                  {rollHistory.some((other) => other.rerollOf === entry.id) &&
                    <span className="text-xs text-stone-400">Replaced</span>}
                  {entry.roll.hasApplicableSpecialty && <span className="text-xs text-amber-200">
                    {entry.roll.specialtyMode === 'revised_explode' ? 'Specialty · exploding 10s' : 'Specialty · double 10s'}
                  </span>}
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-extrabold uppercase tracking-wide ${
                      isInitiative
                        ? 'border border-amber-500/50 bg-amber-950/90 text-amber-200'
                        : entry.roll.isBotch
                          ? 'bg-red-700 text-white shadow-[0_0_8px_rgba(185,28,28,0.65)]'
                          : isSuccess
                            ? 'bg-emerald-950/90 text-emerald-200 border border-emerald-600/45'
                            : 'bg-zinc-900 text-stone-400 border border-stone-800'
                    }`}
                  >
                    {isInitiative
                      ? `Initiative: ${initTotal}`
                      : entry.roll.isBotch
                        ? 'Botch'
                        : isSuccess
                          ? `${entry.roll.netSuccesses} Net (${entry.roll.outcome})`
                          : 'Failure'}
                  </span>
                  {entry.isSecretRoll && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-950/70 px-1.5 py-0.5 text-xs font-bold text-amber-200">
                      <EyeOff className="h-2.5 w-2.5" /> Secret
                    </span>
                  )}
                  {!isInitiative && entry.roll.automaticSuccesses > 0 && (
                    <span className="rounded border border-indigo-500/40 bg-indigo-950/80 px-1.5 py-0.5 text-xs font-bold text-indigo-200">
                      +{entry.roll.automaticSuccesses} automatic
                    </span>
                  )}
                  {!isInitiative && entry.rageDiceCount > 0 && (
                    <span className="rounded border border-red-700/50 bg-red-950/70 px-1.5 py-0.5 text-xs font-bold text-red-200">
                      {entry.rageDiceCount} Rage
                    </span>
                  )}
                </div>

                {!!entry.modifiers?.length && <details className="mt-2 text-xs"><summary className="cursor-pointer text-amber-200">Roll modifiers</summary><ModifierBreakdown modifiers={entry.modifiers}/></details>}
                <div className="mt-2">
                  <AuthoritativeDieChips roll={entry.roll} rageDiceCount={entry.rageDiceCount} compact />
                </div>
              </article>
            );
          })
        )}
    </>
  );

  if (mobileSheet) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Roll Log"
        variant="sheet"
        bodyClassName="space-y-2.5 p-3"
      >
        {entries}
      </Modal>
    );
  }

  return (
    <aside
      aria-label="Roll Log"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="w20-obsidian-panel absolute inset-y-0 right-0 z-drawer flex w-[330px] shrink-0 flex-col border-y-0 border-r-0 lg:static lg:z-20"
    >
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-amber-300" />
          <h2 className="font-display text-xs font-bold tracking-wider uppercase text-amber-100">
            Roll Log
          </h2>
        </div>
        <IconButton
          label="Collapse Roll Log"
          icon={<ChevronRight className="h-4 w-4" />}
          size="sm"
          onClick={onClose}
        />
      </div>

      <div className="w20-gold-divider" />

      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">{entries}</div>
    </aside>
  );
};
