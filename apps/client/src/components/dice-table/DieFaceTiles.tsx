import React, { useMemo } from 'react';
import type { W20RollResult } from '@w20-vtt/core';
import { EyeOff, X } from 'lucide-react';
import type { Queued3DRoll } from '../../store/useVttRoomStore';

export interface DecoratedDie {
  value: number;
  contributedSuccesses: number;
  isOne: boolean;
  isBonusExplosionDie: boolean;
  isCanceled: boolean;
  isRageDie: boolean;
}

export function buildDecoratedFaces(roll: W20RollResult, rageDiceCount: number): DecoratedDie[] {
  const clampedRage = Math.min(roll.effectivePool, Math.max(0, rageDiceCount));
  const obsidianCount = Math.max(0, roll.effectivePool - clampedRage);

  let nonBonusIdx = 0;
  const withRageFlag = roll.dice.map((die) => {
    let isRageDie = false;
    if (!die.isBonusExplosionDie) {
      isRageDie = nonBonusIdx >= obsidianCount;
      nonBonusIdx += 1;
    }
    return { ...die, isRageDie };
  });

  const sorted = [...withRageFlag].sort((a, b) => b.value - a.value);
  let remainingCancels = roll.onesRolled;

  return sorted.map((die) => {
    const isSuccess = die.contributedSuccesses > 0;
    let isCanceled = false;
    if (isSuccess && remainingCancels > 0) {
      isCanceled = true;
      remainingCancels -= 1;
    }
    return {
      value: die.value,
      contributedSuccesses: die.contributedSuccesses,
      isOne: die.isOne,
      isBonusExplosionDie: die.isBonusExplosionDie,
      isCanceled,
      isRageDie: die.isRageDie,
    };
  });
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'W';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function formatRollTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const ParticipantAvatar: React.FC<{
  name: string;
  avatarUrl: string | null;
  isSpeaking?: boolean;
  isConnected?: boolean;
  sizeClass?: string;
}> = ({ name, avatarUrl, isSpeaking = false, isConnected = true, sizeClass = 'h-8 w-8' }) => {
  const ringClass = isSpeaking
    ? 'ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]'
    : 'ring-1 ring-amber-400/35';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover ${ringClass} ${isConnected ? '' : 'grayscale opacity-50'}`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} font-display flex items-center justify-center rounded-full bg-gradient-to-br from-zinc-800 to-zinc-950 text-xs font-bold text-amber-100 ${ringClass} ${isConnected ? '' : 'opacity-50'}`}
    >
      {getInitials(name)}
    </div>
  );
};

export const AuthoritativeDieChips: React.FC<{
  roll: W20RollResult;
  rageDiceCount: number;
  compact?: boolean;
}> = ({ roll, rageDiceCount, compact = false }) => {
  const isInitiative = roll.rollMode === 'initiative';
  const faces = useMemo(() => buildDecoratedFaces(roll, rageDiceCount), [roll, rageDiceCount]);
  const chipSize = compact ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {faces.map((die, idx) => {
        const isSuccess = die.contributedSuccesses > 0;
        let style =
          'border-stone-700/75 bg-gradient-to-b from-zinc-800/90 to-zinc-950 text-stone-400';
        if (isInitiative) {
          style =
            'border-amber-400/90 bg-gradient-to-b from-amber-900/90 to-zinc-950 text-amber-100 shadow-[0_0_10px_rgba(245,158,11,0.35)]';
        } else if (die.isOne) {
          style =
            'border-red-500/85 bg-gradient-to-b from-red-950 to-zinc-950 text-red-300 shadow-[0_0_8px_rgba(220,38,38,0.4)]';
        } else if (die.isCanceled) {
          style =
            'border-stone-700/50 bg-zinc-900/60 text-stone-400 line-through decoration-red-400/80 decoration-2';
        } else if (isSuccess) {
          style =
            'border-emerald-500/75 bg-gradient-to-b from-emerald-950/90 to-zinc-950 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.3)]';
        }

        const rageRing =
          !isInitiative && die.isRageDie
            ? 'ring-1 ring-red-500/80 ring-offset-1 ring-offset-zinc-950'
            : '';

        return (
          <div
            key={idx}
            className={`font-display relative flex ${chipSize} items-center justify-center rounded-lg border font-bold shadow ${style} ${rageRing}`}
            title={
              isInitiative
                ? `Initiative 1d10: ${die.value}`
                : [
                    die.isRageDie ? 'Rage Die' : 'Obsidian Die',
                    die.isOne
                      ? 'Rolled 1 (Cancels a success)'
                      : die.isCanceled
                        ? 'Success canceled by a 1'
                        : die.contributedSuccesses === 2
                          ? 'Specialty 10 (2 Successes)'
                          : die.isBonusExplosionDie
                            ? 'Specialty Bonus Explosion'
                            : '',
                  ]
                    .filter(Boolean)
                    .join(' • ')
            }
          >
            {die.value}
            {!isInitiative && die.contributedSuccesses === 2 && !die.isCanceled && (
              <span className="absolute -top-1.5 -right-1.5 rounded border border-amber-300/80 bg-gradient-to-b from-amber-300 to-amber-600 px-1 font-sans text-xs font-black text-zinc-950 shadow">
                x2
              </span>
            )}
            {!isInitiative && die.isRageDie && (
              <span className="absolute -bottom-0.5 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ActiveThrowPill: React.FC<{
  activeThrowLabel: string | null;
  queuedCount: number;
  compact?: boolean;
  /** Desktop only: distance from the top of the stage, below the measured top bar. */
  topOffset?: number;
}> = ({ activeThrowLabel, queuedCount, compact = false, topOffset }) => (
  <div
    role="status"
    aria-live="polite"
    style={!compact && topOffset !== undefined ? { top: topOffset } : undefined}
    className={`w20-obsidian-panel pointer-events-none absolute left-1/2 z-20 flex max-w-[min(92vw,520px)] -translate-x-1/2 items-center gap-2 rounded-full !border-amber-500/45 px-3.5 py-1.5 shadow-xl ${
      compact ? 'top-14 mt-[env(safe-area-inset-top,0px)] text-xs' : 'top-16 text-xs'
    }`}
  >
    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
    <span className="truncate font-semibold text-amber-100">
      Rolling: {activeThrowLabel || 'W20 Dice Pool'}
    </span>
    {queuedCount > 0 && (
      <span className="shrink-0 rounded-full border border-amber-400/50 bg-amber-950/80 px-2 py-0.5 font-mono text-xs font-extrabold text-amber-200">
        +{queuedCount} queued
      </span>
    )}
  </div>
);

interface RollResultPlaqueProps {
  banner: Queued3DRoll;
  onDismiss: () => void;
  compact?: boolean;
  queuedCount?: number;
  nextQueuedLabel?: string | null;
  /** Desktop only: distance from the top of the stage, below the measured top bar. */
  topOffset?: number;
}

export const RollResultPlaque: React.FC<RollResultPlaqueProps> = ({
  banner,
  onDismiss,
  compact = false,
  queuedCount = 0,
  nextQueuedLabel = null,
  topOffset,
}) => {
  const isInitiative = banner.roll.rollMode === 'initiative';
  const initDie = banner.roll.dice[0]?.value ?? 0;
  const initMod = banner.roll.initiativeModifier ?? 0;
  const initTotal = banner.roll.initiativeTotal ?? initDie + initMod;
  const modExpr = initMod >= 0 ? `+ ${initMod}` : `- ${Math.abs(initMod)}`;

  const accentBorder = isInitiative
    ? '!border-amber-400/80'
    : banner.roll.isBotch
      ? '!border-red-500/85'
      : banner.roll.netSuccesses > 0
        ? '!border-emerald-500/70'
        : '';

  const summaryText = isInitiative
    ? `Initiative: ${initTotal}`
    : banner.roll.isBotch
      ? compact
        ? 'Botch!'
        : 'Catastrophic Botch'
      : banner.roll.netSuccesses > 0
        ? compact
          ? `${banner.roll.netSuccesses} Net (${banner.roll.outcome})`
          : `${banner.roll.netSuccesses} Net ${
              banner.roll.netSuccesses === 1 ? 'Success' : 'Successes'
            } (${banner.roll.outcome})`
        : compact
          ? 'Failure (0 Net)'
          : 'Failure — 0 Net Successes';

  return (
    <div
      onClick={onDismiss}
      role="status"
      aria-live="polite"
      style={!compact && topOffset !== undefined ? { top: topOffset } : undefined}
      className={`w20-obsidian-panel absolute left-1/2 z-20 -translate-x-1/2 cursor-pointer transition hover:brightness-105 ${
        compact
          ? 'top-14 mt-[env(safe-area-inset-top,0px)] w-[min(94%,440px)] rounded-xl px-3 py-2'
          : 'top-16 w-[min(92%,560px)] rounded-2xl px-4 py-3'
      } ${accentBorder}`}
    >
      <div className={`flex items-start justify-between ${compact ? 'gap-2' : 'gap-4'}`}>
        <div className={`flex min-w-0 items-center ${compact ? 'gap-2' : 'gap-3'}`}>
          <ParticipantAvatar
            name={banner.rollerName ?? 'Player'}
            avatarUrl={banner.rollerAvatarUrl ?? null}
            sizeClass={compact ? 'h-7 w-7 shrink-0' : 'h-9 w-9 shrink-0'}
          />
          <div className="min-w-0">
            <div
              className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium text-stone-300 ${
                compact ? 'text-xs' : 'text-xs'
              }`}
            >
              <span className="max-w-[140px] truncate font-bold text-amber-100">
                {banner.rollerName ?? 'Player'}
              </span>
              <span className="text-stone-500">•</span>
              <span className="max-w-[140px] truncate">{banner.label}</span>
              <span className="text-stone-500">•</span>
              <span className="font-mono text-amber-300/90">
                {isInitiative
                  ? `1d10 [${initDie}] ${modExpr}`
                  : `Diff ${banner.roll.clampedDifficulty}`}
              </span>
              {banner.isSecretRoll && (
                <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/50 bg-amber-950/80 px-1.5 py-0.5 text-xs font-bold text-amber-200">
                  <EyeOff className="h-2.5 w-2.5" /> Secret
                </span>
              )}
            </div>
            <p
              className={`font-display mt-0.5 font-black tracking-wide uppercase ${
                compact ? 'text-sm leading-tight' : 'text-base'
              } ${
                isInitiative
                  ? 'text-amber-200'
                  : banner.roll.isBotch
                    ? 'text-red-300'
                    : banner.roll.netSuccesses > 0
                      ? 'text-emerald-300'
                      : 'text-stone-300'
              }`}
            >
              {summaryText}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!isInitiative && banner.roll.automaticSuccesses > 0 && (
            <span className="rounded-full border border-indigo-400/50 bg-indigo-950/80 px-2 py-0.5 text-xs font-bold text-indigo-200">
              +{banner.roll.automaticSuccesses} WP
            </span>
          )}
          <button
            type="button"
            aria-label={
              queuedCount > 0 ? 'Dismiss result and show the next roll' : 'Dismiss roll result'
            }
            title="Dismiss (the dice stay on the felt)"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-300 transition hover:bg-obsidian-800 hover:text-parchment"
          >
            <X className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
        </div>
      </div>

      {banner.roll.dice.length > 0 && (
        <div className={compact ? 'mt-1.5' : 'mt-2.5'}>
          <AuthoritativeDieChips
            roll={banner.roll}
            rageDiceCount={banner.rageDiceCount ?? 0}
            compact={compact}
          />
        </div>
      )}

      {queuedCount > 0 && (
        <div
          className={`flex items-center justify-between gap-2 border-t border-amber-500/20 pt-1.5 ${
            compact ? 'mt-1.5 text-xs' : 'mt-2.5 text-xs'
          }`}
        >
          <p className="min-w-0 truncate text-stone-300">
            <span className="font-mono font-extrabold text-amber-300">
              +{queuedCount} queued
            </span>
            {nextQueuedLabel ? ` • Next: ${nextQueuedLabel}` : ''}
          </p>
          <span className="shrink-0 font-semibold text-amber-200/85">
            {compact ? 'Tap next ›' : 'Click to advance ›'}
          </span>
        </div>
      )}
    </div>
  );
};
